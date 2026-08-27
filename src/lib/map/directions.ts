import { MAPBOX_PUBLIC_TOKEN, warnIfMapboxTokenMissing } from "@/lib/map/mapboxToken";
import { consumeDailyQuota } from "@/lib/map/rateLimit";
import type { LatLng } from "@/lib/map/types";

// Mapbox Directions API — TEK GİRİŞ NOKTASI. Bu dosya dışında hiçbir yer
// Directions'ın URL/response şekline dokunmamalı (bkz. MapService.tsx'teki
// aynı ilke). Fiyatlandırma/limitler için bkz. README "Mapbox Maliyet
// Analizi": ücretsiz kota aylık 100.000 istek, sonrası kademeli
// pay-as-you-go. "driving" profili kullanılıyor (Mapbox'ta motosiklete
// özel bir profil yok; "driving" karayolu ağını takip eder).

/** Mapbox Directions API'nin sert limiti: tek istekte en fazla bu kadar koordinat. */
export const MAX_DIRECTIONS_WAYPOINTS = 25;

export type DirectionsResult = {
  /** Gerçek yolu (asfaltı) takip eden, aradaki tüm geometri noktalarını içeren dizi. */
  coordinates: LatLng[];
  distanceKm: number;
  durationMin: number;
};

export class DirectionsError extends Error {}

export async function fetchDirections(waypoints: LatLng[]): Promise<DirectionsResult> {
  if (waypoints.length < 2) {
    throw new DirectionsError("Rota için en az başlangıç ve bitiş noktası gerekli.");
  }
  if (waypoints.length > MAX_DIRECTIONS_WAYPOINTS) {
    throw new DirectionsError(
      `Bir rota en fazla ${MAX_DIRECTIONS_WAYPOINTS} nokta (başlangıç + ara noktalar + bitiş) içerebilir.`
    );
  }

  warnIfMapboxTokenMissing();

  const allowed = await consumeDailyQuota("directions");
  if (!allowed) {
    throw new DirectionsError(
      "Günlük yol tarifi isteği sınırına ulaşıldı. Yarın tekrar deneyin ya da Serbest Çizim moduna geçin."
    );
  }

  const coordsParam = waypoints.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(MAPBOX_PUBLIC_TOKEN)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new DirectionsError("Yol tarifi alınamadı — internet bağlantınızı kontrol edin.");
  }

  if (!response.ok) {
    throw new DirectionsError("Yol tarifi alınamadı — Mapbox servisine şu an ulaşılamıyor.");
  }

  const body = (await response.json()) as {
    code?: string;
    routes?: {
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }[];
  };

  if (body.code !== "Ok" || !body.routes?.length) {
    throw new DirectionsError("Seçilen noktalar arasında bir karayolu rotası bulunamadı.");
  }

  const bestRoute = body.routes[0];
  return {
    coordinates: bestRoute.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceKm: Math.round((bestRoute.distance / 1000) * 100) / 100,
    durationMin: Math.round(bestRoute.duration / 60),
  };
}
