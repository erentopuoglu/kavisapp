#!/usr/bin/env node
// Kavis — kavisapp.com statik site derleyicisi.
//
// Bağımlılıksız (sadece Node built-in modülleri + global fetch). Şunları
// yapıyor:
//   1) src/content/legal.json'ı (uygulamanın Gizlilik/Koşullar ekranlarıyla
//      PAYLAŞILAN TEK KAYNAK) okuyup /gizlilik ve /kosullar sayfalarını
//      üretir.
//   2) Supabase'den (anon key, salt okunur, routes_select_visible RLS'i
//      is_hidden=false satırları zaten herkese açık bıraktığı için oturum
//      gerekmez) yayında olan rotaları BİR KEZ çeker ve /rotalar +
//      /rotalar/{slug} sayfalarını, sitemap.xml'i ve ana sayfadaki
//      istatistik/öne-çıkan-rotalar bölümlerini bundan üretir. ÇALIŞMA
//      ZAMANINDA (ziyaretçi tarayıcısında) Supabase'e hiçbir istek
//      atılmaz — bkz. README "Rota Vitrini".
//   3) Her rotanın statik harita görselini Mapbox Static Images API'den
//      BUILD SIRASINDA bir kez İNDİRİP dist/rotalar/{slug}/harita.png
//      olarak diske yazar (canlı bir Mapbox URL'ini <img>'e gömmek
//      yerine) — böylece yayınlanan site tamamen self-hosted kalır,
//      ziyaretçi tarayıcısı Mapbox'a hiç istek atmaz, ve Mapbox faturası
//      (Static Images API, aylık 50.000 istek ücretsiz) sadece build
//      başına, ziyaretçi sayısından bağımsız oluşur.
//   4) index.html'deki __SUPABASE_URL__/__SUPABASE_ANON_KEY__ yer
//      tutucularını gerçek değerlerle değiştirir — "Çıkınca haber ver"
//      formu bu değerlerle doğrudan Supabase REST'e anon insert atıyor.
//   5) index.html, styles.css, site.js, favicon/OG görselleri, robots.txt
//      ve screenshots/ altındaki gerçek görselleri (varsa) dist/'e
//      kopyalar.
//
// Çalıştırma: node build.mjs  (Cloudflare Pages build command'ı budur —
// bkz. web/README.md). Rota vitrini için EK olarak Cloudflare Pages'te
// EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ortam değişkeni de tanımlı olmalı
// (Supabase URL/anon key ile aynı yerde, bkz. web/README.md).

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const webDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(webDir, "..");
const distDir = join(webDir, "dist");
const SITE_URL = "https://kavisapp.com";

const legal = JSON.parse(readFileSync(join(rootDir, "src/content/legal.json"), "utf8"));

