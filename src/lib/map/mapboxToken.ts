// Mapbox public (pk.) token — TEK OKUMA NOKTASI. Harita tile'ları
// (MapService.tsx), Directions (directions.ts) ve Geocoding (geocoding.ts)
// istekleri hepsi AYNI public token'ı kullanır — ayrı bir secret/Edge
// Function gerekmez, çünkü Directions ve Geocoding uçları Mapbox'ta
// public token scope'una açıktır (bkz. README "Mapbox Maliyet Analizi").
export const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? "";

let warned = false;
export function warnIfMapboxTokenMissing() {
  if (warned || MAPBOX_PUBLIC_TOKEN || !__DEV__) return;
  warned = true;
  console.warn(
    "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN tanımlı değil — harita, yol tarifi ve adres arama istekleri " +
      "başarısız olabilir. .env dosyanızı kontrol edin."
  );
}
