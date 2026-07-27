import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

export default function ProfilScreen() {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const profileError = useAuthStore((state) => state.profileError);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const signOut = useAuthStore((state) => state.signOut);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/giris");
  };

  return (
    <ScreenContainer>
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

      <Button label="Çıkış Yap" onPress={handleSignOut} variant="danger" style={styles.signOutButton} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  signOutButton: {
    marginTop: spacing.xl,
  },
});