// --- ortam değişkenleri --------------------------------------------
// Önce gerçek ortam değişkenlerine bakıyoruz (Cloudflare Pages'te proje
// ayarlarından girilir), yoksa yerel geliştirme kolaylığı için ana
// repodaki .env'i (uygulamanın zaten kullandığı EXPO_PUBLIC_* isimleri)
// okumayı dener. Bunların hepsi zaten public/istemci-güvenli değerler
// (mobil app bundle'ına da gömülü) — burada açığa çıkması güvenlik
// sorunu değil.
function loadEnv() {
  const fromProcess = {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
    mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN || "",
  };

  if (!fromProcess.url || !fromProcess.anonKey || !fromProcess.mapboxToken) {
    const envPath = join(rootDir, ".env");
    if (existsSync(envPath)) {
      const parsed = {};
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        parsed[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
      fromProcess.url = fromProcess.url || parsed.EXPO_PUBLIC_SUPABASE_URL || "";
      fromProcess.anonKey = fromProcess.anonKey || parsed.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
      fromProcess.mapboxToken = fromProcess.mapboxToken || parsed.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN || "";
    }
  }

  return fromProcess;
}

const { url: supabaseUrl, anonKey: supabaseAnonKey, mapboxToken } = loadEnv();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[build] UYARI: Supabase URL/anon key bulunamadı — 'Çıkınca haber ver' formu " +
      "yayınlanan sitede devre dışı görünecek, ve rota vitrini üretilemeyecek."
  );
}
if (!mapboxToken) {
  console.warn(
    "[build] UYARI: EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN bulunamadı — rota harita " +
      "görselleri üretilemeyecek (kartlarda/rota sayfalarında boş kalacak)."
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncate(text, maxLen) {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trimEnd() + "…";
}

// ---------------------------------------------------------------------
// Geo yardımcıları — src/shared/utils/geo.ts ile AYNI Douglas-Peucker
// mantığı. Bu, aynı fonksiyonların üçüncü kopyası (diğer ikisi:
// src/shared/utils/geo.ts'in kendisi ve supabase/seed/
// import_kavis_rotalar.mjs) — HER İKİSİ de "Node script'i path alias/TS
// import'u çözemiyor" sebebiyle aynı şekilde kopyalanmıştı, burası da
// aynı kısıtla aynı çözümü tekrarlıyor (bilerek — bkz. o dosyalardaki
// aynı not).
const EARTH_RADIUS_KM = 6371;
function toRad(deg) {
  return (deg * Math.PI) / 180;
}
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

// ---------------------------------------------------------------------
// Google Encoded Polyline Algorithm Format (precision 5) — Mapbox Static
// Images API'nin `path` overlay'i bu formatı bekliyor. Standart, herkese
// açık algoritma (bkz. Google'ın "Encoded Polyline Algorithm Format"
// dokümantasyonu) — bağımlılık eklemeye değmeyecek kadar küçük.
function encodePolyline(points, precision = 5) {
  const factor = 10 ** precision;
  let output = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const point of points) {
    const lat = Math.round(point.latitude * factor);
    const lng = Math.round(point.longitude * factor);
    output += encodeSignedNumber(lat - prevLat) + encodeSignedNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}
function encodeSignedNumber(num) {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  return encodeNumber(sgnNum);
}
function encodeNumber(num) {
  let output = "";
  while (num >= 0x20) {
    output += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  output += String.fromCharCode(num + 63);
  return output;
}

// ---------------------------------------------------------------------
// Supabase'den yayındaki rotaları çek (build zamanında, BİR KEZ).
// ---------------------------------------------------------------------
async function fetchRoutes() {
  const params = new URLSearchParams({
    select: "id,slug,title,description,distance_km,estimated_duration_min,region,path_geojson,rating_count,updated_at",
    is_hidden: "eq.false",
    order: "title.asc",
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/routes?${params.toString()}`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
  });
  if (!res.ok) {
    throw new Error(`Rotalar çekilemedi (HTTP ${res.status}) — build durduruldu.`);
  }
  return res.json();
}

// Mapbox Static Images API'den PNG bayt dizisini indirir (BUILD anında,
// bir kez) — canlı bir Mapbox URL'i <img>'e gömmek yerine, aşağıda diske
// yazılıp self-hosted olarak servis edilir (bkz. dosya başı yorumu).
async function downloadRouteMapImage(pathGeojson) {
  const coordinates = (pathGeojson?.coordinates ?? []).map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));
  if (coordinates.length < 2) return null;

  // 8192 karakter URL limiti için güvenli pay — 120 nokta, bir rotanın
  // genel şeklini kaybetmeden encoded polyline'ı rahatça sınırın altında
  // tutuyor (500 noktalık bir rota bile bu sadeleştirmeyle ~birkaç yüz
  // karaktere iniyor).
  const simplified = simplifyToMaxPoints(coordinates, 120);
  const encoded = encodePolyline(simplified);
  const overlay = `path-4+ff7a1a-0.9(${encodeURIComponent(encoded)})`;
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay}/auto/1200x630` +
    `?padding=40&access_token=${encodeURIComponent(mapboxToken)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mapbox static image başarısız (HTTP ${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------
// Rota açıklamasını (supabase/seed/import_kavis_rotalar.mjs'nin
// ürettiği, "\n\n" ile ayrılmış bloklu düz metni) görsel olarak ayrışan
// HTML'e çevirir — uyarılar bir uyarı kutusuna, "En İyi Zaman"/"Zorluk"
// küçük bilgi satırlarına, "Yol Üzeri" madde imli bir listeye dönüşüyor.
// Bu formatın kaynağı için bkz. o script'teki buildDescription().
// ---------------------------------------------------------------------
function renderRouteDescription(description) {
  const blocks = (description ?? "").split(/\n\n+/).filter(Boolean);
  let html = "";

  for (const block of blocks) {
    const lines = block.split("\n");
    const first = lines[0];
    const bulletItems = () =>
      lines
        .slice(1)
        .map((l) => l.replace(/^•\s*/, "").trim())
        .filter(Boolean);

    if (first.startsWith("⚠️")) {
      const items = bulletItems();
      html += `<div class="route-warning-box">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
  <div>
    <p><strong>${escapeHtml(first.replace("⚠️", "").trim())}</strong></p>
    ${items.map((item) => `<p>${escapeHtml(item)}</p>`).join("\n    ")}
  </div>
</div>\n`;
      continue;
    }

    if (first.startsWith("📍")) {
      const items = bulletItems();
      html += `<p class="route-info-line"><strong>${escapeHtml(first)}</strong></p>\n<ul class="route-highlights">${items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>\n`;
      continue;
    }

    if (first.startsWith("🕐") || first.startsWith("Zorluk:")) {
      html += `<p class="route-info-line">${escapeHtml(first)}</p>\n`;
      continue;
    }

    html += `<p>${escapeHtml(block)}</p>\n`;
  }

  return html;
}

// Meta description / JSON-LD için: bloklu açıklamanın İLK (düz) paragrafı
// — uyarı/etiket blokları hariç, kısa ve temiz bir özet.
function mainDescriptionText(description) {
  const blocks = (description ?? "").split(/\n\n+/).filter(Boolean);
  const plain = blocks.find((b) => !/^(⚠️|📍|🕐|Zorluk:)/.test(b));
  return (plain ?? blocks[0] ?? "").replace(/\s+/g, " ").trim();
}

function regionTokens(region) {
  return (region ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDuration(min) {
  if (!min) return null;
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  if (hours === 0) return `${mins} dk`;
  if (mins === 0) return `${hours} sa`;
  return `${hours} sa ${mins} dk`;
}

// --- ortak header/footer (index.html'deki ile aynı tutulmalı) ---------

function siteHeader(activeSlug) {
  const navLink = (href, label, slug) =>
    `<a href="${href}"${slug && slug === activeSlug ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="site-header">
  <div class="site-header-inner">
    <a class="wordmark" href="/">Kavis</a>
    <div class="site-header-actions">
      <nav class="site-nav" aria-label="Ana gezinme">
        ${navLink("/rotalar", "Rotalar", "rotalar")}
        ${navLink("/#ozellikler", "Özellikler")}
        ${navLink("/#hakkinda", "Hakkında")}
        ${navLink("/gizlilik", "Gizlilik", "gizlilik")}
        ${navLink("/kosullar", "Koşullar", "kosullar")}
      </nav>
      <a class="icon-link" href="https://instagram.com/kavisapp" target="_blank" rel="noopener noreferrer" aria-label="Kavis'i Instagram'da takip edin (@kavisapp)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"></circle></svg>
      </a>
    </div>
  </div>
</header>`;
}

function siteFooter() {
  return `<footer class="site-footer">
  <div class="site-footer-inner">
    <span>© 2026 Kavis. Tüm hakları saklıdır.</span>
    <div class="site-footer-links">
      <a href="/gizlilik">Gizlilik Politikası</a>
      <a href="/kosullar">Kullanım Koşulları</a>
      <a href="mailto:info@kavisapp.com">info@kavisapp.com</a>
      <a class="icon-link" href="https://instagram.com/kavisapp" target="_blank" rel="noopener noreferrer" aria-label="Kavis'i Instagram'da takip edin (@kavisapp)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"></circle></svg>
      </a>
    </div>
  </div>
</footer>`;
}

function pageShell({ title, description, canonicalPath, ogImage, robots, extraHead, activeNav, bodyClass, main }) {
  const url = `${SITE_URL}${canonicalPath}`;
  const image = ogImage ?? `${SITE_URL}/og-image.png`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${robots ? `<meta name="robots" content="${robots}">` : ""}
<link rel="canonical" href="${url}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Kavis">
<meta property="og:locale" content="tr_TR">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:image" content="${image}">

<link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32">
<link rel="icon" type="image/png" href="/favicon.png" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&amp;family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${extraHead ?? ""}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>

${siteHeader(activeNav)}

<main>
${main}
</main>

${siteFooter()}

<script src="/site.js" defer></script>
</body>
</html>
`;
}

function renderClauses(sections) {
  return sections
    .map(
      (section) => `      <section class="clause">
        <h2>${escapeHtml(section.title)}</h2>
${section.paragraphs.map((paragraph) => `        <p>${escapeHtml(paragraph)}</p>`).join("\n")}
      </section>`
    )
    .join("\n");
}

function legalPage({ title, description, slug, otherSlug, otherTitle, sections }) {
  const main = `  <div class="legal-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="updated">Son güncelleme: ${escapeHtml(legal.lastUpdated)}</div>
    <div class="lane" aria-hidden="true"></div>
    <div class="draft-banner" role="note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <p>Bu metin bir taslaktır, hukuki tavsiye niteliği taşımaz. Gerçek bir mağaza başvurusundan önce bir hukuk danışmanına gösterilmesi ve iletişim bilgisi yer tutucusunun doldurulması önerilir.</p>
    </div>
    <a class="other-doc-link" href="/${otherSlug}">${escapeHtml(otherTitle)} →</a>
  </div>

  <div class="legal-body">
${renderClauses(sections)}
  </div>`;

  return pageShell({
    title: `${title} — Kavis`,
    description,
    canonicalPath: `/${slug}`,
    robots: "noindex, follow",
    activeNav: slug,
    main,
  });
}

// ---------------------------------------------------------------------
// Rota vitrini — /rotalar (liste) + /rotalar/{slug} (detay)
// ---------------------------------------------------------------------

function routeCardHtml(route) {
  const meta = [
    route.distance_km ? `${route.distance_km} km` : null,
    formatDuration(route.estimated_duration_min),
  ]
    .filter(Boolean)
    .join(" · ");
  return `<a class="route-card" href="/rotalar/${route.slug}" data-regions="${escapeHtml(
    regionTokens(route.region).map((r) => r.toLocaleLowerCase("tr")).join("|")
  )}">
  <div class="route-card-map">
    <img src="/rotalar/${route.slug}/harita.png" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
  </div>
  <div class="route-card-body">
    ${route.region ? `<span class="route-card-region">${escapeHtml(route.region)}</span>` : ""}
    <h3 class="route-card-title">${escapeHtml(route.title)}</h3>
    ${meta ? `<span class="route-card-meta">${escapeHtml(meta)}</span>` : ""}
  </div>
</a>`;
}

function routesListPage(routes) {
  const allRegions = [...new Set(routes.flatMap((r) => regionTokens(r.region)))].sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const filterButtons = [
    `<button type="button" data-region-filter="tumu" class="is-active" aria-pressed="true">Tümü</button>`,
    ...allRegions.map(
      (region) =>
        `<button type="button" data-region-filter="${escapeHtml(region.toLocaleLowerCase("tr"))}" aria-pressed="false">${escapeHtml(region)}</button>`
    ),
  ].join("\n      ");

  const cards = routes.map(routeCardHtml).join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Kavis Rotaları",
    description: `Kavis topluluğunun keşfettiği ${routes.length} motosiklet rotası — mesafe, süre ve bölgeye göre.`,
    url: `${SITE_URL}/rotalar`,
  };

  const main = `  <div class="routes-header">
    <h1>Rotalar</h1>
    <p>Kavis topluluğunun derlediği ${routes.length} motosiklet rotası — bölgeye göre filtreleyin, mesafe ve süresini görün, detayına girin.</p>
    <div class="route-filter" role="group" aria-label="Bölgeye göre filtrele">
      ${filterButtons}
    </div>
  </div>
  <div class="routes-list">
    <div class="routes-grid">
${cards}
    </div>
  </div>`;

  return pageShell({
    title: "Rotalar — Kavis",
    description: `Kavis topluluğunun keşfettiği ${routes.length} motosiklet rotası. Mesafe, süre, uyarılar ve bölgeye göre filtreleyerek gerçek yol verisiyle keşfedin.`,
    canonicalPath: "/rotalar",
    activeNav: "rotalar",
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    main,
  });
}

function routeDetailPage(route) {
  const meta = [
    route.distance_km ? `${route.distance_km} km` : null,
    formatDuration(route.estimated_duration_min),
    route.region,
  ].filter(Boolean);

  const mapImageExists = existsSync(join(distDir, "rotalar", route.slug, "harita.png"));
  const ogImage = mapImageExists ? `${SITE_URL}/rotalar/${route.slug}/harita.png` : undefined;
  const summary = truncate(mainDescriptionText(route.description), 155);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: route.title,
    description: mainDescriptionText(route.description),
    url: `${SITE_URL}/rotalar/${route.slug}`,
    ...(ogImage ? { image: ogImage } : {}),
    ...(route.region ? { containedInPlace: { "@type": "AdministrativeArea", name: route.region } } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Kavis", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Rotalar", item: `${SITE_URL}/rotalar` },
      { "@type": "ListItem", position: 3, name: route.title, item: `${SITE_URL}/rotalar/${route.slug}` },
    ],
  };

  // src/app.config.ts'teki scheme:"kavis" + expo-router'ın dosya tabanlı
  // linkingi ile src/app/rota/[id].tsx otomatik olarak kavis://rota/{id}
  // ile açılabiliyor (ayrı bir linking config'i yok). Mağaza linki henüz
  // olmadığı için "indir" bekleme listesine yönleniyor.
  const appDeepLink = `kavis://rota/${route.id}`;

  const main = `  <div class="breadcrumbs">
    <a href="/">Kavis</a> / <a href="/rotalar">Rotalar</a> / <span>${escapeHtml(route.title)}</span>
  </div>

  <div class="route-detail-header">
    ${route.region ? `<div class="route-detail-region">${escapeHtml(route.region)}</div>` : ""}
    <h1>${escapeHtml(route.title)}</h1>
  </div>

  ${
    mapImageExists
      ? `<div class="route-map-frame">
    <img src="/rotalar/${route.slug}/harita.png" alt="${escapeHtml(route.title)} rota haritası" width="1200" height="630">
  </div>`
      : ""
  }

  <div class="route-stats">
    ${meta.map((m) => `<div class="stat-item"><span class="stat-value">${escapeHtml(String(m))}</span></div>`).join("\n    ")}
  </div>

  <div class="route-body">
${renderRouteDescription(route.description)}
    <div class="route-app-cta">
      <a class="button-primary" href="${appDeepLink}">Uygulamada Aç</a>
      <a class="button-secondary" href="/#waitlist">Uygulamayı İndir (yakında)</a>
    </div>
  </div>`;

  return pageShell({
    title: `${route.title} — Kavis Rotaları`,
    description: summary || `${route.title} motosiklet rotası — Kavis'te mesafe, süre ve uyarılarıyla birlikte.`,
    canonicalPath: `/rotalar/${route.slug}`,
    ogImage,
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`,
    main,
  });
}

function statsStripHtml(routes) {
  const provinceCount = new Set(routes.flatMap((r) => regionTokens(r.region))).size;
  const totalKm = Math.round(routes.reduce((sum, r) => sum + (r.distance_km ?? 0), 0));
  return `<div class="stat-item">
      <span class="stat-value">${routes.length}</span>
      <span class="stat-label">Rota</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${provinceCount}</span>
      <span class="stat-label">İlde</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${totalKm.toLocaleString("tr-TR")} km</span>
      <span class="stat-label">Toplam Rota Uzunluğu</span>
    </div>`;
}

// Öne çıkan rotalar: şimdilik gerçek bir kullanıcı puanı sinyali yok
// (rating_count çoğunlukla 0, rotalar yeni içe aktarıldı) — bu yüzden
// rating_count DESC + distance_km ASC (daha erişilebilir/kısa rotalar
// öne) sıralaması kullanılıyor. Gerçek puanlar biriktikçe bu otomatik
// olarak anlamlı hale gelecek, elle seçilmiş bir liste değil.
function featuredRoutesHtml(routes) {
  const featured = [...routes]
    .sort((a, b) => (b.rating_count ?? 0) - (a.rating_count ?? 0) || (a.distance_km ?? 0) - (b.distance_km ?? 0))
    .slice(0, 4);
  return featured.map(routeCardHtml).join("\n");
}

// ---------------------------------------------------------------------
// sitemap.xml — artık statik bir dosya değil, üretiliyor.
// /gizlilik ve /kosullar bilinçli olarak yok (noindex, follow taşıyorlar).
// ---------------------------------------------------------------------
function sitemapXml(routes) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: "/", lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: "/rotalar", lastmod: today, changefreq: "weekly", priority: "0.9" },
    ...routes.map((r) => ({
      loc: `/rotalar/${r.slug}`,
      lastmod: (r.updated_at ?? today).slice(0, 10),
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// --- statik dosya kopyalama yardımcıları -------------------------------

function copyIfExists(src, destName) {
  const srcPath = join(webDir, src);
  if (!existsSync(srcPath)) return;
  cpSync(srcPath, join(distDir, destName ?? src));
}

async function main() {
  // --- dist'i sıfırla ---
  if (existsSync(distDir)) rmSync(distDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  // --- rotaları çek (rota vitrini bu veriye bağlı; başarısızsa build durur) ---
  let routes = [];
  if (supabaseUrl && supabaseAnonKey) {
    routes = await fetchRoutes();
    console.log(`[build] ${routes.length} rota çekildi.`);
  } else {
    console.warn("[build] Supabase bağlantısı yok — rota vitrini ÜRETİLMEYECEK.");
  }

  // --- her rota için harita görselini indir (best-effort — biri
  // başarısız olursa build durmaz, o rota haritasız kalır) ---
  if (routes.length && mapboxToken) {
    for (const route of routes) {
      try {
        const image = await downloadRouteMapImage(route.path_geojson);
        if (image) {
          const routeDir = join(distDir, "rotalar", route.slug);
          mkdirSync(routeDir, { recursive: true });
          writeFileSync(join(routeDir, "harita.png"), image);
        }
      } catch (err) {
        console.warn(`[build] "${route.title}" için harita indirilemedi: ${err.message}`);
      }
    }
  }

  // --- index.html: yer tutucuları doldurup yaz ---
  let indexHtml = readFileSync(join(webDir, "index.html"), "utf8");
  indexHtml = indexHtml
    .replaceAll("__SUPABASE_URL__", supabaseUrl)
    .replaceAll("__SUPABASE_ANON_KEY__", supabaseAnonKey)
    .replace("<!--STATS_PLACEHOLDER-->", routes.length ? statsStripHtml(routes) : "")
    .replace("<!--FEATURED_ROUTES_PLACEHOLDER-->", routes.length ? featuredRoutesHtml(routes) : "");
  writeFileSync(join(distDir, "index.html"), indexHtml);

  // --- diğer statik dosyalar ---
  copyIfExists("styles.css");
  copyIfExists("site.js");
  copyIfExists("favicon.png");
  copyIfExists("favicon-32.png");
  copyIfExists("apple-touch-icon.png");
  copyIfExists("og-image.png");
  copyIfExists("robots.txt");

  const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
  const screenshotsSrc = join(webDir, "screenshots");
  if (existsSync(screenshotsSrc)) {
    const files = readdirSync(screenshotsSrc).filter(
      (f) => !f.startsWith(".") && IMAGE_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext))
    );
    if (files.length > 0) {
      mkdirSync(join(distDir, "screenshots"), { recursive: true });
      for (const file of files) {
        cpSync(join(screenshotsSrc, file), join(distDir, "screenshots", file));
      }
    }
  }

  // --- üretilen yasal sayfalar ---
  mkdirSync(join(distDir, "gizlilik"), { recursive: true });
  writeFileSync(
    join(distDir, "gizlilik/index.html"),
    legalPage({
      title: legal.privacy.title,
      description: "Kavis mobil uygulamasının gizlilik politikası — hangi verilerin toplandığı, nasıl kullanıldığı ve haklarınız.",
      slug: "gizlilik",
      otherSlug: "kosullar",
      otherTitle: legal.terms.title,
      sections: legal.privacy.sections,
    })
  );

  mkdirSync(join(distDir, "kosullar"), { recursive: true });
  writeFileSync(
    join(distDir, "kosullar/index.html"),
    legalPage({
      title: legal.terms.title,
      description: "Kavis mobil uygulamasının kullanım koşulları.",
      slug: "kosullar",
      otherSlug: "gizlilik",
      otherTitle: legal.privacy.title,
      sections: legal.terms.sections,
    })
  );

  // --- rota vitrini sayfaları ---
  if (routes.length) {
    mkdirSync(join(distDir, "rotalar"), { recursive: true });
    writeFileSync(join(distDir, "rotalar/index.html"), routesListPage(routes));

    for (const route of routes) {
      const routeDir = join(distDir, "rotalar", route.slug);
      mkdirSync(routeDir, { recursive: true });
      writeFileSync(join(routeDir, "index.html"), routeDetailPage(route));
    }
  }

  // --- sitemap.xml (artık üretiliyor, kopyalanmıyor) ---
  writeFileSync(join(distDir, "sitemap.xml"), sitemapXml(routes));

  console.log(
    "web/dist hazır: /, /rotalar" +
      (routes.length ? ` (+${routes.length} rota sayfası)` : " (rota verisi yok)") +
      ", /gizlilik, /kosullar" +
      (supabaseUrl && supabaseAnonKey ? "" : " (waitlist formu YAPILANDIRILMADI)")
  );
}

main().catch((err) => {
  console.error("[build] Derleme başarısız:", err);
  process.exit(1);
});
