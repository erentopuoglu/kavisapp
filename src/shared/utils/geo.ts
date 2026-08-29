import type { LatLng } from "@/lib/map/types";
import type { GeoJsonLineString } from "@/lib/supabase/types";

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** a'dan b'ye, kuzeyden saat yönünde derece cinsinden yön (bearing). 3D
 *  flyover kamerasının "nereye bakıyor" açısını hesaplamak için kullanılır
 *  (bkz. src/lib/map/flyoverPath.ts). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function totalDistanceKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceKm(points[i - 1], points[i]);
  }
  return total;
}

export function pointsToLineStringWkt(points: LatLng[]): string {
  const coords = points.map((p) => `${p.longitude} ${p.latitude}`).join(", ");
  return `LINESTRING(${coords})`;
}

export function geoJsonLineStringToLatLngs(line: GeoJsonLineString | null | undefined): LatLng[] {
  if (!line?.coordinates) return [];
  return line.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}

// Nokta ile [lineStart, lineEnd] doğru parçası arasındaki dik mesafe (km).
// Douglas-Peucker sadeleştirmesi için kullanılır.
function perpendicularDistanceKm(point: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
  if (lineStart.latitude === lineEnd.latitude && lineStart.longitude === lineEnd.longitude) {
    return haversineDistanceKm(point, lineStart);
  }

  // Küçük açılar için düzlemsel yaklaşıklık yeterli (rota/sürüş ölçeğinde
  // birkaç km'lik segmentler için hata ihmal edilebilir düzeyde kalır).
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
  const projection: LatLng = { latitude: y1 + t * dy, longitude: x1 + t * dx };

  return haversineDistanceKm(point, projection);
}

/** Douglas-Peucker: `epsilonKm`'den daha az sapan ara noktaları atar. */
export function douglasPeucker(points: LatLng[], epsilonKm: number): LatLng[] {
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

/** Nokta sayısını maxPoints'in altına indirene kadar epsilon'u artırarak
 *  Douglas-Peucker uygular. Çok uzun GPX kayıtları / sürüşleri haritada
 *  gösterime ve depolamaya uygun boyuta indirmek için kullanılır. */
export function simplifyToMaxPoints(points: LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints) return points;

  let epsilonKm = 0.005; // 5 metre
  let simplified = points;

  for (let i = 0; i < 20 && simplified.length > maxPoints; i++) {
    simplified = douglasPeucker(points, epsilonKm);
    epsilonKm *= 1.8;
  }

  return simplified;
}

export type TimedPoint = LatLng & { timestampMs: number };

/** İki nokta arasındaki üstü kapalı (implied) hız fiziksel olarak imkansızsa
 *  (bir motosiklet için `maxSpeedKmh`'yi aşıyorsa) true döner — GPS
 *  sıçraması/gürültüsü demektir. Zaman geriye gidiyorsa ya da durmuşsa da
 *  şüpheli kabul edilir. */
export function isGpsJump(last: TimedPoint, candidate: TimedPoint, maxSpeedKmh: number): boolean {
  const dtHours = (candidate.timestampMs - last.timestampMs) / 3_600_000;
  if (dtHours <= 0) return true;

  const speedKmh = haversineDistanceKm(last, candidate) / dtHours;
  return speedKmh > maxSpeedKmh;
}

/** Bir nokta dizisinden, ardışık noktalar arası anlık hızı `maxSpeedKmh`'yi
 *  aşan (GPS sıçraması olan) noktaları çıkarır. Zaman damgası olmayan
 *  noktalar için anlık hız hesaplanamayacağından dizi olduğu gibi bırakılır
 *  (ör. zaman bilgisi içermeyen bir GPX). Hem canlı kayıt hem GPX içe
 *  aktarma bu fonksiyonu/aynı mantığı kullanır — istatistikler (maks/ort
 *  hız, mesafe) atılan noktaları hiç görmez. */
export function filterGpsNoise<T extends LatLng & { timestampMs?: number }>(
  points: T[],
  maxSpeedKmh: number
): T[] {
  if (points.length < 2) return points;
  if (points.some((p) => p.timestampMs === undefined)) return points;

  const result: T[] = [points[0]];
  let last = points[0] as T & { timestampMs: number };

  for (let i = 1; i < points.length; i++) {
    const candidate = points[i] as T & { timestampMs: number };
    if (isGpsJump(last, candidate, maxSpeedKmh)) continue;
    result.push(candidate);
    last = candidate;
  }

  return result;
}
