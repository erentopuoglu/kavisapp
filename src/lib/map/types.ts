// Sağlayıcıdan (Mapbox/MapLibre) bağımsız, uygulama genelinde kullanılan harita tipleri.
// Ekranlar bu tipler ve MapService.tsx'teki bileşenler dışında hiçbir zaman
// doğrudan @rnmapbox/maps import ETMEMELİDİR — sağlayıcı değişikliği (örn.
// MapLibre'ye geçiş) sadece src/lib/map/ içinde kalmalı.

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type CameraPosition = {
  center: LatLng;
  zoom: number;
  heading?: number;
};

export type MapMarkerData = {
  id: string;
  coordinate: LatLng;
};
