#!/usr/bin/env node
// Kavis — kavis-rotalar.json içe aktarma script'i (TEK SEFERLİK).
//
// Girdi dosyasında (kavis-rotalar.json) koordinat YOK — her rota
// başlangıç/bitiş/ara nokta YER ADI ile tanımlı. Bu script her rota için:
//   1) Yer adlarını Mapbox Geocoding v6 (forward) ile gerçek koordinata
//      çevirir,
//   2) Sıralı koordinatları Mapbox Directions API'ye vererek GERÇEK yol
//      geometrisini + mesafeyi + süreyi üretir (uydurma veri YOK — bkz.
//      src/lib/map/directions.ts'teki aynı ilke),
//   3) routes tablosuna ekler.
//
// Bir yer adı geocode edilemezse o rota TAMAMEN ATLANIR (yanlış konuma
// rota kaydetmemek için) ve script sonunda özet raporlanır.
//
// KİMLİK: routes.creator_id bir profiles.id olmalı ve RLS
// (routes_insert_own) sadece "auth.uid() = creator_id" insert'e izin
// veriyor — yani script bir SERVICE ROLE KEY'e değil, gerçek bir
// kullanıcı OTURUMUNA ihtiyaç duyuyor. Bunun için özel bir "içerik"
// hesabı (kavis_rota_arsivi) kullanılıyor; ilk çalıştırmada oluşturulup
// parolası supabase/seed/.import-kavis-rotalar-credentials.json'a
// yazılıyor (bkz. .gitignore — asla commit edilmez).
//
// İDEMPOTENTLİK: routes.title üzerinde unique kısıt yok, bu yüzden script
// her rotayı eklemeden önce AYNI creator_id + AYNI title ile var olan bir
// satır olup olmadığını kontrol eder; varsa atlar (günceller DEĞİL —
// ikinci çalıştırma sadece eksik kalanları tamamlar).
//
// ÇALIŞTIRMA:
//   node --env-file=.env supabase/seed/import_kavis_rotalar.mjs
//   (isteğe bağlı ikinci argüman: farklı bir girdi JSON yolu)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !MAPBOX_TOKEN) {
  console.error(
    "Eksik ortam değişkeni — EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY ve " +
      "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN gerekli. `node --env-file=.env ...` ile çalıştırdığınızdan emin olun."
  );
  process.exit(1);
}

const INPUT_PATH = process.argv[2] ?? join(rootDir, "supabase/seed/kavis-rotalar.json");
const CREDENTIALS_PATH = join(__dirname, ".import-kavis-rotalar-credentials.json");

// src/features/routes/api/routesApi.ts'teki MAX_ROUTE_POINTS ile AYNI
// kalmalı — routes.path'te st_npoints <= 500 CHECK kısıtı var.
const MAX_ROUTE_POINTS = 500;

const SEED_ACCOUNT = {
  username: "kavis_rota_arsivi",
  email: "rota-arsivi@kavisapp.com",
  fullName: "Kavis Rota Arşivi",
};

const GEOCODE_DELAY_MS = 200; // Mapbox'a nazik davranmak için istekler arası küçük bekleme

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// Geo yardımcıları — src/shared/utils/geo.ts ile AYNI mantık, ama bu bir
// düz Node script'i (path alias/TS import'u çözemiyor), bu yüzden burada
// kasıtlı olarak KOPYALANDI. geo.ts değişirse burası elle senkron
// tutulmalı (sadece bu üç saf fonksiyon: mesafe + Douglas-Peucker
// sadeleştirme).
// ---------------------------------------------------------------------
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversineDistanceKm(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

function perpendicularDistanceKm(point, lineStart, lineEnd) {
  if (lineStart.latitude === lineEnd.latitude && lineStart.longitude === lineEnd.longitude) {
    return haversineDistanceKm(point, lineStart);
  }
  const x = point.longitude;
  const y = point.latitude;
  const x1 = lineStart.longitude;
  const y1 = lineStart.latitude;
  const x2 = lineEnd.longitude;
  const y2 = lineEnd.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const projection = { latitude: y1 + t * dy, longitude: x1 + t * dx };
  return haversineDistanceKm(point, projection);
}

function douglasPeucker(points, epsilonKm) {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistanceKm(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance > epsilonKm) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilonKm);
    const right = douglasPeucker(points.slice(maxIndex), epsilonKm);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function simplifyToMaxPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  let epsilonKm = 0.005;
  let simplified = points;
  for (let i = 0; i < 20 && simplified.length > maxPoints; i++) {
    simplified = douglasPeucker(points, epsilonKm);
    epsilonKm *= 1.8;
  }
  return simplified;
}

function toLineStringWkt(points) {
  return `LINESTRING(${points.map((p) => `${p.longitude} ${p.latitude}`).join(", ")})`;
}

