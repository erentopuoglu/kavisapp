import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { fetchQuestions } from "@/features/forum/api/forumApi";
import { QuestionCard } from "@/features/forum/components/QuestionCard";
import type { QuestionWithProfile } from "@/features/forum/types";
import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Sorular yüklenirken bir hata oluştu.";
}

export default function ForumScreen() {
  const [searchText, setSearchText] = useState("");
  const [questions, setQuestions] = useState<QuestionWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (text: string) => {
    setError(null);
    try {
      const data = await fetchQuestions({ searchText: text });
      setQuestions(data);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    // Arama metni değiştikçe (debounce'lu) yeniden çek — harici sistemle
    // (Supabase) senkronizasyon, react-hooks/set-state-in-effect burada
    // yanlış pozitif.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const timeout = setTimeout(() => {
      load(searchText).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchText, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(searchText);
    setRefreshing(false);
  };

  return (
    <ScreenContainer padded={false}>
      <View style={styles.header}>
        <TextField placeholder="Soru veya başlık ara..." value={searchText} onChangeText={setSearchText} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
          <AppText variant="body" color={colors.danger} style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <QuestionCard
              question={item}
              onPress={() => router.push({ pathname: "/forum/[id]", params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="chatbubbles-outline" size={32} color={colors.textDisabled} />
              <AppText variant="body" color={colors.textSecondary} style={styles.errorText}>
                Henüz soru yok. İlk soruyu siz sorun!
              </AppText>
            </View>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push("/forum/olustur")}>
        <Ionicons name="add" size={28} color={colors.textPrimary} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
