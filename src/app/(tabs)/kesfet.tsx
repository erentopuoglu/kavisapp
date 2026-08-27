import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { LeaderboardView } from "@/features/leaderboard/components/LeaderboardView";
import { fetchNearbyRoutes, fetchRoutes } from "@/features/routes/api/routesApi";
import { RouteCard } from "@/features/routes/components/RouteCard";
import type { Route, RouteSortOption } from "@/features/routes/types";
import {
  getCurrentCoordinates,
  getForegroundPermissionStatus,
  requestForegroundPermission,
} from "@/lib/location/location";
import { AppText } from "@/shared/components/AppText";
import { LocationRationaleModal } from "@/shared/components/LocationRationaleModal";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

type SortMode = RouteSortOption | "nearby";
type ViewMode = "routes" | "leaderboard";

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "routes", label: "Rotalar" },
  { key: "leaderboard", label: "Liderlik Tablosu" },
];

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "newest", label: "En Yeni" },
  { key: "top_rated", label: "En Yüksek Puan" },
  { key: "nearby", label: "Yakınımdaki" },
];

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Rotalar yüklenirken bir hata oluştu.";
}

export default function KesfetScreen() {
  const session = useAuthStore((state) => state.session);
  const [viewMode, setViewMode] = useState<ViewMode>("routes");
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLocationRationale, setShowLocationRationale] = useState(false);

  const loadStandard = useCallback(async (mode: RouteSortOption, text: string) => {
    const data = await fetchRoutes({ searchText: text, sort: mode });
    setRoutes(data);
  }, []);

  const loadNearby = useCallback(async () => {
    const coordinate = await getCurrentCoordinates();
    if (!coordinate) {
      setError("Konum alınamadı. Konum servislerinin açık olduğundan emin olun.");
      return;
    }
    const data = await fetchNearbyRoutes(coordinate);
    setRoutes(data);
  }, []);

  const load = useCallback(
    async (mode: SortMode, text: string) => {
      setError(null);
      try {
        if (mode === "nearby") {
          await loadNearby();
        } else {
          await loadStandard(mode, text);
        }
      } catch (err) {
        setError(describeError(err));
      }
    },
    [loadNearby, loadStandard]
  );

  useEffect(() => {
    if (sort === "nearby") return; // konum akışı ayrı yönetiliyor
    // Standart "mount/değişimde veri çek" deseni — harici sistemle (Supabase)
    // senkronizasyon, react-hooks/set-state-in-effect burada yanlış pozitif.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const timeout = setTimeout(() => {
      load(sort, searchText).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [sort, searchText, load]);

  const handleSelectSort = async (mode: SortMode) => {
    if (mode !== "nearby") {
      setSort(mode);
      return;
    }

    const { status } = await getForegroundPermissionStatus();
    if (status === Location.PermissionStatus.GRANTED) {
      setSort("nearby");
      setLoading(true);
      await load("nearby", searchText);
      setLoading(false);
    } else {
      setShowLocationRationale(true);
    }
  };

  const handleAcceptLocation = async () => {
    setShowLocationRationale(false);
    const { status } = await requestForegroundPermission();
    if (status === Location.PermissionStatus.GRANTED) {
      setSort("nearby");
      setLoading(true);
      await load("nearby", searchText);
      setLoading(false);
    } else {
      setError("Konum izni verilmedi — yakınımdaki rotalar gösterilemiyor.");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(sort, searchText);
    setRefreshing(false);
  };

  return (
    <ScreenContainer padded={false}>
      <View style={styles.viewModeRow}>
        {VIEW_MODES.map((option) => {
          const active = viewMode === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setViewMode(option.key)}
              style={[styles.viewModeTab, active && styles.viewModeTabActive]}
            >
              <AppText variant="bodyMedium" color={active ? colors.primary : colors.textSecondary}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {viewMode === "leaderboard" ? (
        <LeaderboardView userId={session?.user.id} />
      ) : (
        <>
          <View style={styles.header}>
            <TextField placeholder="Rota veya bölge ara..." value={searchText} onChangeText={setSearchText} />
            <View style={styles.sortRow}>
              {SORT_OPTIONS.map((option) => {
                const active = sort === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => handleSelectSort(option.key)}
                    style={[styles.sortPill, active && styles.sortPillActive]}
                  >
                    <AppText variant="caption" color={active ? colors.textPrimary : colors.textSecondary}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
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
              data={routes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
              }
              renderItem={({ item }) => (
                <RouteCard
                  route={item}
                  onPress={() => router.push({ pathname: "/rota/[id]", params: { id: item.id } })}
                />
              )}
              ListEmptyComponent={
                <View style={styles.centerFill}>
                  <Ionicons name="map-outline" size={32} color={colors.textDisabled} />
                  <AppText variant="body" color={colors.textSecondary} style={styles.errorText}>
                    {sort === "nearby" ? "Yakınında rota bulunamadı." : "Henüz rota yok."}
                  </AppText>
                </View>
              }
            />
          )}
        </>
      )}

      <LocationRationaleModal
        visible={showLocationRationale}
        title="Yakınımdaki Rotalar"
        description="Yakınınızdaki rotaları gösterebilmemiz için konumunuza ihtiyacımız var. Konumunuz sadece bu aramayı yapmak için kullanılır."
        onAccept={handleAcceptLocation}
        onDecline={() => setShowLocationRationale(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  viewModeRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  viewModeTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  viewModeTabActive: {
    borderBottomColor: colors.primary,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sortRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sortPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
});
