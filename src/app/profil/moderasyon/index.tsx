import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { fetchStats } from "@/features/admin/api/adminApi";
import type { AdminStats } from "@/features/admin/types";
import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "İstatistikler yüklenemedi.";
}

const NAV_ITEMS: { href: "/profil/moderasyon/raporlar" | "/profil/moderasyon/gizli-icerik" | "/profil/moderasyon/kullanicilar"; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }[] = [
  {
    href: "/profil/moderasyon/raporlar",
    icon: "flag-outline",
    title: "Bekleyen Raporlar",
    subtitle: "İçerik önizlemesi, rapor sebepleri, gizle/reddet",
  },
  {
    href: "/profil/moderasyon/gizli-icerik",
    icon: "eye-off-outline",
    title: "Gizlenmiş İçerikler",
    subtitle: "Otomatik veya elle gizlenmiş içeriği geri aç",
  },
  {
    href: "/profil/moderasyon/kullanicilar",
    icon: "people-outline",
    title: "Kullanıcılar",
    subtitle: "Kullanıcı ara, banla / ban kaldır",
  },
];

export default function ModerasyonHubScreen() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchStats());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount'ta sayaçları çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: "Moderasyon", headerShown: true }} />
      <ScreenContainer>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
            <AppText variant="body" color={colors.danger} style={styles.errorText}>
              {error}
            </AppText>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatTile label="Kullanıcı" value={stats?.userCount ?? 0} />
            <StatTile label="Rota" value={stats?.routeCount ?? 0} />
            <StatTile label="İşaretli Nokta" value={stats?.poiCount ?? 0} />
            <StatTile label="Bekleyen Rapor" value={stats?.pendingReportCount ?? 0} highlight />
          </View>
        )}

        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => (
            <Pressable
              key={item.href}
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={() => router.push(item.href)}
            >
              <View style={styles.navIcon}>
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.navTextWrap}>
                <AppText variant="bodyMedium">{item.title}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {item.subtitle}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
            </Pressable>
          ))}
        </View>
      </ScreenContainer>
    </>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={[styles.statTile, highlight && value > 0 && styles.statTileHighlight]}>
      <AppText variant="title" color={highlight && value > 0 ? colors.warning : colors.textPrimary}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xxl,
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statTileHighlight: {
    borderColor: colors.warning,
  },
  navList: {
    marginTop: spacing.xl,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  navRowPressed: {
    opacity: 0.8,
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  navTextWrap: {
    flex: 1,
  },
});
