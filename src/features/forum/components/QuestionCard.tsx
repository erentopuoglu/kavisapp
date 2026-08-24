import { Pressable, StyleSheet, View } from "react-native";

import { forumAuthorLabel, type QuestionWithProfile } from "@/features/forum/types";
import { formatForumDate } from "@/features/forum/utils";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

type Props = {
  question: QuestionWithProfile;
  onPress: () => void;
};

export function QuestionCard({ question, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <AppText variant="bodyMedium" numberOfLines={1}>
        {question.title}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary} numberOfLines={2} style={styles.body}>
        {question.body}
      </AppText>

      {question.bike_model_tag || question.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {question.bike_model_tag ? (
            <View style={[styles.tag, styles.bikeModelTag]}>
              <AppText variant="caption" color={colors.primary}>
                {question.bike_model_tag}
              </AppText>
            </View>
          ) : null}
          {question.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tag}>
              <AppText variant="caption" color={colors.textSecondary}>
                {tag}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <AppText variant="caption" color={colors.textSecondary}>
          {forumAuthorLabel(question.profiles)}
        </AppText>
        <AppText variant="caption" color={colors.textDisabled}>
          {formatForumDate(question.created_at)}
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
  body: {
    marginTop: spacing.xs,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bikeModelTag: {
    borderColor: colors.primary,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
});
