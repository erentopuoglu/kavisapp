import { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";

import { RATING_CRITERIA, type RouteRatingInsert } from "@/features/routes/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { StarRating } from "@/shared/components/StarRating";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

export type RatingFormValues = Pick<
  RouteRatingInsert,
  "curve_quality" | "road_surface" | "scenery" | "traffic"
> & { comment: string };

const DEFAULTS: RatingFormValues = {
  curve_quality: 0,
  road_surface: 0,
  scenery: 0,
  traffic: 0,
  comment: "",
};

type Props = {
  visible: boolean;
  initialValues?: Partial<RatingFormValues>;
  submitting?: boolean;
  onSubmit: (values: RatingFormValues) => void;
  onClose: () => void;
};

export function RatingModal({ visible, initialValues, submitting, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<RatingFormValues>({ ...DEFAULTS, ...initialValues });

  const isValid =
    values.curve_quality > 0 && values.road_surface > 0 && values.scenery > 0 && values.traffic > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <AppText variant="subtitle" style={styles.title}>
              Rotayı Puanla
            </AppText>

            {RATING_CRITERIA.map((criterion) => (
              <View key={criterion.key} style={styles.criterionRow}>
                <AppText variant="body" color={colors.textSecondary}>
                  {criterion.label}
                </AppText>
                <StarRating
                  value={values[criterion.key]}
                  onChange={(value) => setValues((prev) => ({ ...prev, [criterion.key]: value }))}
                  size={26}
                />
              </View>
            ))}

            <TextField
              label="Yorum (opsiyonel)"
              value={values.comment}
              onChangeText={(text) => setValues((prev) => ({ ...prev, comment: text }))}
              multiline
              numberOfLines={3}
              style={styles.commentInput}
            />

            <Button
              label="Gönder"
              onPress={() => onSubmit(values)}
              disabled={!isValid}
              loading={submitting}
              style={styles.submitButton}
            />
            <Button label="Vazgeç" onPress={onClose} variant="secondary" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  title: {
    marginBottom: spacing.md,
  },
  criterionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  commentInput: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
