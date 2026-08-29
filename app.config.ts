import type { ExpoConfig } from "expo/config";

// Native build sırasında Mapbox SDK'sını indirmek için kullanılan GİZLİ token.
// Uygulama koduna asla gömülmez; sadece EAS secret / yerel ortam değişkeni
// olarak sağlanır. Bununla EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN'ı karıştırma:
// o token istemci tarafında harita stilini çekmek için kullanılan, public
// olması tasarım gereği güvenli olan ayrı bir Mapbox token'ıdır.
const MAPBOX_DOWNLOADS_TOKEN = process.env.MAPBOX_DOWNLOADS_TOKEN ?? "";

const config: ExpoConfig = {
  name: "Kavis",
  slug: "kavis",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "kavis",
  userInterfaceStyle: "dark",
  ios: {
    // Expo SDK 57, ios.icon için düz bir PNG yoluna da izin veriyor (Icon
    // Composer'ın .icon bundle formatına ek olarak) — marka ikonu basit bir
    // düz görsel olduğu için bundle'ın grup/katman/gölge özelliklerine
    // ihtiyaç yok; assets/expo.icon Expo'nun varsayılan placeholder'ıydı,
    // marka ikonu eklenirken kaldırıldı.
    icon: "./assets/images/ios-icon.png",
    bundleIdentifier: "com.kavisapp.kavis",
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.kavisapp.kavis",
    // expo-location'ın arka plan görev tüketicisi, konum güncellemelerini
    // kalıcı (persisted) bir JobScheduler işi olarak zamanlıyor — bu izin
    // olmadan her konum güncellemesinde "Requested job cannot be persisted"
    // hatasıyla çöküyor (RECEIVE_BOOT_COMPLETED, cihaz yeniden başlasa bile
    // zamanlanmış işin hayatta kalabilmesi için Android'in şartı).
    permissions: ["android.permission.RECEIVE_BOOT_COMPLETED"],
    adaptiveIcon: {
      backgroundColor: "#14171C",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-task-manager",
    "expo-file-system",
    "expo-sharing",
    "expo-document-picker",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#14171C",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    [
      "@rnmapbox/maps",
      {
        RNMapboxMapsDownloadToken: MAPBOX_DOWNLOADS_TOKEN,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Kavis, sürüş kaydı sırasında rotanızı çizebilmek için konumunuza ihtiyaç duyar.",
        locationWhenInUsePermission:
          "Kavis, yakınınızdaki rotaları ve işaretli noktaları gösterebilmek için konumunuza ihtiyaç duyar.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        // isAndroidBackgroundLocationEnabled'ın iOS karşılığı — bu olmadan
        // Info.plist'in UIBackgroundModes'una "location" eklenmiyor ve
        // uygulama arka plana atılınca/ekran kilitlenince iOS'ta GPS takibi
        // duruyor (bkz. denetim raporu — store'a çıkmadan önce kritik).
        isIosBackgroundLocationEnabled: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "",
    },
  },
};

export default config;
