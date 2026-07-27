import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { colors } from "@/shared/theme";

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
};

export function StarRating({ value, onChange, size = 20 }: Props) {
  const stars = [1, 2, 3, 4, 5];
  const readOnly = !onChange;

  return (
    <View style={styles.row}>
      {stars.map((star) => {
        const filled = value >= star;
        const halfFilled = !filled && value >= star - 0.5;

        return (
          <Pressable key={star} disabled={readOnly} onPress={() => onChange?.(star)} hitSlop={4}>
            <Ionicons
              name={filled ? "star" : halfFilled ? "star-half" : "star-outline"}
              size={size}
              color={colors.ratingGold}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 2,
  },
});
