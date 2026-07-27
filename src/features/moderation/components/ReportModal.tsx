import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";

import { submitReport } from "@/features/moderation/api/reportApi";
import { REPORT_REASONS, type ReportContentType } from "@/features/moderation/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

type Props = {
  visible: boolean;
  contentType: ReportContentType;
  contentId: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

// Genel amaçlı, yeniden kullanılabilir rapor modalı — Faz 3'te POI için,
// Faz 4/5'te sohbet ve forum içeriği için de aynen kullanılacak.
export function ReportModal({ visible, contentType, contentId, onClose, onSubmitted }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setSelectedReason(null);
    setDetails("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await submitReport({ contentType, contentId, reason: selectedReason, details: details.trim() || undefined });
      setSelectedReason(null);
      setDetails("");
      onSubmitted?.();
      Alert.alert("Teşekkürler", "Raporunuz alındı.");
    } catch (err) {
      Alert.alert("Rapor gönderilemedi", err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <AppText variant="subtitle" style={styles.title}>
            İçeriği Bildir
          </AppText>

          {REPORT_REASONS.map((option) => {
            const active = selectedReason === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.reasonRow, active && styles.reasonRowActive]}
                onPress={() => setSelectedReason(option.value)}
              >
                <View style={[styles.radio, active && styles.radioActive]} />
                <AppText variant="body">{option.label}</AppText>
              </Pressable>
            );
          })}

          <TextField
            label="Detay (opsiyonel)"
            value={details}
            onChangeText={setDetails}
            placeholder="Ek bilgi verin"
            multiline
            numberOfLines={3}
            style={styles.detailsInput}
          />

          <Button
            label="Gönder"
            onPress={handleSubmit}
            disabled={!selectedReason}
            loading={submitting}
            variant="danger"
            style={styles.submitButton}
          />
          <Button label="Vazgeç" onPress={handleClose} variant="secondary" />
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
  },
  title: {
    marginBottom: spacing.md,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  reasonRowActive: {},
  radio: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  radioActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  detailsInput: {
    minHeight: 70,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
