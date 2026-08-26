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

import { signInWithEmail, signInWithGoogle, signInWithUsername } from "@/features/auth/api/authApi";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, spacing } from "@/shared/theme";

export default function GirisScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      Alert.alert("Eksik bilgi", "E-posta/kullanıcı adı ve şifre gerekli.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (trimmedIdentifier.includes("@")) {
        await signInWithEmail(trimmedIdentifier, password);
      } else {
        await signInWithUsername(trimmedIdentifier.toLowerCase(), password);
      }
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
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <AppText variant="displayLg">Kavis</AppText>
            <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
              Rotanı keşfet, sür, paylaş.
            </AppText>
          </View>

          <TextField
            label="E-posta veya kullanıcı adı"
            autoCapitalize="none"
            autoCorrect={false}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="ornek@eposta.com veya kullanici_adi"
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
            placeholder="••••••••"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <Link href="/(auth)/sifremi-unuttum" asChild>
            <Pressable hitSlop={8} style={styles.forgotLink}>
              <AppText variant="caption" color={colors.primary}>
                Şifremi unuttum
              </AppText>
            </Pressable>
          </Link>

          <Button label="Giriş Yap" onPress={handleLogin} loading={isSubmitting} style={styles.button} />

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
        </ScrollView>

        {/* ScrollView'ın DIŞINDA, sabit bir alt bölüm: bu satır ScrollView
            içeriğinin sonunda kalsaydı, ekranın en alt kenarına çok yakın
            konumlanıp (viewport sınırı/sistem gezinme çubuğu) dokunma alanı
            ölçülemez/tıklanamaz hale gelebiliyordu (bkz. proje notları).
            Ayrı, sabit boyutlu bir View olarak bu kırılgan kenar durumuna
            hiç maruz kalmıyor. */}
        <View style={styles.footer}>
          <AppText variant="body" color={colors.textSecondary}>
            Hesabın yok mu?{" "}
          </AppText>
          <Link href="/(auth)/kayit" asChild>
            <Pressable hitSlop={8}>
              <AppText variant="bodyMedium" color={colors.primary}>
                Kayıt ol
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
