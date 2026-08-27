import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Çıkış yapılamadı.";
}

export default function ProfilScreen() {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const profileError = useAuthStore((state) => state.profileError);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const signOut = useAuthStore((state) => state.signOut);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/(auth)/giris");
    } catch (err) {
      Alert.alert("Çıkış yapılamadı", describeError(err));
      setSigningOut(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.avatarPlaceholder}>
            <AppText variant="title">{(profile?.username ?? "?").charAt(0).toUpperCase()}</AppText>
          </View>

          {profile ? (
            <>
              <AppText variant="title" style={styles.username}>
                {profile.username}
              </AppText>
              <AppText variant="body" color={colors.textSecondary}>
                {session?.user.email}
              </AppText>
              {profile.bike_model ? (
                <AppText variant="caption" color={colors.primary} style={styles.bikeModel}>
                  {profile.bike_model}
                </AppText>
              ) : null}
            </>
          ) : profileError ? (
            <View style={styles.errorBox}>
              <AppText variant="bodyMedium" color={colors.danger} style={styles.errorTitle}>
                Profil yüklenemedi
              </AppText>
              <AppText variant="caption" color={colors.textSecondary} style={styles.errorDetail}>
                {profileError}
              </AppText>
              <Button label="Tekrar Dene" onPress={refreshProfile} variant="secondary" style={styles.retryButton} />
            </View>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <AppText variant="body" color={colors.textSecondary} style={styles.loadingText}>
                Profil yükleniyor...
              </AppText>
            </View>
          )}
        </View>

        {profile?.is_admin ? (
          <Pressable style={styles.moderationRow} onPress={() => router.push("/profil/moderasyon")}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <AppText variant="bodyMedium" color={colors.primary} style={styles.moderationText}>
              Moderasyon
            </AppText>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        ) : null}

        <Button
          label="Engellenen Kullanıcılar"
          onPress={() => router.push("/profil/engellenenler")}
          variant="secondary"
          style={styles.blockedUsersButton}
        />
        <Button
          label="Gizlilik Politikası"
          onPress={() => router.push("/gizlilik-politikasi")}
          variant="secondary"
          style={styles.legalButton}
        />
        <Button
          label="Kullanım Koşulları"
          onPress={() => router.push("/kullanim-kosullari")}
          variant="secondary"
          style={styles.legalButton}
        />

        <Button
          label="Çıkış Yap"
          onPress={handleSignOut}
          variant="danger"
          loading={signingOut}
          style={styles.signOutButton}
        />

        <AppText variant="caption" color={colors.textSecondary} style={styles.dangerZoneLabel}>
          Tehlikeli Bölge
        </AppText>
        <Button
          label="Hesabımı Sil"
          onPress={() => router.push("/profil/hesap-sil")}
          variant="danger"
          style={styles.deleteAccountButton}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  username: {
    marginBottom: spacing.xs,
  },
  bikeModel: {
    marginTop: spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    marginLeft: spacing.sm,
  },
  errorBox: {
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  errorTitle: {
    marginBottom: spacing.xs,
  },
  errorDetail: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryButton: {
    minWidth: 160,
  },
  moderationRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  moderationText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  blockedUsersButton: {
    marginTop: spacing.xl,
  },
  legalButton: {
    marginTop: spacing.md,
  },
  signOutButton: {
    marginTop: spacing.lg,
  },
  dangerZoneLabel: {
    textAlign: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  deleteAccountButton: {
    marginBottom: spacing.lg,
  },
});
