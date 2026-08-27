import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { fetchLeaderboard, fetchMyWeeklyDistanceKm, finalizeWeeklyAwardsIfNeeded } from "@/features/leaderboard/api/leaderboardApi";
import { LEADERBOARD_CATEGORIES, type LeaderboardCategory, type LeaderboardEntry } from "@/features/leaderboard/types";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Liderlik tablosu yüklenirken bir hata oluştu.";
}

// Rütbe rozetleri sadece görsel — mesafe/hız gibi tehlikeli bir metriğe
// dayanmıyor, sadece o kategorideki SIRAYA göre (bkz. proje güvenlik
// ilkesi: hiçbir sıralama mesafe/hız temelli değil).
const RANK_ICONS = ["🥇", "🥈", "🥉"];

type Props = {
  userId: string | undefined;
};

export function LeaderboardView({ userId }: Props) {
  const [category, setCategory] = useState<LeaderboardCategory>("routes_ridden");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myWeeklyKm, setMyWeeklyKm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    (async () => {
      // Ekran her açıldığında geçen haftanın ödülleri henüz dağıtılmadıysa
      // dağıtılır (idempotent, cron yok) — bkz. finalize_weekly_awards.
      await finalizeWeeklyAwardsIfNeeded();
      const data = await fetchLeaderboard(category);
      if (!cancelled) setEntries(data);
    })()
      .catch((err) => {
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyWeeklyDistanceKm(userId)
      .then((km) => {
        if (!cancelled) setMyWeeklyKm(km);
      })
      .catch(() => {
        // Kişisel istatistik — sessizce atlanabilir, liderlik tablosunun
        // kendisini engellememeli.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const categoryMeta = LEADERBOARD_CATEGORIES.find((c) => c.key === category)!;

  return (
    <View style={styles.container}>
      {myWeeklyKm !== null ? (
        <View style={styles.myStatBanner}>
          <AppText variant="caption" color={colors.textSecondary}>
            Bu hafta kişisel toplamın: <AppText variant="bodyMedium">{myWeeklyKm.toFixed(1)} km</AppText> — bu
            sadece bilgi amaçlı, hiçbir sıralamada kullanılmıyor.
          </AppText>
        </View>
      ) : null}

      <View style={styles.categoryRow}>
        {LEADERBOARD_CATEGORIES.map((option) => {
          const active = category === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setCategory(option.key)}
              style={[styles.categoryPill, active && styles.categoryPillActive]}
            >
              <AppText variant="caption" color={active ? colors.textPrimary : colors.textSecondary}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <AppText variant="body" color={colors.danger} style={styles.centerText}>
            {error}
          </AppText>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centerFill}>
          <AppText variant="body" color={colors.textSecondary} style={styles.centerText}>
            Bu hafta {categoryMeta.label.toLowerCase()} kategorisinde henüz kimse yok — ilk sen ol!
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {entries.map((entry, index) => (
            <View key={entry.username} style={styles.row}>
              <AppText variant="bodyMedium" style={styles.rank}>
                {RANK_ICONS[index] ?? `${index + 1}.`}
              </AppText>
              <AppText variant="bodyMedium" style={styles.username}>
                {entry.username}
              </AppText>
              <AppText variant="bodyMedium" color={colors.primary}>
                {entry.count} {categoryMeta.unit}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  myStatBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  list: {
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rank: {
    width: 32,
  },
  username: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  centerText: {
    textAlign: "center",
  },
});
