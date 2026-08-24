import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import legalContent from "@/content/legal.json";
import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

// Bu ekranın metinleri src/content/legal.json'dan geliyor — tek kaynak.
// Aynı JSON, kavisapp.com/kosullar statik sayfasını üretmek için
// web/build.mjs tarafından da okunuyor (bkz. web/README.md). Metni
// güncellerken SADECE bu JSON'ı değiştirin, ekrana veya web sayfasına elle
// dokunmayın.
const { lastUpdated, terms } = legalContent;

export default function KullanimKosullariScreen() {
  return (
    <>
      <Stack.Screen options={{ title: terms.title, headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.draftBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <AppText variant="caption" color={colors.warning} style={styles.draftBannerText}>
              Bu metin bir taslaktır, hukuki tavsiye niteliği taşımaz. Gerçek bir mağaza yayınından
              önce bir hukuk danışmanına gösterilmesi ve iletişim bilgilerinin doldurulması önerilir.
            </AppText>
          </View>

          <AppText variant="caption" color={colors.textSecondary} style={styles.lastUpdated}>
            Son güncelleme: {lastUpdated}
          </AppText>

          {terms.sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText variant="subtitle" style={styles.sectionTitle}>
                {section.title}
              </AppText>
              {section.paragraphs.map((paragraph, index) => (
                <AppText
                  key={index}
                  variant="body"
                  color={colors.textSecondary}
                  style={styles.paragraph}
                >
                  {paragraph}
                </AppText>
              ))}
            </View>
          ))}
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  draftBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  draftBannerText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  lastUpdated: {
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  paragraph: {
    marginTop: spacing.xs,
  },
});
