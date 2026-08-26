import { PropsWithChildren } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/shared/theme";

type Props = PropsWithChildren<{
  style?: ViewStyle;
  padded?: boolean;
  // Tab ekranlarında alt sekme çubuğu zaten alt safe area'yı karşılıyor,
  // bu yüzden varsayılan "bottom" içermiyor. Alt sekme çubuğu OLMAYAN
  // ekranlarda (auth akışı gibi) son satır sistem gezinme çubuğunun/gesture
  // alanının arkasında, dokunulamaz bir bölgede render olabilir — bu
  // ekranlar edges={["top","left","right","bottom"]} geçmeli.
  edges?: readonly Edge[];
}>;

export function ScreenContainer({ children, style, padded = true, edges = ["top", "left", "right"] }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.container, padded && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.md,
  },
});
