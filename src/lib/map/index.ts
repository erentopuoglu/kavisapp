import { isRunningInExpoGo } from "expo";

import type * as RealMapService from "./MapService";

// Expo Go'da @rnmapbox/maps native modülü yok. MapService.tsx'in en üstünde
// `import Mapbox from "@rnmapbox/maps"` var — o dosyayı Expo Go'da hiç
// require ETMEMELİYİZ, aksi halde import anında native modül hatasıyla
// çöker. Bu yüzden burada statik `import` değil, koşullu `require`
// kullanıyoruz: yalnızca gerekli implementasyon dosyası çalışma zamanında
// değerlendiriliyor (Metro ikisini de bundle'a dahil eder ama tek dal
// çalışır). Mock implementasyon MapService.expo-go.tsx'te — bkz. o dosya.
//
// isRunningInExpoGo() ("expo" paketinden) — Expo'nun kendi SDK modüllerinin
// (örn. expo-location, bkz. src/lib/location/backgroundTracking.ts) aynı
// ayrımı yapmak için kullandığı resmi API. Native bir "ExpoGo" modülünün
// varlığına bakıyor; bu modül sadece gerçek Expo Go istemcisinde var,
// development build'lerde yok — yani dev client'ta gerçek Mapbox'a düşer,
// sadece gerçek Expo Go'da mock'a düşer.
const isExpoGo = isRunningInExpoGo();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl: typeof RealMapService = isExpoGo ? require("./MapService.expo-go") : require("./MapService");

export const AppMapView = impl.AppMapView;
export const AppMapMarker = impl.AppMapMarker;
export const AppMapPolyline = impl.AppMapPolyline;
export type { LatLng, CameraPosition, MapMarkerData } from "./types";

// Directions/Geocoding @rnmapbox/maps native modülüne değil düz HTTP'ye
// dayanır — Expo Go'da da sorunsuz çalışır, bu yüzden ayrı bir mock
// gerekmez ve doğrudan (koşulsuz) export edilebilir.
export { fetchDirections, DirectionsError, MAX_DIRECTIONS_WAYPOINTS } from "./directions";
export type { DirectionsResult } from "./directions";
export { searchPlaces } from "./geocoding";
export type { GeocodingResult } from "./geocoding";