// ---------------------------------------------------------------------
// Mapbox Geocoding v6 (forward) + Directions — src/lib/map/geocoding.ts
// ve directions.ts ile AYNI uç noktalar/parametreler, sadece burada
// Node'un yerleşik fetch'iyle (RN'e özgü rate-limit/AsyncStorage yok —
// bu tek seferlik bir script, günlük kota mantığı gerekmiyor).
//
// GERÇEK BULGU (ilk çalıştırmada yakalandı): "en iyi sonucu otomatik
// kullan" tek başına yeterli değil — Mapbox, "Avlan Gölü", "Pokut
// Yaylası", "Soğanlı Geçidi", "Sertavul Geçidi" gibi küçük/doğal
// coğrafi isimler için bazen tamamen alakasız, uzak bir bölgedeki bir
// SOKAK adıyla eşleşiyor (ör. "Pokut Yaylası" -> Ankara'da "Pokut
// Yaylası Sokak"). Bunu yakalamak için iki katmanlı bir doğrulama var:
//   1) bbox: rotanın "bolge" alanından türetilen bir kutuya HARD FILTER
//      uygulanır (proximity gibi yumuşak bir öneri değil).
//   2) isPlausibleMatch: sonucun feature_type'ı "street"/"address" ise
//      VEYA sorgunun baş kelimesiyle sonucun adı ilk birkaç harfte bile
//      örtüşmüyorsa, sonuç GÜVENİLMEZ sayılır (null döner => rota
//      atlanır) — "bulunamadı" ile "yanlış yer bulundu" burada BİLEREK
//      aynı şekilde ele alınıyor, ikisi de "yanlış konuma kaydetme"
//      riski taşıyor.
// ---------------------------------------------------------------------
function normalizeTr(s) {
  return (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isPlausibleMatch(query, feature) {
  const featureType = feature.properties?.feature_type;
  if (featureType === "street" || featureType === "address") return false;

  const queryToken = normalizeTr(query.split(",")[0].trim().split(/\s+/)[0]);
  const resultName = normalizeTr(feature.properties?.name);
  if (!queryToken || !resultName) return false;

  const sharedLength = Math.min(queryToken.length, resultName.length, 4);
  return queryToken.slice(0, sharedLength) === resultName.slice(0, sharedLength);
}

async function geocodeRaw(query, { proximity, bbox, types } = {}) {
  const params = new URLSearchParams({
    q: query,
    country: "tr",
    language: "tr",
    limit: "1",
    access_token: MAPBOX_TOKEN,
  });
  if (proximity) {
    params.set("proximity", `${proximity.longitude},${proximity.latitude}`);
  }
  if (bbox) {
    params.set("bbox", bbox.join(","));
  }
  if (types) {
    params.set("types", types);
  }
  const url = `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding isteği başarısız (HTTP ${res.status}): "${query}"`);
  }
  const body = await res.json();
  return body.features?.[0] ?? null;
}

// types=place,locality: sokak/adres seviyesi sonuçları İSTEK SEVİYESİNDE
// eler (post-hoc feature_type kontrolünden daha güvenilir — bir sonuç
// hiç dönmüyorsa yanlış bir sokakla asla eşleşemez). Bu, "Soğanlı Geçidi"
// gibi isimlerin artık doğru ilçe/köy kaydıyla (locality) eşleşmesini
// sağladı; ama "Elmalı" gibi nadir durumlarda aynı isimli bir mahalle
// (Antalya şehri içinde) resmi ilçe merkeziyle karışabiliyor — bunu
// otomatik ayırt edecek genel bir kural yok, bkz. README/rapor notu.
const PLACE_TYPES = "place,locality";

async function geocodePlace(query, { proximity, bbox } = {}) {
  const feature = await geocodeRaw(query, { proximity, bbox, types: PLACE_TYPES });
  if (!feature?.geometry?.coordinates) return null;
  if (!isPlausibleMatch(query, feature)) return null;

  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    latitude,
    longitude,
    matchedName: feature.properties?.full_address ?? feature.properties?.name ?? query,
  };
}

