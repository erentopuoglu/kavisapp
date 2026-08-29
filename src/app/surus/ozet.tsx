import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { createRideFromRecording } from "@/features/recording/api/recordingApi";
import { useRecordingStore } from "@/features/recording/store/useRecordingStore";
import { buildGpxDocument } from "@/features/recording/utils/gpx";
import { writeAndShareGpx } from "@/features/recording/utils/gpxFile";
import { fetchRoutes } from "@/features/routes/api/routesApi";
import type { Route } from "@/features/routes/types";
import { AppMapPolyline, AppMapView } from "@/lib/map";
import { useRouteFlyover } from "@/lib/map/useRouteFlyover";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { FlyoverPlayButton } from "@/shared/components/FlyoverPlayButton";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";
import { totalDistanceKm } from "@/shared/utils/geo";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} sa ${minutes} dk` : `${minutes} dk`;
}

export default function SurusOzetScreen() {
  const points = useRecordingStore((state) => state.points);
  const startedAtMs = useRecordingStore((state) => state.startedAtMs);
  const endedAtMs = useRecordingStore((state) => state.endedAtMs);
  const finalize = useRecordingStore((state) => state.finalize);
  const discard = useRecordingStore((state) => state.discard);
  const hasMockedLocation = useRecordingStore((state) => state.hasMockedLocation);

  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const flyover = useRouteFlyover(points);

  if (points.length < 2 || !startedAtMs) {
    return (
      <ScreenContainer style={styles.center}>
        <AppText variant="body" color={colors.textSecondary}>
          Gösterilecek sürüş verisi yok.
        </AppText>
        <Button label="Geri Dön" onPress={() => router.replace("/(tabs)/surus-kaydi")} style={styles.backButton} />
      </ScreenContainer>
    );
  }

  const durationSeconds = Math.max(0, Math.round(((endedAtMs ?? startedAtMs) - startedAtMs) / 1000));
  const distanceKm = totalDistanceKm(points);
  const avgSpeedKmh = durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const ride = await createRideFromRecording({
        points,
        startedAtMs,
        endedAtMs: endedAtMs ?? Date.now(),
        routeId: selectedRoute?.id,
        isSuspicious: hasMockedLocation,
      });
      await finalize();
      router.replace({ pathname: "/surus/[id]", params: { id: ride.id } });
    } catch (err) {
      Alert.alert("Kaydedilemedi", describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert("Sürüşü Sil", "Bu sürüş kaydı kalıcı olarak silinecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setDiscarding(true);
          try {
            await discard();
            router.replace("/(tabs)/surus-kaydi");
          } catch (err) {
            Alert.alert("Silinemedi", describeError(err));
            setDiscarding(false);
          }
        },
      },
    ]);
  };

  const handleExportGpx = async () => {
    setExporting(true);
    try {
      const startedAtIso = new Date(startedAtMs).toISOString();
      const xml = buildGpxDocument({ name: `Kavis Sürüşü ${startedAtIso}`, points, startedAtIso });
      await writeAndShareGpx(`kavis-suruş-${startedAtMs}.gpx`, xml);
    } catch (err) {
      Alert.alert("Dışa aktarılamadı", describeError(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Sürüş Özeti", headerShown: true }} />
      <ScreenContainer padded={false}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.mapWrapper}>
            <AppMapView fitToCoordinates={points} flyover={flyover.flyover}>
              <AppMapPolyline id="ride-summary" coordinates={points} />
            </AppMapView>
            <FlyoverPlayButton
              isPlaying={flyover.isPlaying}
              progress={flyover.progress}
              disabled={!flyover.canPlay}
              onPress={flyover.toggle}
            />
          </View>

          <View style={styles.content}>
            <View style={styles.statsRow}>
              <StatBlock label="Mesafe" value={`${distanceKm.toFixed(1)} km`} />
              <StatBlock label="Süre" value={formatDuration(durationSeconds)} />
              <StatBlock label="Ort. Hız" value={`${avgSpeedKmh.toFixed(0)} km/sa`} />
            </View>

            <Pressable style={styles.routeLinkRow} onPress={() => setShowRoutePicker(true)}>
              <Ionicons name="link-outline" size={18} color={colors.primary} />
              <AppText variant="body" color={colors.primary} style={styles.routeLinkText}>
                {selectedRoute ? `Rota: ${selectedRoute.title}` : "Bir rotayla ilişkilendir (opsiyonel)"}
              </AppText>
              {selectedRoute ? (
                <Pressable onPress={() => setSelectedRoute(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </Pressable>

            <Button label="Kaydet" onPress={handleSave} loading={saving} style={styles.saveButton} />
            <Button
              label="GPX Dışa Aktar"
              onPress={handleExportGpx}
              variant="secondary"
              loading={exporting}
              style={styles.exportButton}
            />
            <Button label="Sürüşü Sil" onPress={handleDiscard} variant="danger" loading={discarding} />
          </View>
        </ScrollView>
      </ScreenContainer>

      <RoutePickerModal
        visible={showRoutePicker}
        onSelect={(route) => {
          setSelectedRoute(route);
          setShowRoutePicker(false);
        }}
        onClose={() => setShowRoutePicker(false)}
      />
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

function RoutePickerModal({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (route: Route) => void;
  onClose: () => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (text: string) => {
    setLoading(true);
    try {
      const data = await fetchRoutes({ searchText: text, sort: "newest" });
      setRoutes(data);
    } catch (err) {
      console.warn("[RoutePickerModal] rotalar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={() => search("")}
    >
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerCard}>
          <AppText variant="subtitle" style={styles.pickerTitle}>
            Rota Seç
          </AppText>
          <TextField
            placeholder="Rota ara..."
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              search(text);
            }}
          />
          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.pickerLoading} />
          ) : (
            <FlatList
              data={routes}
              keyExtractor={(item) => item.id}
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.pickerRow} onPress={() => onSelect(item)}>
                  <AppText variant="bodyMedium">{item.title}</AppText>
                  {item.region ? (
                    <AppText variant="caption" color={colors.textSecondary}>
                      {item.region}
                    </AppText>
                  ) : null}
                </Pressable>
              )}
              ListEmptyComponent={
                <AppText variant="body" color={colors.textSecondary} style={styles.pickerEmpty}>
                  Rota bulunamadı.
                </AppText>
              }
            />
          )}
          <Button label="Kapat" onPress={onClose} variant="secondary" style={styles.pickerCloseButton} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    marginTop: spacing.md,
  },
  mapWrapper: {
    height: 260,
  },
  content: {
    padding: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
  },
  statBlock: {
    alignItems: "center",
  },
  routeLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  routeLinkText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  saveButton: {
    marginBottom: spacing.sm,
  },
  exportButton: {
    marginBottom: spacing.sm,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  pickerCard: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  pickerTitle: {
    marginBottom: spacing.md,
  },
  pickerLoading: {
    marginVertical: spacing.lg,
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerEmpty: {
    textAlign: "center",
    marginVertical: spacing.lg,
  },
  pickerCloseButton: {
    marginTop: spacing.md,
  },
});
