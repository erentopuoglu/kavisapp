import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { createRideFromGpx, fetchMyRides } from "@/features/recording/api/recordingApi";
import { RideCard } from "@/features/recording/components/RideCard";
import { getBatterySaverMode, setBatterySaverMode } from "@/features/recording/settings/recordingSettings";
import { useRecordingStore } from "@/features/recording/store/useRecordingStore";
import type { RecordedRide } from "@/features/recording/types";
import { parseGpxContent, validateGpxFileSize } from "@/features/recording/utils/gpx";
import { getFileSizeBytes, readFileAsText } from "@/features/recording/utils/gpxFile";
import {
  getBackgroundPermissionStatus,
  getForegroundPermissionStatus,
  requestBackgroundPermission,
  requestForegroundPermission,
} from "@/lib/location/location";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { LocationRationaleModal } from "@/shared/components/LocationRationaleModal";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

export default function SurusKaydiScreen() {
  const session = useAuthStore((state) => state.session);
  const status = useRecordingStore((state) => state.status);
  const recoveredManifest = useRecordingStore((state) => state.recoveredManifest);
  const hydrate = useRecordingStore((state) => state.hydrate);
  const discardRecovered = useRecordingStore((state) => state.discardRecovered);
  const resumeRecoveredAsFinished = useRecordingStore((state) => state.resumeRecoveredAsFinished);
  const start = useRecordingStore((state) => state.start);

  const [rides, setRides] = useState<RecordedRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [batterySaver, setBatterySaver] = useState(false);
  const [showLocationRationale, setShowLocationRationale] = useState<"foreground" | "background" | null>(null);
  const [starting, setStarting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resumingRecovered, setResumingRecovered] = useState(false);
  const [discardingRecovered, setDiscardingRecovered] = useState(false);

  const handleResumeRecovered = async () => {
    setResumingRecovered(true);
    try {
      await resumeRecoveredAsFinished();
      router.push("/surus/ozet");
    } catch (err) {
      Alert.alert("Sonlandırılamadı", describeError(err));
      setResumingRecovered(false);
    }
  };

  const handleDiscardRecovered = async () => {
    setDiscardingRecovered(true);
    try {
      await discardRecovered();
    } catch (err) {
      Alert.alert("Silinemedi", describeError(err));
    } finally {
      setDiscardingRecovered(false);
    }
  };

  const loadRides = useCallback(async () => {
    if (!session) return;
    try {
      const data = await fetchMyRides(session.user.id);
      setRides(data);
    } catch (err) {
      console.warn("[surus-kaydi] sürüşler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // Mount'ta kurtarma durumunu + geçmiş sürüşleri yükle.
    hydrate();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRides();
    getBatterySaverMode().then(setBatterySaver);
  }, [hydrate, loadRides]);

  const beginRecording = async () => {
    setStarting(true);
    try {
      const foreground = await getForegroundPermissionStatus();
      if (foreground.status !== Location.PermissionStatus.GRANTED) {
        setShowLocationRationale("foreground");
        return;
      }
      const background = await getBackgroundPermissionStatus();
      if (background.status !== Location.PermissionStatus.GRANTED) {
        setShowLocationRationale("background");
        return;
      }
      await start(batterySaver);
      router.push("/surus/aktif");
    } catch (err) {
      Alert.alert("Başlatılamadı", describeError(err));
    } finally {
      setStarting(false);
    }
  };

  const handleAcceptForeground = async () => {
    setShowLocationRationale(null);
    const { status: newStatus } = await requestForegroundPermission();
    if (newStatus === Location.PermissionStatus.GRANTED) {
      await beginRecording();
    } else {
      Alert.alert("İzin verilmedi", "Konum izni olmadan sürüş kaydedilemez.");
    }
  };

  const handleAcceptBackground = async () => {
    setShowLocationRationale(null);
    const { status: newStatus } = await requestBackgroundPermission();
    if (newStatus === Location.PermissionStatus.GRANTED) {
      await beginRecording();
    } else {
      Alert.alert(
        "İzin verilmedi",
        "Arka plan konum izni olmadan, uygulama kapalıyken/arka plandayken rotanız kaydedilemez."
      );
    }
  };

  const handleToggleBatterySaver = async (value: boolean) => {
    setBatterySaver(value);
    await setBatterySaverMode(value);
  };

  const handleImportGpx = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/gpx+xml", "application/octet-stream", "text/xml", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setImporting(true);
    try {
      const sizeBytes = asset.size ?? getFileSizeBytes(asset.uri);
      validateGpxFileSize(sizeBytes);

      const xmlContent = await readFileAsText(asset.uri);
      const points = parseGpxContent(xmlContent);

      const ride = await createRideFromGpx({
        points,
        fileUri: asset.uri,
        fileName: asset.name,
      });
      await loadRides();
      router.push({ pathname: "/surus/[id]", params: { id: ride.id } });
    } catch (err) {
      Alert.alert("İçe aktarılamadı", describeError(err));
    } finally {
      setImporting(false);
    }
  };

  const recordingActive = status === "recording";

  return (
    <ScreenContainer padded={false}>
      <View style={styles.header}>
        {recoveredManifest ? (
          <View style={styles.recoveryBanner}>
            <Ionicons name="warning-outline" size={20} color={colors.warning} />
            <AppText variant="caption" color={colors.textSecondary} style={styles.recoveryText}>
              Tamamlanmamış bir sürüş kaydı bulundu ({recoveredManifest.totalPoints} nokta).
            </AppText>
            <View style={styles.recoveryButtons}>
              <Button
                label="Bitir ve Özetle"
                variant="secondary"
                onPress={handleResumeRecovered}
                loading={resumingRecovered}
                style={styles.recoveryButton}
              />
              <Button
                label="Sil"
                variant="danger"
                onPress={handleDiscardRecovered}
                loading={discardingRecovered}
                style={styles.recoveryButton}
              />
            </View>
          </View>
        ) : null}

        {recordingActive ? (
          <Pressable style={styles.activeBanner} onPress={() => router.push("/surus/aktif")}>
            <Ionicons name="recording" size={18} color={colors.danger} />
            <AppText variant="bodyMedium" color={colors.danger} style={styles.activeBannerText}>
              Aktif bir kayıt sürüyor — devam etmek için dokun
            </AppText>
          </Pressable>
        ) : (
          <>
            <Button label="Kaydı Başlat" onPress={beginRecording} loading={starting} />
            <View style={styles.batterySaverRow}>
              <AppText variant="caption" color={colors.textSecondary}>
                Pil Tasarrufu Modu (daha seyrek örnekleme)
              </AppText>
              <Switch
                value={batterySaver}
                onValueChange={handleToggleBatterySaver}
                trackColor={{ true: colors.primary, false: colors.surfaceHighlight }}
              />
            </View>
          </>
        )}

        <Pressable style={styles.importRow} onPress={handleImportGpx} disabled={importing}>
          <Ionicons name="download-outline" size={18} color={colors.primary} />
          <AppText variant="bodyMedium" color={colors.primary} style={styles.importText}>
            {importing ? "İçe aktarılıyor..." : "GPX İçe Aktar"}
          </AppText>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <RideCard ride={item} onPress={() => router.push({ pathname: "/surus/[id]", params: { id: item.id } })} />
          )}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="bicycle-outline" size={32} color={colors.textDisabled} />
              <AppText variant="body" color={colors.textSecondary} style={styles.emptyText}>
                Henüz kaydedilmiş bir sürüşünüz yok.
              </AppText>
            </View>
          }
        />
      )}

      <LocationRationaleModal
        visible={showLocationRationale === "foreground"}
        title="Konum İzni"
        description="Sürüşünüzü kaydedebilmemiz için konumunuza ihtiyacımız var."
        onAccept={handleAcceptForeground}
        onDecline={() => setShowLocationRationale(null)}
      />
      <LocationRationaleModal
        visible={showLocationRationale === "background"}
        title="Arka Planda Konum Takibi"
        description="Sürüş kaydı, uygulama arka plandayken veya ekran kapalıyken de devam eder. Kayıt sırasında sistem çubuğunda kalıcı bir bildirim görünür — bu, Android'in arka plan konum takibi için zorunlu kıldığı bir şeffaflık önlemidir. Konum sadece bu sürüşü kaydetmek için kullanılır."
        onAccept={handleAcceptBackground}
        onDecline={() => setShowLocationRationale(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.md,
  },
  recoveryBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  recoveryText: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  recoveryButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  recoveryButton: {
    flex: 1,
  },
  activeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  activeBannerText: {
    marginLeft: spacing.sm,
  },
  batterySaverRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  importRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  importText: {
    marginLeft: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xxl,
  },
  emptyText: {
    marginTop: spacing.sm,
  },
});
