import { MAPBOX_PUBLIC_TOKEN, warnIfMapboxTokenMissing } from "@/lib/map/mapboxToken";
import { consumeDailyQuota } from "@/lib/map/rateLimit";
import type { LatLng } from "@/lib/map/types";

// Mapbox Geocoding API v6 (forward, "temporary" — varsayılan davranış,
// permanent=true GÖNDERMİYORUZ) — TEK GİRİŞ NOKTASI, bkz. directions.ts
// başındaki aynı not. Sonuçları kalıcı saklamıyoruz/önbelleklemiyoruz;
// kullanıcının seçtiği TEK koordinat normal bir rota noktası olarak
// kaydediliyor (bu, Mapbox'ın "permanent geocoding" saydığı bir kullanım
// değil). Fiyatlandırma için bkz. README "Mapbox Maliyet Analizi".
//
// Çağıran taraf (rota/olustur.tsx) yazarken debounce uygulamalı — her tuş
// vuruşunda istek atmak hem maliyeti hem rate limit riskini gereksiz
// büyütür.

export type GeocodingResult = {
  id: string;
  /** Kısa isim (ör. "Anamur"). */
  name: string;
  /** Tam adres/açıklama (ör. "Anamur, Mersin, Türkiye"). */
  fullAddress: string;
  coordinate: LatLng;
};

export async function searchPlaces(query: string, proximity?: LatLng): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  // Çok kısa sorgular hem alakasız sonuç döner hem boşuna istek attırır —
  // çağıran tarafın debounce'ına ek bir taban güvenlik.
  if (trimmed.length < 2) return [];

  warnIfMapboxTokenMissing();

  const allowed = await consumeDailyQuota("geocoding");
  if (!allowed) {
    throw new Error("Günlük adres arama sınırına ulaşıldı. Yarın tekrar deneyin.");
  }

  const params = new URLSearchParams({
    q: trimmed,
    country: "tr",
    language: "tr",
    limit: "5",
    access_token: MAPBOX_PUBLIC_TOKEN,
  });
  if (proximity) {
    params.set("proximity", `${proximity.longitude},${proximity.latitude}`);
  }

  const url = `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // Arama-yazarken akışı için ağ hatasını sessizce yut — kullanıcı
    // haritaya dokunarak devam edebilir, bir Alert ile akışı kesmeye
    // değmez (bkz. yukarıdaki yorum).
    return [];
  }
  if (!response.ok) return [];

  const body = (await response.json()) as {
    features?: {
      properties?: { name?: string; full_address?: string; place_formatted?: string };
      geometry?: { coordinates?: [number, number] };
    }[];
  };

  return (body.features ?? [])
    .filter((feature) => feature.geometry?.coordinates)
    .map((feature, index) => {
      const [longitude, latitude] = feature.geometry!.coordinates!;
      return {
        id: `${index}-${longitude}-${latitude}`,
        name: feature.properties?.name ?? feature.properties?.full_address ?? trimmed,
        fullAddress: feature.properties?.full_address ?? feature.properties?.place_formatted ?? "",
        coordinate: { latitude, longitude },
      };
    });
}
