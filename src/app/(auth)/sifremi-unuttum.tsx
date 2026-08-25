import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { sendPasswordResetEmail } from "@/features/auth/api/authApi";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, spacing } from "@/shared/theme";

export default function SifremiUnuttumScreen() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert("Eksik bilgi", "E-posta adresini gir.");
      return;
    }
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(email.trim());
      Alert.alert(
        "E-posta gönderildi",
        "Şifreni sıfırlamak için e-postana gönderdiğimiz bağlantıyı takip et."
      );
      router.back();
    } catch (err) {
      Alert.alert("Hata", err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <AppText variant="title">Şifremi Unuttum</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
            Kayıtlı e-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.
          </AppText>
        </View>

        <TextField
          label="E-posta"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@eposta.com"
        />

        <Button label="Sıfırlama Bağlantısı Gönder" onPress={handleSubmit} loading={isSubmitting} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
});
