import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { createPoi } from "@/features/poi/api/poiApi";
import { POI_TYPES, POI_TYPE_META, type PoiType } from "@/features/poi/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const { message, details, hint, code } = err as {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string;
    };
    if (message) {
      return [message, details, hint, code ? `kod: ${code}` : null].filter(Boolean).join(" — ");
    }
  }
  if (err instanceof Error) return err.message;
  return "İşaretli nokta kaydedilemedi.";
}

export default function PoiOlusturScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat: string; lng: string }>();
  const [selectedType, setSelectedType] = useState<PoiType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const latitude = Number(lat);
  const longitude = Number(lng);
  const hasValidLocation = !Number.isNaN(latitude) && !Number.isNaN(longitude);

  const handleSave = async () => {
    if (!hasValidLocation) {
      Alert.alert("Konum eksik", "Bir konum seçilmeden işaretli nokta eklenemez.");
      return;
    }
    if (!selectedType) {
      Alert.alert("Eksik bilgi", "Bir tür seçin.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Eksik bilgi", "Başlık gerekli.");
      return;
    }

    setSubmitting(true);
    setSaveError(null);
    try {
      const poi = await createPoi({
        type: selectedType,
        title: title.trim(),
        description: description.trim() || undefined,
        location: { latitude, longitude },
      });
      console.log("[poi/olustur] POI oluşturuldu:", poi.id, poi);
      router.replace({ pathname: "/poi/[id]", params: { id: poi.id } });
    } catch (err) {
      const message = describeError(err);
      console.error("[poi/olustur] POI oluşturulamadı:", message, err);
      setSaveError(message);
      Alert.alert("Kaydedilemedi", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "İşaretli Nokta Ekle", headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AppText variant="caption" color={colors.textSecondary} style={styles.sectionLabel}>
            Tür
          </AppText>
          <View style={styles.typeGrid}>
            {POI_TYPES.map((type) => {
              const meta = POI_TYPE_META[type];
              const active = selectedType === type;
              return (
                <Pressable
                  key={type}
                  style={[styles.typeCard, active && styles.typeCardActive]}
                  onPress={() => setSelectedType(type)}
                >
                  <MaterialCommunityIcons
                    name={meta.icon}
                    size={22}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <AppText
                    variant="caption"
                    color={active ? colors.primary : colors.textSecondary}
                    style={styles.typeCardLabel}
                  >
                    {meta.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="örn. Kavşak Benzinlik" />
          <TextField
            label="Açıklama (opsiyonel)"
            value={description}
            onChangeText={setDescription}
            placeholder="Ek bilgi verin"
            multiline
            numberOfLines={3}
            style={styles.descriptionInput}
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
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeCard: {
    width: "31%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  typeCardLabel: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
  descriptionInput: {
    minHeight: 70,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
