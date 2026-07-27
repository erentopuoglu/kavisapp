import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, spacing } from "@/shared/theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  phaseLabel: string;
};

export function ComingSoon({ icon, title, phaseLabel }: Props) {
  return (
    <ScreenContainer style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textDisabled} />
      <AppText variant="title" style={styles.title}>
        {title}
      </AppText>
      <View style={styles.badge}>
        <AppText variant="overline" color={colors.primary}>
          {phaseLabel}
        </AppText>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: spacing.md,
    textAlign: "center",
  },
  badge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
  },
});