// "bolge" alanı ("Trabzon / Bayburt" gibi) içindeki HER il adını
// types=region ile geocode eder ve Mapbox'ın döndürdüğü GERÇEK il sınırı
// bbox'larını birleştirir (nokta + sabit pay yöntemi denenmişti — "Mersin"
// ŞEHİR merkezine ±0.7° pay, Anamur gibi ilin ta güneybatı ucundaki bir
// ilçeyi bbox'ın DIŞINDA bırakıyordu; il tipi geocoding'in kendi bbox'ı
// bunun yerine gerçek idari sınırı veriyor, çok daha güvenilir).
async function resolveRegionBbox(bolge, extraPadDeg = 0.2) {
  const tokens = bolge
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let found = false;

  for (const token of tokens) {
    const feature = await geocodeRaw(token, { types: "region" });
    await sleep(GEOCODE_DELAY_MS);

    const regionBbox = feature?.properties?.bbox;
    if (regionBbox) {
      found = true;
      minLon = Math.min(minLon, regionBbox[0]);
      minLat = Math.min(minLat, regionBbox[1]);
      maxLon = Math.max(maxLon, regionBbox[2]);
      maxLat = Math.max(maxLat, regionBbox[3]);
    } else if (feature?.geometry?.coordinates) {
      // Yedek yol: types=region bir bbox döndürmezse (nadir), en azından
      // nokta + cömert bir pay kullan.
      found = true;
      const [lon, lat] = feature.geometry.coordinates;
      minLon = Math.min(minLon, lon - 0.7);
      minLat = Math.min(minLat, lat - 0.7);
      maxLon = Math.max(maxLon, lon + 0.7);
      maxLat = Math.max(maxLat, lat + 0.7);
    }
  }
  if (!found) return null;

  // Küçük ekstra pay: il sınırının tam kenarındaki bir yerleşimi
  // kaçırmamak için.
  return [minLon - extraPadDeg, minLat - extraPadDeg, maxLon + extraPadDeg, maxLat + extraPadDeg];
}

