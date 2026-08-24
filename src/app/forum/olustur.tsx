import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";

import { createQuestion } from "@/features/forum/api/forumApi";
import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Soru kaydedilemedi.";
}

function parseTags(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

export default function ForumOlusturScreen() {
  const profile = useAuthStore((state) => state.profile);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [bikeModelTag, setBikeModelTag] = useState(profile?.bike_model ?? "");
  const [tagsText, setTagsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Eksik bilgi", "Başlık gerekli.");
      return;
    }
    if (!body.trim()) {
      Alert.alert("Eksik bilgi", "Soru metni gerekli.");
      return;
    }

    setSubmitting(true);
    setSaveError(null);
    try {
      const question = await createQuestion({
        title: title.trim(),
        body: body.trim(),
        bikeModelTag: bikeModelTag.trim() || undefined,
        tags: parseTags(tagsText),
      });
      router.replace({ pathname: "/forum/[id]", params: { id: question.id } });
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
      <Stack.Screen options={{ title: "Soru Sor", headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="örn. Zincir gerginliği nasıl ayarlanır?" />
          <TextField
            label="Soru"
            value={body}
            onChangeText={setBody}
            placeholder="Sorunuzu detaylandırın"
            multiline
            numberOfLines={5}
            style={styles.bodyInput}
          />
          <TextField
            label="Motosiklet modeli (opsiyonel)"
            value={bikeModelTag}
            onChangeText={setBikeModelTag}
            placeholder="örn. Yamaha MT-07"
          />
          <TextField
            label="Etiketler (opsiyonel, virgülle ayırın)"
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="örn. bakım, lastik, zincir"
          />

          {saveError ? (
            <AppText variant="caption" color={colors.danger} style={styles.errorText}>
              {saveError}
            </AppText>
          ) : null}

          <Button label="Soruyu Yayınla" onPress={handleSave} loading={submitting} style={styles.saveButton} />
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  bodyInput: {
    minHeight: 110,
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
