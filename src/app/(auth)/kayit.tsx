import { Link, router } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

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

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
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
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailRef.current?.focus()}
          />
          <TextField
            ref={emailRef}
            label="E-posta"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@eposta.com"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="Şifre"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="en az 8 karakter"
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
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
        </ScrollView>

        {/* ScrollView'ın DIŞINDA, sabit bir alt bölüm: bu satır ScrollView
            içeriğinin sonunda kalsaydı, ekranın en alt kenarına çok yakın
            konumlanıp (viewport sınırı/sistem gezinme çubuğu) dokunma alanı
            ölçülemez/tıklanamaz hale gelebiliyordu (bkz. proje notları).
            Ayrı, sabit boyutlu bir View olarak bu kırılgan kenar durumuna
            hiç maruz kalmıyor. */}
        <View style={styles.footer}>
          <AppText variant="body" color={colors.textSecondary}>
            Zaten hesabın var mı?{" "}
          </AppText>
          <Link href="/(auth)/giris" asChild>
            <Pressable hitSlop={8}>
              <AppText variant="bodyMedium" color={colors.primary}>
                Giriş yap
              </AppText>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  button: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  consentText: {
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
