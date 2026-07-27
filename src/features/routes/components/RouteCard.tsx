import { Pressable, StyleSheet, View } from "react-native";

import { overallAverage, type Route } from "@/features/routes/types";
import { AppText } from "@/shared/components/AppText";
import { StarRating } from "@/shared/components/StarRating";
import { colors, radius, spacing } from "@/shared/theme";

type Props = {
  route: Route;
  onPress: () => void;
};

export function RouteCard({ route, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <AppText variant="bodyMedium" numberOfLines={1}>
        {route.title}
      </AppText>

      <View style={styles.metaRow}>
        {route.region ? (
          <AppText variant="caption" color={colors.textSecondary}>
            {route.region}
          </AppText>
        ) : null}
        {route.distance_km ? (
          <AppText variant="caption" color={colors.textSecondary}>
            {route.region ? " · " : ""}
            {route.distance_km} km
          </AppText>
        ) : null}
      </View>

      <View style={styles.ratingRow}>
        <StarRating value={overallAverage(route)} size={15} />
        <AppText variant="caption" color={colors.textSecondary} style={styles.ratingCount}>
          ({route.rating_count})
        </AppText>
      </View>
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
  metaRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  ratingCount: {
    marginLeft: spacing.xs,
  },
});
