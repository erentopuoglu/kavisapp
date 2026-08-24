import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from "react-native";

import { fetchBlockedUsers, unblockUser } from "@/features/blocks/api/blocksApi";
import type { BlockedUser } from "@/features/blocks/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Engellenen kullanıcılar yüklenemedi.";
}

export default function EngellenenlerScreen() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBlockedUsers();
      setBlockedUsers(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount'ta engellenen kullanıcı listesini çek — harici sistemle
    // senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleUnblock = (blockedId: string) => {
    Alert.alert("Engeli Kaldır", "Bu kullanıcının sorularını/cevaplarını tekrar görmeye başlayacaksınız.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Engeli Kaldır",
        onPress: async () => {
          setRemovingId(blockedId);
          try {
            await unblockUser(blockedId);
            setBlockedUsers((prev) => prev.filter((entry) => entry.blocked_id !== blockedId));
          } catch (err) {
            Alert.alert("Kaldırılamadı", describeError(err));
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Engellenen Kullanıcılar", headerShown: true }} />
      <ScreenContainer padded={false}>
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
            data={blockedUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <AppText variant="bodyMedium">
                  {item.profiles?.display_name ?? item.profiles?.username ?? "Kullanıcı"}
                </AppText>
                <Button
                  label="Kaldır"
                  onPress={() => handleUnblock(item.blocked_id)}
                  variant="secondary"
                  loading={removingId === item.blocked_id}
                  style={styles.unblockButton}
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.centerFill}>
                <Ionicons name="person-remove-outline" size={32} color={colors.textDisabled} />
                <AppText variant="body" color={colors.textSecondary} style={styles.errorText}>
                  Henüz kimseyi engellemediniz.
                </AppText>
              </View>
            }
          />
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
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
  listContent: {
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  unblockButton: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
});
