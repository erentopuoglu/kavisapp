import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from "react-native";

import { fetchHiddenContent, unhideContent } from "@/features/admin/api/adminApi";
import { CONTENT_TYPE_LABELS, type HiddenContentItem } from "@/features/admin/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Gizlenmiş içerikler yüklenemedi.";
}

function itemKey(item: HiddenContentItem): string {
  return `${item.contentType}:${item.contentId}`;
}

export default function GizliIcerikScreen() {
  const [items, setItems] = useState<HiddenContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchHiddenContent());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount'ta gizli içerikleri çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleUnhide = (item: HiddenContentItem) => {
    Alert.alert("İçeriği Geri Aç", "Bu içerik topluluğa tekrar görünür olacak. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Geri Aç",
        onPress: async () => {
          setBusyKey(itemKey(item));
          try {
            await unhideContent(item.contentType, item.contentId);
            setItems((prev) => prev.filter((i) => itemKey(i) !== itemKey(item)));
          } catch (err) {
            Alert.alert("Geri açılamadı", describeError(err));
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Gizlenmiş İçerikler", headerShown: true }} />
      <ScreenContainer padded={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
            <AppText variant="body" color={colors.danger} style={styles.errorText}>
              {error}
            </AppText>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={itemKey}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="eye-outline" size={32} color={colors.textDisabled} />
                <AppText variant="body" color={colors.textSecondary} style={styles.errorText}>
                  Gizlenmiş içerik yok.
                </AppText>
              </View>
            }
            renderItem={({ item }) => {
              const busy = busyKey === itemKey(item);
              return (
                <View style={styles.card}>
                  <AppText variant="caption" color={colors.primary}>
                    {CONTENT_TYPE_LABELS[item.contentType]}
                  </AppText>
                  <AppText variant="bodyMedium" numberOfLines={1} style={styles.title}>
                    {item.title}
                  </AppText>
                  {item.snippet ? (
                    <AppText variant="caption" color={colors.textSecondary} numberOfLines={2} style={styles.snippet}>
                      {item.snippet}
                    </AppText>
                  ) : null}
                  <AppText variant="caption" color={colors.textDisabled} style={styles.author}>
                    {item.authorUsername}
                  </AppText>
                  <Button
                    label="Geri Aç"
                    onPress={() => handleUnhide(item)}
                    variant="secondary"
                    loading={busy}
                    style={styles.actionButton}
                  />
                </View>
              );
            }}
          />
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
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
  listContent: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    marginTop: spacing.xs,
  },
  snippet: {
    marginTop: spacing.xs,
  },
  author: {
    marginTop: spacing.xs,
  },
  actionButton: {
    marginTop: spacing.sm,
  },
});
