import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { POI_FADE_NET_SCORE_THRESHOLD, POI_TYPE_META, poiNetScore, type Poi } from "@/features/poi/types";
import { colors, radius } from "@/shared/theme";

type Props = {
  poi: Poi;
};

export function PoiMarkerIcon({ poi }: Props) {
  const meta = POI_TYPE_META[poi.type];
  const faded = poiNetScore(poi) <= POI_FADE_NET_SCORE_THRESHOLD;

  return (
    <View style={[styles.circle, faded && styles.faded, meta.color ? { borderColor: meta.color } : null]}>
      <MaterialCommunityIcons name={meta.icon} size={16} color={meta.color ?? colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  faded: {
    opacity: 0.4,
  },
});
