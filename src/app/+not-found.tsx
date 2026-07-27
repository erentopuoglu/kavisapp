import { Link, Stack } from "expo-router";
import { StyleSheet } from "react-native";

import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, spacing } from "@/shared/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Sayfa bulunamadı" }} />
      <ScreenContainer style={styles.container}>
        <AppText variant="title">Bu sayfa bulunamadı.</AppText>
        <Link href="/" style={styles.link}>
          <AppText variant="bodyMedium" color={colors.primary}>
            Ana sayfaya dön
          </AppText>
        </Link>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  link: {
    marginTop: spacing.md,
  },
});
