import { StyleSheet, View } from "react-native";

import { AppText } from "@/shared/components/AppText";
import { radius, spacing } from "@/shared/theme";

type Props = {
  label: string;
  color: string;
};

export function StatusBadge({ label, color }: Props) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <AppText variant="caption" color={color}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
