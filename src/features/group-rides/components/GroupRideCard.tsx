import { Pressable, StyleSheet, View } from "react-native";

import { StatusBadge } from "@/features/group-rides/components/StatusBadge";
import { GROUP_RIDE_STATUS_META, type GroupRide } from "@/features/group-rides/types";
import { formatScheduledAt } from "@/features/group-rides/utils";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

type Props = {
  ride: GroupRide;
  onPress: () => void;
};

export function GroupRideCard({ ride, onPress }: Props) {
  const statusMeta = GROUP_RIDE_STATUS_META[ride.status];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.headerRow}>
        <AppText variant="bodyMedium" numberOfLines={1} style={styles.title}>
          {ride.title}
        </AppText>
        <StatusBadge label={statusMeta.label} color={statusMeta.color} />
      </View>

      <AppText variant="caption" color={colors.textSecondary} style={styles.scheduledAt}>
        {formatScheduledAt(ride.scheduled_at)}
      </AppText>

      {ride.start_address ? (
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {ride.start_address}
        </AppText>
      ) : null}
    </Pressable>
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  scheduledAt: {
    marginTop: spacing.xs,
  },
});
