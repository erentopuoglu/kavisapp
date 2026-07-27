import { Link, router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { signInWithEmail, signInWithGoogle } from "@/features/auth/api/authApi";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, spacing } from "@/shared/theme";

export default function GirisScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert("Eksik bilgi", "E-posta ve şifre gerekli.");
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/(tabs)/kesfet");
    } catch (err) {
      Alert.alert("Giriş başarısız", err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace("/(tabs)/kesfet");
    } catch (err) {
      Alert.alert("Giriş başarısız", err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu.");
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="displayLg">Kavis</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          Rotanı keşfet, sür, paylaş.
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
      <TextField
        label="Şifre"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
      />

      <Link href="/(auth)/sifremi-unuttum" asChild>
        <AppText variant="caption" color={colors.primary} style={styles.forgotLink}>
          Şifremi unuttum
        </AppText>
      </Link>

      <Button label="Giriş Yap" onPress={handleEmailLogin} loading={isSubmitting} style={styles.button} />

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <AppText variant="caption" color={colors.textSecondary} style={styles.dividerText}>
          veya
        </AppText>
        <View style={styles.dividerLine} />
      </View>

      <Button
        label="Google ile Giriş Yap"
        onPress={handleGoogleLogin}
        variant="secondary"
        loading={isGoogleSubmitting}
      />

      <View style={styles.footer}>
        <AppText variant="body" color={colors.textSecondary}>
          Hesabın yok mu?{" "}
        </AppText>
        <Link href="/(auth)/kayit" asChild>
          <AppText variant="bodyMedium" color={colors.primary}>
            Kayıt ol
          </AppText>
        </Link>
      </View>
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
  forgotLink: {
    alignSelf: "flex-end",
    marginBottom: spacing.lg,
  },
  button: {
    marginBottom: spacing.lg,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
});
