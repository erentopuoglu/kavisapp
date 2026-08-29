import { bearingDegrees, haversineDistanceKm, totalDistanceKm } from "@/shared/utils/geo";
import type { LatLng } from "@/lib/map/types";

// Sinematik 3D flyover kamerasının yolunu hesaplayan SAF fonksiyonlar — hiçbir
// Mapbox importu YOK, kasıtlı. Bu dosyanın iki tüketicisi var: MapService.tsx
// (gerçek Mapbox.Camera'yı sürer) ve MapService.expo-go.tsx (aynı zaman
// çizelgesini simüle eder, native render olmadan). İleride bir video kaydı
// aşaması eklenirse (Faz 2), aynı hesaplanan yol kare-kare bir snapshot
// render'ına da beslenebilir — ekranda gösterilenle kaydedilen video böylece
// birebir eşleşir.

// ~50m — kısa rotalarda bu granülerlikte örnekle (viraj hissi için yeterince
// sık). Ama SABİT tutulursa çok uzun bir rota onlarca-yüzlerce durak
// üretir; her durağın MIN_STOP_DURATION_MS tabanı × durak sayısı, toplam
// süreyi MAX_ROAD_DURATION_MS sınırının çok üzerine taşırdı (gerçek bir
// hataydı — bkz. computeFlyoverPlan içindeki adaptif adım hesaplaması).
// Bu yüzden adım mesafesi rotanın toplam uzunluğuna göre büyütülüyor,
// durak sayısı TARGET_ROAD_STOP_COUNT civarında sabit kalıyor.
const MIN_SAMPLE_STEP_KM = 0.05;
const TARGET_ROAD_STOP_COUNT = 150;
const BEARING_SMOOTH_RADIUS = 2; // ±2 örnek pencereli hareketli ortalama — ani viraj sıçramalarını yumuşatır

const ROAD_PITCH = 65; // yola yakın, motosiklet hissi veren açı
const ROAD_ZOOM = 16.5;
const OVERVIEW_PITCH = 15; // rotanın tamamını gösteren geniş kadraj, neredeyse kuş bakışı

// "Sanal uçuş hızı" — yol seviyesi bölümünün ne kadar sürede biteceğini
// belirleyen ayarlanabilir sabit (gerçek bir hız değil, his ayarı).
const VIRTUAL_FLIGHT_SPEED_KMH = 900;
const MIN_ROAD_DURATION_MS = 8_000;
const MAX_ROAD_DURATION_MS = 25_000;
const MIN_STOP_DURATION_MS = 120; // çok kısa segmentlerde native tarafı gereksiz sık güncellememek için taban

const OVERVIEW_DURATION_MS = 2_200;
const DESCEND_DURATION_MS = 1_600; // genel görünümden yola "inme" geçişi

export type FlyoverStopKind = "descend" | "road";

export type FlyoverStop = {
  coordinate: LatLng;
  /** Kuzeyden saat yönünde, 0-360 arası (native tarafa geçmeden hemen önce
   *  bu şekle normalize edilir — plan içindeyken ara hesaplarda "unwrap"
   *  edilmiş sürekli değerler kullanılır, ayrıntı için hesaplama koduna bkz. */
  bearing: number;
  pitch: number;
  zoom: number;
  /** Bir önceki durak/genel görünümden BU durağa geçiş süresi (ms). */
  durationMs: number;
  kind: FlyoverStopKind;
};

export type FlyoverBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type FlyoverPlan = {
  /** Açılış sahnesi: rotanın tamamını kapsayan geniş kadraj. */
  overviewBounds: FlyoverBounds;
  overviewPitch: number;
  overviewDurationMs: number;
  /** İlki her zaman "descend" (genel görünümden yola iniş), gerisi "road". */
  roadStops: FlyoverStop[];
  /** overviewDurationMs + tüm roadStops sürelerinin toplamı. */
  totalDurationMs: number;
  totalDistanceKm: number;
};

export type FlyoverProgress = {
  traveledKm: number;
  totalKm: number;
  /** 0-1 arası, ilerleme çubuğu için. */
  fraction: number;
  finished: boolean;
};

/** points dizisini, orijinal nokta yoğunluğundan bağımsız olarak yol boyunca
 *  sabit aralıklarla (stepKm) yeniden örnekler. Hem elle çizilmiş seyrek
 *  rotalar hem gürültülü/yoğun GPS kayıtları için aynı sonucu üretir. */
function resampleAlongPath(points: LatLng[], stepKm: number): LatLng[] {
  if (points.length < 2) return points.slice();

  const result: LatLng[] = [points[0]];
  let distanceSinceLastSample = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segmentLengthKm = haversineDistanceKm(a, b);
    if (segmentLengthKm <= 0) continue;

    let consumedKm = 0;
    // Bu segment içinde, sıradaki örnek noktaya ulaşana kadar ilerle.
    while (segmentLengthKm - consumedKm >= stepKm - distanceSinceLastSample) {
      consumedKm += stepKm - distanceSinceLastSample;
      const t = consumedKm / segmentLengthKm;
      result.push({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
      distanceSinceLastSample = 0;
    }
    distanceSinceLastSample += segmentLengthKm - consumedKm;
  }

  const last = points[points.length - 1];
  const lastSampled = result[result.length - 1];
  if (haversineDistanceKm(lastSampled, last) > 0.001) {
    result.push(last);
  }
  return result;
}

/** Ardışık açı sıçramalarını (ör. 350°'den 10°'ye) "kısa yoldan" sürekli
 *  bir sayı dizisine çevirir (10° yerine -350°/370° gibi) — bu olmadan
 *  native kamera iki durak arasında YANLIŞ yönden (uzun yoldan) dönebilir. */
function unwrapDegrees(sequence: number[]): number[] {
  if (sequence.length === 0) return [];
  const result: number[] = [sequence[0]];
  for (let i = 1; i < sequence.length; i++) {
    let curr = sequence[i];
    const prev = result[i - 1];
    while (curr - prev > 180) curr -= 360;
    while (curr - prev < -180) curr += 360;
    result.push(curr);
  }
  return result;
}

/** Sürekli (unwrap edilmiş) bir açı dizisine merkezli hareketli ortalama
 *  uygular — virajlarda kameranın ani değil yumuşak dönmesini sağlar. */
function smoothSequence(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j];
      count += 1;
    }
    return sum / count;
  });
}

