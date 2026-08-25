import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { banUser, fetchUsers, unbanUser } from "@/features/admin/api/adminApi";
import type { AdminProfile } from "@/features/admin/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Kullanıcılar yüklenemedi.";
}

export default function KullanicilarScreen() {
  const myUserId = useAuthStore((state) => state.session?.user.id);
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (text: string) => {
    setError(null);
    try {
      setUsers(await fetchUsers(text));
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    // Arama metni değiştikçe (debounce'lu) yeniden çek — harici sistemle
    // (Supabase) senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const timeout = setTimeout(() => {
      load(searchText).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchText, load]);

  const handleBan = (user: AdminProfile) => {
    Alert.alert("Kullanıcıyı Banla", `${user.username} artık giriş yapamayacak ve içerik üretemeyecek. Emin misiniz?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Banla",
        style: "destructive",
        onPress: async () => {
          setBusyId(user.id);
          try {
            await banUser(user.id);
            setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_banned: true } : u)));
          } catch (err) {
            Alert.alert("Banlanamadı", describeError(err));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const handleUnban = (user: AdminProfile) => {
    setBusyId(user.id);
    unbanUser(user.id)
      .then(() => {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_banned: false } : u)));
      })
      .catch((err) => Alert.alert("Ban kaldırılamadı", describeError(err)))
      .finally(() => setBusyId(null));
  };

  return (
    <>
      <Stack.Screen options={{ title: "Kullanıcılar", headerShown: true }} />
      <ScreenContainer padded={false}>
        <View style={styles.header}>
          <TextField placeholder="Kullanıcı adı ara..." value={searchText} onChangeText={setSearchText} />
        </View>

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
            data={users}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center}>
                <AppText variant="body" color={colors.textSecondary}>
                  Kullanıcı bulunamadı.
                </AppText>
              </View>
            }
            renderItem={({ item }) => {
              const busy = busyId === item.id;
              const isSelf = item.id === myUserId;
              return (
                <View style={styles.row}>
                  <View style={styles.userInfo}>
                    <View style={styles.nameRow}>
                      <AppText variant="bodyMedium">{item.username}</AppText>
                      {item.is_admin ? (
                        <View style={styles.adminBadge}>
                          <AppText variant="caption" color={colors.primary}>
                            admin
                          </AppText>
                        </View>
                      ) : null}
                      {item.is_banned ? (
                        <View style={styles.bannedBadge}>
                          <AppText variant="caption" color={colors.danger}>
                            banlı
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                    {item.bike_model ? (
                      <AppText variant="caption" color={colors.textSecondary}>
                        {item.bike_model}
                      </AppText>
                    ) : null}
                  </View>
                  {isSelf ? null : item.is_banned ? (
                    <Button
                      label="Ban Kaldır"
                      onPress={() => handleUnban(item)}
                      variant="secondary"
                      loading={busy}
                      style={styles.actionButton}
                    />
                  ) : (
                    <Button
                      label="Banla"
                      onPress={() => handleBan(item)}
                      variant="danger"
                      loading={busy}
                      style={styles.actionButton}
                    />
                  )}
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
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
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
  userInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  adminBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  bannedBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  actionButton: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
});
