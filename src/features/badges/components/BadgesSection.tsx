import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { fetchBadgesWithStatus } from "@/features/badges/api/badgesApi";
import type { BadgeWithStatus } from "@/features/badges/types";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

type Props = {
  userId: string;
};

// TAMAMEN KİŞİSEL bir koleksiyon — başka kullanıcıların rozetleri hiçbir
// yerde gösterilmiyor/karşılaştırılmıyor (bkz. RLS: user_badges_select_own).
// Kazanılmamış rozetler de listelenir (soluk/kilitli) — koleksiyon hissini
// güçlendirmek için: "bunu henüz kazanmadım ama var olduğunu biliyorum".
export function BadgesSection({ userId }: Props) {
  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchBadgesWithStatus(userId)
      .then((data) => {
        if (!cancelled) setBadges(data);
      })
      .catch((err) => console.warn("[BadgesSection] rozetler yüklenemedi:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading || badges.length === 0) return null;

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <View style={styles.container}>
      <AppText variant="bodyMedium" style={styles.title}>
        Rozetlerim ({earnedCount}/{badges.length})
      </AppText>
      <View style={styles.grid}>
        {badges.map((badge) => (
          <View key={badge.id} style={[styles.badge, !badge.earned && styles.badgeLocked]}>
            <AppText variant="bodyMedium" color={badge.earned ? colors.textPrimary : colors.textDisabled}>
              {badge.title}
            </AppText>
            <AppText
              variant="caption"
              color={badge.earned ? colors.textSecondary : colors.textDisabled}
              style={styles.description}
            >
              {badge.description}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
  },
  title: {
    marginBottom: spacing.md,
  },
  grid: {
    gap: spacing.sm,
  },
  badge: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  badgeLocked: {
    borderColor: colors.border,
    opacity: 0.6,
  },
  description: {
    marginTop: spacing.xs,
  },
});
