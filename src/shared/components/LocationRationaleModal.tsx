import { Ionicons } from "@expo/vector-icons";
import { Modal, StyleSheet, View } from "react-native";

import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { colors, radius, spacing } from "@/shared/theme";

type Props = {
  visible: boolean;
  title: string;
  description: string;
  onAccept: () => void;
  onDecline: () => void;
};

export function LocationRationaleModal({ visible, title, description, onAccept, onDecline }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Ionicons name="location" size={36} color={colors.primary} style={styles.icon} />
          <AppText variant="subtitle" style={styles.title}>
            {title}
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.description}>
            {description}
          </AppText>
          <Button label="İzin Ver" onPress={onAccept} style={styles.button} />
          <Button label="Vazgeç" onPress={onDecline} variant="secondary" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  icon: {
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  button: {
    width: "100%",
    marginBottom: spacing.sm,
  },
});
