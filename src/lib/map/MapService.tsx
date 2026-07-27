import Mapbox from "@rnmapbox/maps";
import { PropsWithChildren, ReactNode, useEffect, useMemo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { colors } from "@/shared/theme";
import type { CameraPosition, LatLng, MapMarkerData } from "@/lib/map/types";

// TEK GİRİŞ NOKTASI: Uygulamanın geri kalanı haritayla yalnızca bu dosyadaki
// bileşenler üzerinden konuşur. @rnmapbox/maps'e özgü hiçbir tip veya API
// başka bir dosyaya sızmamalı — sağlayıcı değişimi (örn. MapLibre) sadece
// burayı yeniden yazmakla mümkün olmalı.

const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? "";

// Konum verilmediğinde varsayılan kamera — Türkiye geneli.
const DEFAULT_CENTER: [number, number] = [35.2433, 38.9637];
const DEFAULT_ZOOM = 5;

let isConfigured = false;
function ensureConfigured() {
  if (isConfigured) return;
  if (!MAPBOX_PUBLIC_TOKEN && __DEV__) {
    console.warn(
      "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN tanımlı değil — harita boş/hatalı görünebilir. .env dosyanızı kontrol edin."
    );
  }
  Mapbox.setAccessToken(MAPBOX_PUBLIC_TOKEN);
  isConfigured = true;
}

type AppMapViewProps = PropsWithChildren<{
  style?: ViewStyle;
  /** Sabit bir merkez/zoom kamerası. fitToCoordinates verilirse yok sayılır. */
  initialCamera?: CameraPosition;
  /** Verilen noktaların tümünü kapsayacak şekilde kamerayı otomatik uydurur
   *  (rota önizleme, tüm rotaları gösterme gibi durumlar için). Veri
   *  asenkron geldiğinde (örn. fetch sonrası) kamera otomatik uçarak
   *  günceller. */
  fitToCoordinates?: LatLng[];
  fitPadding?: number;
  showsUserLocation?: boolean;
  onMapPress?: (coordinate: LatLng) => void;
}>;

export function AppMapView({
  style,
  initialCamera,
  fitToCoordinates,
  fitPadding = 56,
  showsUserLocation = false,
  onMapPress,
  children,
}: AppMapViewProps) {
  useEffect(() => {
    ensureConfigured();
  }, []);

  const cameraKey = fitToCoordinates
    ? fitToCoordinates.map((c) => `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`).join("|")
    : `${initialCamera?.center.latitude ?? ""},${initialCamera?.center.longitude ?? ""}`;

  const cameraSettings = useMemo(() => {
    if (fitToCoordinates && fitToCoordinates.length > 1) {
      const lats = fitToCoordinates.map((c) => c.latitude);
      const lngs = fitToCoordinates.map((c) => c.longitude);
      return {
        bounds: {
          ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
          sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
          paddingLeft: fitPadding,
          paddingRight: fitPadding,
          paddingTop: fitPadding,
          paddingBottom: fitPadding,
        },
      };
    }
    if (fitToCoordinates && fitToCoordinates.length === 1) {
      return {
        centerCoordinate: [fitToCoordinates[0].longitude, fitToCoordinates[0].latitude] as [number, number],
        zoomLevel: 13,
      };
    }
    if (initialCamera) {
      return {
        centerCoordinate: [initialCamera.center.longitude, initialCamera.center.latitude] as [
          number,
          number,
        ],
        zoomLevel: initialCamera.zoom,
      };
    }
    return { centerCoordinate: DEFAULT_CENTER, zoomLevel: DEFAULT_ZOOM };
    // cameraKey, bağımlılıkları özetleyen stabil bir string olarak kullanılıyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, fitPadding]);

  return (
    <Mapbox.MapView
      style={[styles.flex, style]}
      styleURL={Mapbox.StyleURL.Dark}
      onPress={(feature) => {
        if (!onMapPress) return;
        const point = feature.geometry as GeoJSON.Point;
        const [longitude, latitude] = point.coordinates;
        onMapPress({ latitude, longitude });
      }}
    >
      <Mapbox.Camera animationDuration={400} {...cameraSettings} />
      {showsUserLocation ? <Mapbox.UserLocation visible /> : null}
      {children}
    </Mapbox.MapView>
  );
}

type AppMapMarkerProps = {
  marker: MapMarkerData;
  children?: ReactNode;
};

export function AppMapMarker({ marker, children }: AppMapMarkerProps) {
  return (
    <Mapbox.PointAnnotation
      id={marker.id}
      coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
    >
      <View>{children ?? <View style={styles.defaultMarker} />}</View>
    </Mapbox.PointAnnotation>
  );
}

type AppMapPolylineProps = {
  id: string;
  coordinates: LatLng[];
  color?: string;
  width?: number;
};

export function AppMapPolyline({ id, coordinates, color = colors.primary, width = 4 }: AppMapPolylineProps) {
  if (coordinates.length < 2) return null;

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: coordinates.map((c) => [c.longitude, c.latitude]),
    },
  };

  return (
    <Mapbox.ShapeSource id={`${id}-source`} shape={geojson}>
      <Mapbox.LineLayer
        id={`${id}-layer`}
        style={{ lineColor: color, lineWidth: width, lineCap: "round", lineJoin: "round" }}
      />
    </Mapbox.ShapeSource>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  defaultMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
});
