export const LOCATION_TASK_NAME = "kavis-ride-recording-location-task";

// Canlı kayıt ve GPX içe aktarma, kaydetmeden önce bu sınırın altına
// Douglas-Peucker ile sadeleştiriyor (bkz. shared/utils/geo.ts).
export const MAX_STORED_TRACK_POINTS = 3000;

// "2-3 sn VEYA 15-20 m eşiği, hangisi önce gerçekleşirse" — normal mod.
export const NORMAL_THRESHOLDS = {
  minIntervalMs: 2500,
  minDistanceM: 17,
};

// Pil Tasarrufu modu: daha seyrek örnekleme.
export const BATTERY_SAVER_THRESHOLDS = {
  minIntervalMs: 8000,
  minDistanceM: 50,
};

// GPS gürültü filtresi: ardışık iki nokta arası üstü kapalı hız bunu
// aşarsa (fiziksel olarak imkansız — GPS sıçraması) nokta atılır. Hem
// canlı kayıtta (useRecordingStore) hem GPX içe aktarmada (recordingApi)
// kullanılır.
export const MAX_PHYSICAL_SPEED_KMH = 250;
