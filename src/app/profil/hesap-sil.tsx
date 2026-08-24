import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

const CONFIRM_PHRASE = "HESABIMI SİL";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Hesap silinemedi.";
}

const DELETED_ITEMS = [
  "Profiliniz (kullanıcı adı, biyografi, motosiklet modeli)",
  "Oluşturduğunuz rotalar ve puanlamalar",
  "İşaretli noktalarınız (POI)",
  "Forum sorularınız ve cevaplarınız",
  "Sürüş kayıtlarınız ve içe aktardığınız GPX dosyaları",
  "Grup sürüşü katılımlarınız ve sohbet mesajlarınız",
];

export default function HesapSilScreen() {
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleDelete = () => {
    Alert.alert(
      "Hesabı Kalıcı Olarak Sil",
      "Bu işlem geri alınamaz. Emin misiniz?",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Hesabımı Sil",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              await deleteAccount();
              router.replace("/(auth)/giris");
            } catch (err) {
              Alert.alert("Silinemedi", describeError(err));
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Hesabımı Sil", headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={20} color={colors.danger} />
            <AppText variant="bodyMedium" color={colors.danger} style={styles.warningText}>
              Bu işlem geri alınamaz.
            </AppText>
          </View>

          <AppText variant="body" color={colors.textSecondary} style={styles.intro}>
            Hesabınızı sildiğinizde aşağıdakiler kalıcı olarak silinir:
          </AppText>

          {DELETED_ITEMS.map((item) => (
            <View key={item} style={styles.itemRow}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <AppText variant="body" color={colors.textSecondary} style={styles.itemText}>
                {item}
              </AppText>
            </View>
          ))}

          <AppText variant="caption" color={colors.textSecondary} style={styles.confirmLabel}>
            Devam etmek için aşağıya &quot;{CONFIRM_PHRASE}&quot; yazın:
          </AppText>
          <TextField
            autoCapitalize="characters"
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_PHRASE}
          />

          <Button
            label="Hesabımı Kalıcı Olarak Sil"
            onPress={handleDelete}
            variant="danger"
            disabled={!canDelete}
            loading={submitting}
            style={styles.deleteButton}
          />
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  warningText: {
    marginLeft: spacing.xs,
  },
  intro: {
    marginTop: spacing.lg,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  itemText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  confirmLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  deleteButton: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
