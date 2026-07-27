import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { useRecordingStore } from "@/features/recording/store/useRecordingStore";
import { AppMapPolyline, AppMapView } from "@/lib/map";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";
import { totalDistanceKm } from "@/shared/utils/geo";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export default function AktifSurusScreen() {
  const points = useRecordingStore((state) => state.points);
  const startedAtMs = useRecordingStore((state) => state.startedAtMs);
  const status = useRecordingStore((state) => state.status);
  const stop = useRecordingStore((state) => state.stop);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === "finished") {
      router.replace("/surus/ozet");
    }
  }, [status]);

  const elapsedMs = startedAtMs ? nowMs - startedAtMs : 0;
  const distanceKm = totalDistanceKm(points);
  const lastPoint = points[points.length - 1];
  const currentSpeedKmh = lastPoint?.speedMps && lastPoint.speedMps > 0 ? lastPoint.speedMps * 3.6 : 0;

  const handleStop = () => {
    Alert.alert("Sürüşü Bitir", "Kaydı sonlandırmak istediğinize emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Bitir",
        style: "destructive",
        onPress: async () => {
          setStopping(true);
          await stop();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer padded={false}>
        <View style={styles.mapWrapper}>
          <AppMapView
            initialCamera={lastPoint ? { center: lastPoint, zoom: 16 } : undefined}
            showsUserLocation
          >
            <AppMapPolyline id="active-ride" coordinates={points} />
          </AppMapView>
        </View>

        <View style={styles.statsPanel}>
          <View style={styles.statsRow}>
            <StatBlock label="Süre" value={formatElapsed(elapsedMs)} />
            <StatBlock label="Mesafe" value={`${distanceKm.toFixed(1)} km`} />
            <StatBlock label="Hız" value={`${currentSpeedKmh.toFixed(0)} km/sa`} />
          </View>

          <Button label="Durdur" variant="danger" onPress={handleStop} loading={stopping} style={styles.stopButton} />
        </View>

        <View style={styles.recordingBadge}>
          <Ionicons name="recording" size={14} color={colors.danger} />
          <AppText variant="caption" color={colors.danger} style={styles.recordingBadgeText}>
            Kaydediliyor
          </AppText>
        </View>
      </ScreenContainer>
    </>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    flex: 1,
  },
  recordingBadge: {
    position: "absolute",
    top: spacing.xl,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  recordingBadgeText: {
    marginLeft: spacing.xs,
  },
  statsPanel: {
    backgroundColor: colors.backgroundElevated,
    padding: spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.md,
  },
  statBlock: {
    alignItems: "center",
  },
  stopButton: {},
});