function computeBounds(points: LatLng[]): FlyoverBounds {
  return points.reduce(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.latitude),
      maxLat: Math.max(acc.maxLat, p.latitude),
      minLng: Math.min(acc.minLng, p.longitude),
      maxLng: Math.max(acc.maxLng, p.longitude),
    }),
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
  );
}

/** Bir rotanın/sürüşün koordinat dizisinden tam bir flyover planı üretir.
 *  2'den az nokta varsa (anlamlı bir rota yoksa) null döner — çağıran taraf
 *  bu durumda "Oynat" düğmesini hiç göstermemeli/devre dışı bırakmalı. */
export function computeFlyoverPlan(coordinates: LatLng[]): FlyoverPlan | null {
  if (coordinates.length < 2) return null;

  const roughDistanceKm = totalDistanceKm(coordinates);
  const stepKm = Math.max(MIN_SAMPLE_STEP_KM, roughDistanceKm / TARGET_ROAD_STOP_COUNT);
  const sampled = resampleAlongPath(coordinates, stepKm);
  if (sampled.length < 2) return null;

  const segmentDistancesKm: number[] = [];
  for (let i = 0; i < sampled.length - 1; i++) {
    segmentDistancesKm.push(haversineDistanceKm(sampled[i], sampled[i + 1]));
  }
  const roadDistanceKm = segmentDistancesKm.reduce((sum, d) => sum + d, 0);
  if (roadDistanceKm <= 0) return null;

  // Her nokta için "ileri bakan" ham bearing (son nokta bir öncekini tekrarlar).
  const rawBearings: number[] = sampled.map((point, i) =>
    i < sampled.length - 1 ? bearingDegrees(point, sampled[i + 1]) : 0
  );
  rawBearings[rawBearings.length - 1] = rawBearings[rawBearings.length - 2] ?? 0;

  const smoothedBearings = smoothSequence(unwrapDegrees(rawBearings), BEARING_SMOOTH_RADIUS).map(
    (b) => ((b % 360) + 360) % 360
  );

  const targetRoadDurationMs = Math.min(
    MAX_ROAD_DURATION_MS,
    Math.max(MIN_ROAD_DURATION_MS, (roadDistanceKm / VIRTUAL_FLIGHT_SPEED_KMH) * 3_600_000)
  );

  const roadStops: FlyoverStop[] = sampled.map((coordinate, i) => {
    const isFirst = i === 0;
    const segmentKm = i > 0 ? segmentDistancesKm[i - 1] : 0;
    const durationMs = isFirst
      ? DESCEND_DURATION_MS
      : Math.max(MIN_STOP_DURATION_MS, (segmentKm / roadDistanceKm) * targetRoadDurationMs);

    return {
      coordinate,
      bearing: smoothedBearings[i],
      pitch: ROAD_PITCH,
      zoom: ROAD_ZOOM,
      durationMs,
      kind: isFirst ? "descend" : "road",
    };
  });

  const roadStopsDurationMs = roadStops.reduce((sum, stop) => sum + stop.durationMs, 0);

  return {
    overviewBounds: computeBounds(coordinates),
    overviewPitch: OVERVIEW_PITCH,
    overviewDurationMs: OVERVIEW_DURATION_MS,
    roadStops,
    totalDurationMs: OVERVIEW_DURATION_MS + roadStopsDurationMs,
    totalDistanceKm: roadDistanceKm,
  };
}

/** plan'ın başlangıcından bu yana geçen süreye (elapsedMs) göre, "kaç km
 *  gidildi" ilerlemesini hesaplar. Genel görünüm bölümünde (henüz yola
 *  inilmeden) ilerleme 0 kabul edilir — kullanıcıya gösterilen "X/Y km",
 *  sadece yol seviyesi uçuşu yansıtır. */
export function getFlyoverProgress(plan: FlyoverPlan, elapsedMs: number): FlyoverProgress {
  const totalKm = plan.totalDistanceKm;
  const roadElapsedMs = elapsedMs - plan.overviewDurationMs;

  if (roadElapsedMs <= 0) {
    return { traveledKm: 0, totalKm, fraction: 0, finished: false };
  }

  let cumulativeMs = 0;
  let cumulativeKm = 0;
  for (let i = 0; i < plan.roadStops.length; i++) {
    const stop = plan.roadStops[i];
    const prevMs = cumulativeMs;
    const prevKm = cumulativeKm;
    cumulativeMs += stop.durationMs;
    if (i > 0) cumulativeKm += haversineDistanceKm(plan.roadStops[i - 1].coordinate, stop.coordinate);

    if (roadElapsedMs <= cumulativeMs) {
      const span = cumulativeMs - prevMs;
      const t = span > 0 ? (roadElapsedMs - prevMs) / span : 1;
      const traveledKm = prevKm + (cumulativeKm - prevKm) * t;
      return {
        traveledKm,
        totalKm,
        fraction: totalKm > 0 ? Math.min(1, traveledKm / totalKm) : 1,
        finished: false,
      };
    }
  }

  return { traveledKm: totalKm, totalKm, fraction: 1, finished: true };
}
