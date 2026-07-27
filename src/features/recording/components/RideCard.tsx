import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import type { RecordedRide } from "@/features/recording/types";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}s ${minutes}dk` : `${minutes}dk`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  ride: RecordedRide;
  onPress: () => void;
};

export function RideCard({ ride, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.headerRow}>
        <AppText variant="bodyMedium">{formatDate(ride.started_at)}</AppText>
        {ride.gpx_storage_path ? (
          <View style={styles.badge}>
            <AppText variant="overline" color={colors.primary}>
              GPX
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatItem icon="speedometer-outline" label={ride.distance_km !== null ? `${ride.distance_km} km` : "-"} />
        <StatItem icon="time-outline" label={formatDuration(ride.duration_seconds)} />
        {ride.avg_speed_kmh !== null ? (
          <StatItem icon="pulse-outline" label={`${ride.avg_speed_kmh} km/sa ort.`} />
        ) : null}
      </View>
    </Pressable>
  );
}

function StatItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.statLabel}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryMuted,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  statLabel: {
    marginLeft: 4,
  },
});
