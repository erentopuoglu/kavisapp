import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { createRoute, MAX_ROUTE_POINTS } from "@/features/routes/api/routesApi";
import { totalDistanceKm } from "@/shared/utils/geo";
import { AppMapPolyline, AppMapView } from "@/lib/map";
import type { LatLng } from "@/lib/map/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

type Step = "draw" | "form";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Rota kaydedilirken bir hata oluştu.";
}

export default function RotaOlusturScreen() {
  const [step, setStep] = useState<Step>("draw");
  const [points, setPoints] = useState<LatLng[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [durationText, setDurationText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleMapPress = (coordinate: LatLng) => {
    if (points.length >= MAX_ROUTE_POINTS) {
      Alert.alert("Nokta sınırına ulaşıldı", `Bir rota en fazla ${MAX_ROUTE_POINTS} nokta içerebilir.`);
      return;
    }
    setPoints((prev) => [...prev, coordinate]);
  };

  const handleUndo = () => setPoints((prev) => prev.slice(0, -1));
  const handleReset = () => setPoints([]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Eksik bilgi", "Rota başlığı gerekli.");
      return;
    }
    const durationMin = durationText.trim() ? Number(durationText.trim()) : undefined;
    if (durationText.trim() && (Number.isNaN(durationMin) || (durationMin ?? 0) <= 0)) {
      Alert.alert("Geçersiz süre", "Tahmini süre pozitif bir sayı olmalı.");
      return;
    }

    setSubmitting(true);
    try {
      const route = await createRoute({
        title: title.trim(),
        description: description.trim() || undefined,
        region: region.trim() || undefined,
        estimatedDurationMin: durationMin,
        points,
      });
      router.replace({ pathname: "/rota/[id]", params: { id: route.id } });
    } catch (err) {
      Alert.alert("Kaydedilemedi", describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "draw") {
    return (
      <>
        <Stack.Screen options={{ title: "Rota Çiz", headerShown: true }} />
        <ScreenContainer padded={false}>
          <View style={styles.mapWrapper}>
            <AppMapView onMapPress={handleMapPress} showsUserLocation fitToCoordinates={points}>
              <AppMapPolyline id="draft-route" coordinates={points} />
            </AppMapView>

            <View style={styles.hintBanner}>
              <AppText variant="caption" color={colors.textSecondary}>
                Rotayı çizmek için haritaya dokunun ({points.length}/{MAX_ROUTE_POINTS} nokta)
              </AppText>
            </View>

            <View style={styles.drawControls}>
              <Pressable
                style={[styles.controlButton, points.length === 0 && styles.controlButtonDisabled]}
                onPress={handleUndo}
                disabled={points.length === 0}
              >
                <Ionicons name="arrow-undo" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                style={[styles.controlButton, points.length === 0 && styles.controlButtonDisabled]}
                onPress={handleReset}
                disabled={points.length === 0}
              >
                <Ionicons name="trash" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              label={`İleri (${totalDistanceKm(points).toFixed(1)} km)`}
              onPress={() => setStep("form")}
              disabled={points.length < 2}
            />
          </View>
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Rota Bilgileri", headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="örn. Kuzey Kıyı Turu" />
          <TextField
            label="Açıklama (opsiyonel)"
            value={description}
            onChangeText={setDescription}
            placeholder="Rota hakkında kısa bilgi"
            multiline
            numberOfLines={3}
            style={styles.multilineInput}
          />
          <TextField label="Bölge (opsiyonel)" value={region} onChangeText={setRegion} placeholder="örn. Karadeniz" />
          <TextField
            label="Tahmini Süre (dakika, opsiyonel)"
            value={durationText}
            onChangeText={setDurationText}
            placeholder="örn. 120"
            keyboardType="number-pad"
          />

          <View style={styles.summaryBox}>
            <AppText variant="caption" color={colors.textSecondary}>
              Mesafe: {totalDistanceKm(points).toFixed(1)} km · {points.length} nokta
            </AppText>
          </View>

          <Button label="Kaydet" onPress={handleSave} loading={submitting} style={styles.saveButton} />
          <Button label="Geri Dön (Çizimi Düzenle)" onPress={() => setStep("draw")} variant="secondary" />
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    flex: 1,
  },
  hintBanner: {
    position: "absolute",
    top: spacing.md,
    alignSelf: "center",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  drawControls: {
    position: "absolute",
    right: spacing.lg,
    top: spacing.lg + 40,
    gap: spacing.sm,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonDisabled: {
    opacity: 0.4,
  },
  footer: {
    padding: spacing.md,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  summaryBox: {
    marginBottom: spacing.md,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
