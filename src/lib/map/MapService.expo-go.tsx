import { Children, isValidElement, PropsWithChildren, ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";

import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";
import type { CameraPosition, LatLng, MapMarkerData } from "@/lib/map/types";

// EXPO GO MOCK — gerçek harita çizmez.
//
// @rnmapbox/maps Expo Go'da mevcut değil (autolink edilen, Expo Go binary'sine
// gömülü olmayan bir native modül — sadece development build'te çalışır).
// Bu dosya MapService.tsx ile AYNI public API'yi (AppMapView / AppMapMarker /
// AppMapPolyline, aynı prop şekilleri) taklit eder ama görsel harita yerine,
// AppMapView'e geçilen children'ı sayarak/özetleyerek ekrana geleni gösteren
// bir kutu render eder. Amaç: harita ekranlarındaki veri akışını (sorgular,
// state, prop'lar — Mapbox render'ının KENDİSİ hariç her şeyi) Expo Go'da da
// doğrulayabilmek.
//
// Bu dosyanın hangi durumda MapService.tsx yerine kullanılacağına index.ts
// karar veriyor. Buradaki prop tipleri MapService.tsx'teki ile bilerek
// birebir aynı tutuluyor — biri değişirse diğeri de elle güncellenmeli.

type AppMapViewProps = PropsWithChildren<{
  style?: ViewStyle;
  initialCamera?: CameraPosition;
  fitToCoordinates?: LatLng[];
  fitPadding?: number;
  showsUserLocation?: boolean;
  onMapPress?: (coordinate: LatLng) => void;
}>;

type ChildCounts = { markers: number; polylines: number };

// Ekranlar marker/polyline'ı çoğu zaman bir <View> veya .map() dizisiyle
// sarmalıyor (bkz. harita.tsx) — bu yüzden AppMapMarker/AppMapPolyline'a
// rastlayana kadar bir seviye daha içine bakıyoruz.
function countMapChildren(children: ReactNode): ChildCounts {
  const counts: ChildCounts = { markers: 0, polylines: 0 };
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === AppMapMarker) {
      counts.markers += 1;
      return;
    }
    if (child.type === AppMapPolyline) {
      counts.polylines += 1;
      return;
    }
    const nestedChildren = (child.props as { children?: ReactNode } | undefined)?.children;
    if (nestedChildren) {
      const nested = countMapChildren(nestedChildren);
      counts.markers += nested.markers;
      counts.polylines += nested.polylines;
    }
  });
  return counts;
}

function formatCenter(
  fitToCoordinates: LatLng[] | undefined,
  initialCamera: CameraPosition | undefined
): string {
  if (fitToCoordinates && fitToCoordinates.length > 0) {
    const lat = fitToCoordinates.reduce((sum, c) => sum + c.latitude, 0) / fitToCoordinates.length;
    const lng = fitToCoordinates.reduce((sum, c) => sum + c.longitude, 0) / fitToCoordinates.length;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  if (initialCamera) {
    return `${initialCamera.center.latitude.toFixed(4)}, ${initialCamera.center.longitude.toFixed(4)}`;
  }
  return "varsayılan (Türkiye geneli)";
}

export function AppMapView({
  style,
  initialCamera,
  fitToCoordinates,
  showsUserLocation = false,
  onMapPress,
  children,
}: AppMapViewProps) {
  const { markers, polylines } = useMemo(() => countMapChildren(children), [children]);
  const center = formatCenter(fitToCoordinates, initialCamera);

  return (
    <View style={[styles.container, style]}>
      <AppText variant="overline" color={colors.textSecondary}>
        HARİTA — EXPO GO&apos;DA DEVRE DIŞI
      </AppText>
      <AppText variant="bodyMedium">
        {polylines} çizgi (rota/parkur) · {markers} işaretçi
      </AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        Merkez: {center}
      </AppText>
      {showsUserLocation ? (
        <AppText variant="caption" color={colors.textSecondary}>
          Kullanıcı konumu gösterimi: açık (Expo Go&apos;da simüle edilmiyor)
        </AppText>
      ) : null}
      {onMapPress ? (
        <Pressable
          style={styles.pressHint}
          onPress={() =>
            onMapPress({
              latitude: initialCamera?.center.latitude ?? 39.9334,
              longitude: initialCamera?.center.longitude ?? 32.8597,
            })
          }
        >
          <AppText variant="caption" color={colors.primary}>
            onMapPress akışını test et (sahte koordinat gönderir)
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

type AppMapMarkerProps = {
  marker: MapMarkerData;
  children?: ReactNode;
};

// Gerçek haritada nokta çizer; burada sadece AppMapView'in sayabilmesi için
// var — kendi başına hiçbir şey render etmez.
export function AppMapMarker(_props: AppMapMarkerProps) {
  return null;
}

type AppMapPolylineProps = {
  id: string;
  coordinates: LatLng[];
  color?: string;
  width?: number;
};

export function AppMapPolyline(_props: AppMapPolylineProps) {
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    padding: spacing.md,
    gap: spacing.xs,
  },
  pressHint: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
});
