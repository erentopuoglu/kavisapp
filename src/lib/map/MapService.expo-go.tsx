import { Children, isValidElement, PropsWithChildren, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";

import { computeFlyoverPlan, getFlyoverProgress, type FlyoverProgress } from "@/lib/map/flyoverPath";
import type { CameraPosition, LatLng, MapMarkerData } from "@/lib/map/types";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

// flyover: gerçek Mapbox terrain/kamera render edilmiyor, ama
// computeFlyoverPlan/getFlyoverProgress Mapbox'a bağımlı olmayan SAF
// fonksiyonlar (bkz. flyoverPath.ts) — burada da aynılarını kullanarak
// GERÇEK zaman çizelgesini simüle ediyoruz. Böylece "Oynat" düğmesinin
// state/callback akışı (onProgress/onFinish) Expo Go'da da uçtan uca
// test edilebiliyor, sadece görsel render eksik.
export type FlyoverControl = {
  active: boolean;
  coordinates: LatLng[];
  onProgress?: (progress: FlyoverProgress) => void;
  onFinish?: () => void;
};
export type { FlyoverProgress };

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
  flyover?: FlyoverControl;
}>;

const FLYOVER_SIMULATION_TICK_MS = 200;

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
  flyover,
  children,
}: AppMapViewProps) {
  const { markers, polylines } = useMemo(() => countMapChildren(children), [children]);
  const center = formatCenter(fitToCoordinates, initialCamera);
  const [simulatedProgress, setSimulatedProgress] = useState<FlyoverProgress | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // simulatedProgress'i burada null'lamıyoruz — aşağıdaki JSX zaten
    // flyover?.active değilken bu bloğu hiç render etmiyor, ve bir sonraki
    // oynatma başladığında ilk tick birkaç yüz ms içinde günceller.
    if (!flyover?.active) return;

    const plan = computeFlyoverPlan(flyover.coordinates);
    if (!plan) {
      flyover.onFinish?.();
      return;
    }

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = getFlyoverProgress(plan, elapsed);
      setSimulatedProgress(progress);
      flyover.onProgress?.(progress);
      if (elapsed >= plan.totalDurationMs && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        flyover.onFinish?.();
      }
    }, FLYOVER_SIMULATION_TICK_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyover?.active]);

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
      {flyover?.active ? (
        <AppText variant="caption" color={colors.primary}>
          3D Flyover simülasyonu (Expo Go&apos;da terrain render edilmiyor) —{" "}
          {simulatedProgress ? `${simulatedProgress.traveledKm.toFixed(1)}/${simulatedProgress.totalKm.toFixed(1)} km` : "başlıyor…"}
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
  draggable?: boolean;
  onDragEnd?: (coordinate: LatLng) => void;
};

// Gerçek haritada nokta çizer; burada sadece AppMapView'in sayabilmesi için
// var — kendi başına hiçbir şey render etmez. draggable/onDragEnd MapService.tsx
// ile aynı imzayı korumak için var, Expo Go'da sürükleme simüle edilmiyor.
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
