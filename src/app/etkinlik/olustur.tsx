import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { createGroupRide } from "@/features/group-rides/api/groupRidesApi";
import { parseScheduledAt } from "@/features/group-rides/utils";
import { AppMapMarker, AppMapView } from "@/lib/map";
import type { LatLng } from "@/lib/map/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Etkinlik kaydedilirken bir hata oluştu.";
}

export default function EtkinlikOlusturScreen() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAddress, setStartAddress] = useState("");
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [dateText, setDateText] = useState("");
  const [timeText, setTimeText] = useState("");
  const [maxParticipantsText, setMaxParticipantsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Eksik bilgi", "Etkinlik başlığı gerekli.");
      return;
    }

    const scheduledAt = parseScheduledAt(dateText, timeText);
    if (!scheduledAt) {
      Alert.alert("Geçersiz tarih/saat", "Tarihi GG.AA.YYYY, saati SS:DD biçiminde girin.");
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      Alert.alert("Geçersiz tarih", "Etkinlik tarihi gelecekte olmalı.");
      return;
    }

    let maxParticipants: number | undefined;
    if (maxParticipantsText.trim()) {
      maxParticipants = Number(maxParticipantsText.trim());
      if (Number.isNaN(maxParticipants) || maxParticipants <= 0) {
        Alert.alert("Geçersiz kontenjan", "Kontenjan pozitif bir sayı olmalı.");
        return;
      }
    }

    setSubmitting(true);
    setSaveError(null);
    try {
      const ride = await createGroupRide({
        title: title.trim(),
        description: description.trim() || undefined,
        startPoint: startPoint ?? undefined,
        startAddress: startAddress.trim() || undefined,
        scheduledAt,
        maxParticipants,
      });
      router.replace({ pathname: "/etkinlik/[id]", params: { id: ride.id } });
    } catch (err) {
      const message = describeError(err);
      setSaveError(message);
      Alert.alert("Kaydedilemedi", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Etkinlik Oluştur", headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="örn. Cumartesi Kahvaltı Turu" />
          <TextField
            label="Açıklama (opsiyonel)"
            value={description}
            onChangeText={setDescription}
            placeholder="Etkinlik hakkında kısa bilgi"
            multiline
            numberOfLines={3}
            style={styles.multilineInput}
          />

          <AppText variant="caption" color={colors.textSecondary} style={styles.sectionLabel}>
            Buluşma Noktası (opsiyonel)
          </AppText>
          <View style={styles.mapWrapper}>
            <AppMapView
              onMapPress={setStartPoint}
              initialCamera={startPoint ? { center: startPoint, zoom: 13 } : undefined}
            >
              {startPoint ? (
                <AppMapMarker marker={{ id: "start-point", coordinate: startPoint }} />
              ) : null}
            </AppMapView>
            {!startPoint ? (
              <View style={styles.hintBanner}>
                <AppText variant="caption" color={colors.textSecondary}>
                  Buluşma noktası seçmek için haritaya dokunun
                </AppText>
              </View>
            ) : null}
          </View>
          {startPoint ? (
            <Button
              label="Noktayı Temizle"
              onPress={() => setStartPoint(null)}
              variant="secondary"
              style={styles.clearPointButton}
            />
          ) : null}

          <TextField
            label="Buluşma Adresi (opsiyonel)"
            value={startAddress}
            onChangeText={setStartAddress}
            placeholder="örn. Ankara Kızılay Meydanı"
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <TextField
                label="Tarih (GG.AA.YYYY)"
                value={dateText}
                onChangeText={setDateText}
                placeholder="26.08.2026"
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowItem}>
              <TextField
                label="Saat (SS:DD)"
                value={timeText}
                onChangeText={setTimeText}
                placeholder="09:30"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <TextField
            label="Kontenjan (opsiyonel)"
            value={maxParticipantsText}
            onChangeText={setMaxParticipantsText}
            placeholder="örn. 15"
            keyboardType="number-pad"
          />

          {saveError ? (
            <AppText variant="caption" color={colors.danger} style={styles.errorText}>
              {saveError}
            </AppText>
          ) : null}

          <Button label="Kaydet" onPress={handleSave} loading={submitting} style={styles.saveButton} />
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: spacing.sm,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  mapWrapper: {
    height: 200,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  hintBanner: {
    position: "absolute",
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
  },
  clearPointButton: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