async function fetchDirections(waypoints) {
  const coordsParam = waypoints.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Directions isteği başarısız (HTTP ${res.status})`);
  }
  const body = await res.json();
  if (body.code !== "Ok" || !body.routes?.length) {
    throw new Error(`Directions: verilen noktalar arasında karayolu rotası bulunamadı (code=${body.code})`);
  }
  const best = body.routes[0];
  return {
    coordinates: best.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    distanceKm: Math.round((best.distance / 1000) * 100) / 100,
    durationMin: Math.round(best.duration / 60),
  };
}

// ---------------------------------------------------------------------
// description metni: orijinal açıklama + (kaynak=derleme ise) ibare +
// uyarılar/en_iyi_zaman/yol_uzeri/zorluk, her biri ayrı, etiketli ve
// görsel olarak ayrışan bloklar halinde (AppText düz metin render ediyor,
// markdown desteklemiyor — bu yüzden başlık + "•" madde imi kullanılıyor).
// ---------------------------------------------------------------------
function buildDescription(route, ibare) {
  const parts = [route.aciklama.trim()];

  if (route.kaynak === "derleme" && ibare) {
    parts.push(ibare);
  }
  if (route.uyarilar?.length) {
    parts.push(["⚠️ UYARILAR", ...route.uyarilar.map((u) => `• ${u}`)].join("\n"));
  }
  if (route.en_iyi_zaman) {
    parts.push(`🕐 En İyi Zaman: ${route.en_iyi_zaman}`);
  }
  if (route.yol_uzeri?.length) {
    parts.push(["📍 Yol Üzeri", ...route.yol_uzeri.map((y) => `• ${y}`)].join("\n"));
  }
  if (route.zorluk) {
    parts.push(`Zorluk: ${route.zorluk}`);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------
// İçerik hesabı: ilk çalıştırmada oluşturulur, sonraki çalıştırmalarda
// yerel (git'e girmeyen) dosyadan okunan parolayla giriş yapılır.
// ---------------------------------------------------------------------
async function ensureSeedAccountSession(supabase) {
  let creds;
  if (existsSync(CREDENTIALS_PATH)) {
    creds = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
    console.log(`Var olan içerik hesabı kullanılıyor: ${creds.email}`);
  } else {
    const password = randomBytes(24).toString("base64url");
    creds = { email: SEED_ACCOUNT.email, password };

    const { error: signUpError } = await supabase.auth.signUp({
      email: creds.email,
      password: creds.password,
      options: { data: { username: SEED_ACCOUNT.username, full_name: SEED_ACCOUNT.fullName } },
    });
    if (signUpError) {
      throw new Error(`İçerik hesabı oluşturulamadı: ${signUpError.message}`);
    }

    mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
    writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2));
    console.log(
      `Yeni içerik hesabı oluşturuldu: ${creds.email} (kullanıcı adı: ${SEED_ACCOUNT.username})\n` +
        `Kimlik bilgileri yerel olarak kaydedildi: ${CREDENTIALS_PATH} (git'e eklenmez, .gitignore'da).`
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) {
    throw new Error(
      `İçerik hesabıyla giriş yapılamadı: ${error.message}\n` +
        `(Supabase projesinde e-posta doğrulaması zorunluysa, ${creds.email} adresini önce doğrulamanız gerekebilir.)`
    );
  }
  return data.user;
}

// ---------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------
async function main() {
  const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
  const ibare = raw._bilgi?.ibare ?? "";
  const routes = raw.rotalar ?? [];

  console.log(`${routes.length} rota okundu: ${INPUT_PATH}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const user = await ensureSeedAccountSession(supabase);
  console.log(`Oturum açıldı: ${user.id}\n`);

  const skipped = [];
  const imported = [];
  const alreadyExisted = [];

  for (const route of routes) {
    const label = `${route.id} (${route.baslik})`;

    // İdempotentlik: aynı hesap altında aynı başlıkla bir rota var mı?
    const { data: existing, error: selectError } = await supabase
      .from("routes")
      .select("id")
      .eq("creator_id", user.id)
      .eq("title", route.baslik)
      .maybeSingle();
    if (selectError) {
      console.error(`[${label}] Var olan rota kontrol edilemedi, ATLANIYOR: ${selectError.message}`);
      skipped.push({ id: route.id, sebep: `select hatası: ${selectError.message}` });
      continue;
    }
    if (existing) {
      console.log(`[${label}] Zaten içe aktarılmış, atlanıyor.`);
      alreadyExisted.push(route.id);
      continue;
    }

    // Rotanın "bolge" alanından bir kutu (bbox) türetilir — tüm yer
    // adları bu kutuyla HARD FILTER edilerek geocode edilir (bkz.
    // geocodePlace üstündeki not: proximity tek başına yeterli değildi).
    let regionBbox = null;
    if (route.bolge) {
      try {
        regionBbox = await resolveRegionBbox(route.bolge);
      } catch (err) {
        console.warn(`[${label}] Bölge kutusu hesaplanamadı (${err.message}), bbox'sız devam ediliyor.`);
      }
    }

    // Yer adlarını sırayla geocode et: başlangıç → ara noktalar → bitiş.
    // Her adımda bir önceki noktayı proximity olarak vererek aynı isimli
    // uzak bir yerleşimi yanlışlıkla seçme riskini azaltıyoruz.
    const placeNames = [route.baslangic, ...(route.ara_noktalar ?? []), route.bitis];
    const geocoded = [];
    let failedPlace = null;

    for (const placeName of placeNames) {
      const proximity = geocoded[geocoded.length - 1];
      let result;
      try {
        result = await geocodePlace(placeName, { proximity, bbox: regionBbox });
      } catch (err) {
        failedPlace = `${placeName} (istek hatası: ${err.message})`;
        break;
      }
      await sleep(GEOCODE_DELAY_MS);
      if (!result) {
        failedPlace = placeName;
        break;
      }
      geocoded.push(result);
    }

    if (failedPlace) {
      console.error(`[${label}] Geocode edilemedi: "${failedPlace}" — rota ATLANIYOR.`);
      skipped.push({ id: route.id, sebep: `geocode edilemedi: ${failedPlace}` });
      continue;
    }

    // Gerçek yol geometrisi + mesafe + süre.
    let directions;
    try {
      directions = await fetchDirections(geocoded);
    } catch (err) {
      console.error(`[${label}] Directions başarısız — rota ATLANIYOR: ${err.message}`);
      skipped.push({ id: route.id, sebep: `directions hatası: ${err.message}` });
      continue;
    }

    const pathPoints = simplifyToMaxPoints(directions.coordinates, MAX_ROUTE_POINTS);

    const { error: insertError } = await supabase.from("routes").insert({
      creator_id: user.id,
      title: route.baslik,
      description: buildDescription(route, ibare),
      path: toLineStringWkt(pathPoints),
      distance_km: directions.distanceKm,
      estimated_duration_min: directions.durationMin,
      region: route.bolge ?? null,
    });

    if (insertError) {
      console.error(`[${label}] Kayıt başarısız — rota ATLANIYOR: ${insertError.message}`);
      skipped.push({ id: route.id, sebep: `insert hatası: ${insertError.message}` });
      continue;
    }

    console.log(
      `[${label}] Eklendi — ${directions.distanceKm} km, ~${directions.durationMin} dk, ${pathPoints.length} nokta.`
    );
    imported.push(route.id);
  }

  console.log("\n=== ÖZET ===");
  console.log(`Eklendi: ${imported.length}`);
  console.log(`Zaten vardı (atlandı): ${alreadyExisted.length}`);
  console.log(`Hata/eksik bilgi yüzünden atlandı: ${skipped.length}`);
  if (skipped.length) {
    console.log("\nAtlanan rotalar:");
    for (const s of skipped) {
      console.log(`  - ${s.id}: ${s.sebep}`);
    }
  }
}

main().catch((err) => {
  console.error("\nScript beklenmeyen bir hatayla durdu:", err);
  process.exit(1);
});
