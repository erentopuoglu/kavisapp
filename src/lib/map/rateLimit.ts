import AsyncStorage from "@react-native-async-storage/async-storage";

// Mapbox Directions/Geocoding istekleri için CİHAZ-YEREL günlük sayaç.
//
// ÖNEMLİ — bu bir güvenlik sınırı DEĞİL: tamamen istemci tarafında,
// AsyncStorage'da tutuluyor. Uygulama verisini/depolamayı temizleyen,
// cihaz değiştiren ya da ağ trafiğini taklit eden bir kullanıcı bu sınırı
// kolayca aşabilir. Amacı kötüye kullanımı kesin olarak engellemek değil —
// normal kullanım sırasında bir kod hatası/döngüsü yüzünden (ör. sürükleme
// debounce'ı bozulursa) yanlışlıkla binlerce isteğin gitmesini önlemek.
// Gerçek kötüye kullanım koruması gerekirse sunucu taraflı bir proxy/Edge
// Function ile IP/kullanıcı bazlı sayaç gerekir — bkz. README Teknik Borç.
const KEY_PREFIX = "@kavis/map/daily-usage";

const DAILY_LIMITS = {
  directions: 50,
  geocoding: 150,
} as const;

export type RateLimitedApi = keyof typeof DAILY_LIMITS;

function todayKey(apiName: RateLimitedApi): string {
  // Cihazın yerel gün sınırı yerine UTC gün sınırı kullanılıyor — kabul
  // edilebilir bir basitleştirme, amaç kesin bir gün ayrımı değil, makul
  // bir günlük tavan.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${KEY_PREFIX}/${apiName}/${today}`;
}

/** Bugünkü kota henüz aşılmadıysa sayacı 1 artırıp true, aşıldıysa false döner. */
export async function consumeDailyQuota(apiName: RateLimitedApi): Promise<boolean> {
  const key = todayKey(apiName);
  const raw = await AsyncStorage.getItem(key);
  const count = raw ? Number(raw) : 0;
  if (count >= DAILY_LIMITS[apiName]) return false;
  await AsyncStorage.setItem(key, String(count + 1));
  return true;
}
