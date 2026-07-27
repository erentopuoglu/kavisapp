import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { fetchGroupRides } from "@/features/group-rides/api/groupRidesApi";
import { GroupRideCard } from "@/features/group-rides/components/GroupRideCard";
import type { GroupRide } from "@/features/group-rides/types";
import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Etkinlikler yüklenirken bir hata oluştu.";
}

export default function EtkinliklerScreen() {
  const [rides, setRides] = useState<GroupRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchGroupRides();
      setRides(data);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    // Mount'ta etkinlik verisini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
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
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <GroupRideCard
              ride={item}
              onPress={() => router.push({ pathname: "/etkinlik/[id]", params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="people-outline" size={32} color={colors.textDisabled} />
              <AppText variant="body" color={colors.textSecondary} style={styles.errorText}>
                Henüz yaklaşan bir etkinlik yok.
              </AppText>
            </View>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push("/etkinlik/olustur")}>
        <Ionicons name="add" size={28} color={colors.textPrimary} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  listContent: {
    padding: spacing.md,
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
