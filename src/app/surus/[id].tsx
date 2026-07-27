import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from "react-native";

import { deleteRide, fetchRideById } from "@/features/recording/api/recordingApi";
import type { RecordedRide } from "@/features/recording/types";
import { buildGpxDocument } from "@/features/recording/utils/gpx";
import { writeAndShareGpx } from "@/features/recording/utils/gpxFile";
import { AppMapPolyline, AppMapView } from "@/lib/map";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, spacing } from "@/shared/theme";
import { geoJsonLineStringToLatLngs } from "@/shared/utils/geo";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} sa ${minutes} dk` : `${minutes} dk`;
}

export default function SurusDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<RecordedRide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRideById(id);
      setRide(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Mount'ta sürüş verisini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleExport = async () => {
    if (!ride) return;
    setExporting(true);
    try {
      const points = geoJsonLineStringToLatLngs(ride.track_geojson);
      const xml = buildGpxDocument({
        name: `Kavis Sürüşü ${ride.started_at}`,
        points,
        startedAtIso: ride.started_at,
      });
      await writeAndShareGpx(`kavis-suruş-${ride.id}.gpx`, xml);
    } catch (err) {
      Alert.alert("Dışa aktarılamadı", describeError(err));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = () => {
    if (!ride) return;
    Alert.alert("Sürüşü Sil", "Bu sürüş kalıcı olarak silinecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteRide(ride);
            router.replace("/(tabs)/surus-kaydi");
          } catch (err) {
            Alert.alert("Silinemedi", describeError(err));
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error || !ride) {
    return (
      <ScreenContainer style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.errorText}>
          {error ?? "Sürüş bulunamadı."}
        </AppText>
      </ScreenContainer>
    );
  }

  const points = geoJsonLineStringToLatLngs(ride.track_geojson);

  return (
    <>
      <Stack.Screen options={{ title: "Sürüş Detayı", headerShown: true }} />
      <ScreenContainer padded={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.mapWrapper}>
            <AppMapView fitToCoordinates={points}>
              <AppMapPolyline id="ride-detail" coordinates={points} />
            </AppMapView>
          </View>

          <View style={styles.content}>
            <View style={styles.statsRow}>
              <StatBlock label="Mesafe" value={ride.distance_km !== null ? `${ride.distance_km} km` : "-"} />
              <StatBlock label="Süre" value={formatDuration(ride.duration_seconds)} />
              <StatBlock
                label="Ort. Hız"
                value={ride.avg_speed_kmh !== null ? `${ride.avg_speed_kmh} km/sa` : "-"}
              />
              <StatBlock
                label="Maks. Hız"
                value={ride.max_speed_kmh !== null ? `${ride.max_speed_kmh} km/sa` : "-"}
              />
            </View>

            {ride.gpx_storage_path ? (
              <View style={styles.importedBadge}>
                <Ionicons name="download-outline" size={14} color={colors.textSecondary} />
                <AppText variant="caption" color={colors.textSecondary} style={styles.importedText}>
                  GPX dosyasından içe aktarıldı
                </AppText>
              </View>
            ) : null}

            <Button
              label="GPX Dışa Aktar"
              onPress={handleExport}
              variant="secondary"
              loading={exporting}
              style={styles.exportButton}
            />
            <Button label="Sürüşü Sil" onPress={handleDelete} variant="danger" loading={deleting} />
          </View>
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <AppText variant="bodyMedium">{value}</AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  mapWrapper: {
    height: 260,
  },
  content: {
    padding: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
  },
  statBlock: {
    alignItems: "center",
    minWidth: 80,
    marginBottom: spacing.sm,
  },
  importedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  importedText: {
    marginLeft: spacing.xs,
  },
  exportButton: {
    marginBottom: spacing.sm,
  },
});
