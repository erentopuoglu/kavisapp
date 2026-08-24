import { isRunningInExpoGo } from "expo";
import * as Location from "expo-location";

export type TrackingProfile = {
  accuracy: Location.Accuracy;
  timeIntervalMs: number;
  distanceIntervalM: number;
};

// expo-location'ın arka plan konum API'leri (start/stop/hasStarted...Async),
// TaskManager'a dayandığı için Expo Go'da native olarak desteklenmiyor —
// Android'de hiç, iOS'ta sadece Simulator'da (gerçek iPhone'da da
// çalışmaz). expo-location bunun için kendi içinde sadece console.warn
// basıyor, HATA FIRLATMIYOR — yani native çağrı sessizce no-op kalabilir ve
// kullanıcı "kayıt başladı" sanıp aslında hiçbir nokta kaydedilmeyebilir.
// Bu yüzden native çağrıyı hiç denemeden, en baştan kontrol ediyoruz.
function ensureBackgroundLocationAvailable(): void {
  if (isRunningInExpoGo()) {
    throw new Error("Sürüş kaydı Expo Go'da çalışmıyor — Development Client build'i gerekiyor.");
  }
}

// Bunlar sadece native katmanın ARA sıklığını (throttle) belirler — gerçek
// "bu noktayı kaydet" kararı useRecordingStore'daki OR-eşik filtresinde
// veriliyor (2-3sn VEYA 15-20m, hangisi önce gerçekleşirse). Buradaki
// değerler o filtrenin hiç kaçırmayacağı kadar sık, ama pili boşaltmayacak
// kadar seyrek native güncelleme sağlıyor.
export const NORMAL_TRACKING_PROFILE: TrackingProfile = {
  accuracy: Location.Accuracy.High,
  timeIntervalMs: 1000,
  distanceIntervalM: 5,
};

export const BATTERY_SAVER_TRACKING_PROFILE: TrackingProfile = {
  accuracy: Location.Accuracy.Balanced,
  timeIntervalMs: 3000,
  distanceIntervalM: 20,
};

export async function startBackgroundTracking(taskName: string, profile: TrackingProfile): Promise<void> {
  ensureBackgroundLocationAvailable();

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(taskName);
  if (alreadyRunning) {
    await Location.stopLocationUpdatesAsync(taskName);
  }

  await Location.startLocationUpdatesAsync(taskName, {
    accuracy: profile.accuracy,
    timeInterval: profile.timeIntervalMs,
    distanceInterval: profile.distanceIntervalM,
    foregroundService: {
      notificationTitle: "Kavis sürüş kaydı",
      notificationBody: "Rotanız arka planda kaydediliyor.",
      notificationColor: "#FF7A1A",
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
}

export async function stopBackgroundTracking(taskName: string): Promise<void> {
  ensureBackgroundLocationAvailable();

  const isRunning = await Location.hasStartedLocationUpdatesAsync(taskName);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(taskName);
  }
}

export async function isBackgroundTrackingRunning(taskName: string): Promise<boolean> {
  ensureBackgroundLocationAvailable();
  return Location.hasStartedLocationUpdatesAsync(taskName);
}
