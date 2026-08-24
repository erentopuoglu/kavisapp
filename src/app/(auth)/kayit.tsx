import { Link, router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { signUpWithEmail } from "@/features/auth/api/authApi";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, spacing } from "@/shared/theme";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export default function KayitScreen() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignUp = async () => {
    const normalizedUsername = username.trim().toLowerCase();

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      Alert.alert(
        "Geçersiz kullanıcı adı",
        "Kullanıcı adı 3-20 karakter olmalı, sadece küçük harf, rakam ve alt çizgi içerebilir."
      );
      return;
    }
    if (!email || !password) {
      Alert.alert("Eksik bilgi", "E-posta ve şifre gerekli.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Zayıf şifre", "Şifre en az 8 karakter olmalı.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { session } = await signUpWithEmail(email.trim(), password, normalizedUsername);
      if (session) {
        router.replace("/(tabs)/kesfet");
      } else {
        Alert.alert(
          "E-postanı kontrol et",
          "Hesabını doğrulamak için e-postana gönderdiğimiz bağlantıya tıkla, ardından giriş yapabilirsin."
        );
        router.replace("/(auth)/giris");
      }
    } catch (err) {
      Alert.alert("Kayıt başarısız", err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="title">Hesap Oluştur</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          Topluluğa katıl, rotanı paylaş.
        </AppText>
      </View>

      <TextField
        label="Kullanıcı adı"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
        placeholder="orn_kullanici_adi"
      />
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
        placeholder="en az 8 karakter"
      />

      <Button label="Kayıt Ol" onPress={handleSignUp} loading={isSubmitting} style={styles.button} />

      <AppText variant="caption" color={colors.textSecondary} style={styles.consentText}>
        Kayıt olarak{" "}
        <Link href="/kullanim-kosullari" asChild>
          <AppText variant="caption" color={colors.primary}>
            Kullanım Koşulları
          </AppText>
        </Link>
        {"'"}nı ve{" "}
        <Link href="/gizlilik-politikasi" asChild>
          <AppText variant="caption" color={colors.primary}>
            Gizlilik Politikası
          </AppText>
        </Link>
        {"'"}nı kabul etmiş olursunuz.
      </AppText>

      <View style={styles.footer}>
        <AppText variant="body" color={colors.textSecondary}>
          Zaten hesabın var mı?{" "}
        </AppText>
        <Link href="/(auth)/giris" asChild>
          <AppText variant="bodyMedium" color={colors.primary}>
            Giriş yap
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
  button: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  consentText: {
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
});
