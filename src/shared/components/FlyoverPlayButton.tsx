import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import type { FlyoverProgress } from "@/lib/map";
import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

// Sürüş özeti + rota detay ekranlarının haritanın üzerine bindirdiği "3D
// Flyover" düğmesi + oynatma sırasındaki ilerleme göstergesi. Map'e özgü
// hiçbir şey bilmiyor — sadece useRouteFlyover'ın state'ini gösteriyor,
// bu yüzden Mapbox'a hiç bağımlı değil (Expo Go'da da aynen çalışır).
type Props = {
  isPlaying: boolean;
  progress: FlyoverProgress | null;
  disabled?: boolean;
  onPress: () => void;
};

export function FlyoverPlayButton({ isPlaying, progress, disabled, onPress }: Props) {
  if (disabled && !isPlaying) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable style={styles.button} onPress={onPress} disabled={disabled} hitSlop={8}>
        <Ionicons name={isPlaying ? "stop" : "play"} size={16} color={colors.textPrimary} />
        <AppText variant="bodyMedium" color={colors.textPrimary} style={styles.buttonLabel}>
          {isPlaying ? "Durdur" : "3D Flyover"}
        </AppText>
      </Pressable>

      {isPlaying ? (
        <View style={styles.progressCard}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }]}
            />
          </View>
          <AppText variant="caption" color={colors.textSecondary} style={styles.progressLabel}>
            {progress ? `${progress.traveledKm.toFixed(1)}/${progress.totalKm.toFixed(1)} km` : "Hazırlanıyor…"}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  buttonLabel: {
    marginLeft: spacing.xs / 2,
  },
  progressCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighlight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  progressLabel: {
    marginTop: spacing.xs,
  },
});
