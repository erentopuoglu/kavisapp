import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { fetchPois } from "@/features/poi/api/poiApi";
import { PoiMarkerIcon } from "@/features/poi/components/PoiMarker";
import { POI_TYPES, POI_TYPE_META, type Poi, type PoiType } from "@/features/poi/types";
import { fetchRoutes } from "@/features/routes/api/routesApi";
import type { Route } from "@/features/routes/types";
import { AppMapMarker, AppMapPolyline, AppMapView } from "@/lib/map";
import type { LatLng } from "@/lib/map/types";
import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";
import { geoJsonLineStringToLatLngs } from "@/shared/utils/geo";

export default function HaritaScreen() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<PoiType>>(new Set(POI_TYPES));
  const [addingPoi, setAddingPoi] = useState(false);

  const load = useCallback(async () => {
    try {
      const [routesData, poisData] = await Promise.all([fetchRoutes({ sort: "newest" }), fetchPois()]);
      setRoutes(routesData);
      setPois(poisData);
    } catch (err) {
      console.warn("[harita] veri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount'ta rota + POI verisini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visiblePois = useMemo(() => pois.filter((poi) => enabledTypes.has(poi.type)), [pois, enabledTypes]);

  const toggleType = (type: PoiType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleMapPress = (coordinate: LatLng) => {
    if (!addingPoi) return;
    setAddingPoi(false);
    router.push({
      pathname: "/poi/olustur",
      params: { lat: String(coordinate.latitude), lng: String(coordinate.longitude) },
    });
  };

  return (
    <ScreenContainer padded={false}>
      <View style={styles.mapWrapper}>
        <AppMapView showsUserLocation onMapPress={handleMapPress}>
          {routes.map((route) => {
            const points = geoJsonLineStringToLatLngs(route.path_geojson);
            const isSelected = selectedRouteId === route.id;
            return (
              <View key={route.id} pointerEvents="none">
                <AppMapPolyline
                  id={route.id}
                  coordinates={points}
                  color={isSelected ? colors.primary : colors.textSecondary}
                  width={isSelected ? 5 : 3}
                />
              </View>
            );
          })}
          {routes.map((route) => {
            const points = geoJsonLineStringToLatLngs(route.path_geojson);
            if (points.length === 0) return null;
            const midpoint = points[Math.floor(points.length / 2)];
            return (
              <AppMapMarker
                key={`marker-${route.id}`}
                marker={{ id: `marker-${route.id}`, coordinate: midpoint }}
              >
                <Pressable
                  onPress={() => {
                    setSelectedRouteId(route.id);
                    router.push({ pathname: "/rota/[id]", params: { id: route.id } });
                  }}
                  style={styles.routeMarker}
                />
              </AppMapMarker>
            );
          })}
          {visiblePois.map((poi) => {
            const coordinate = poi.location_geojson
              ? { latitude: poi.location_geojson.coordinates[1], longitude: poi.location_geojson.coordinates[0] }
              : null;
            if (!coordinate) return null;
            return (
              <AppMapMarker key={`poi-${poi.id}`} marker={{ id: `poi-${poi.id}`, coordinate }}>
                <Pressable onPress={() => router.push({ pathname: "/poi/[id]", params: { id: poi.id } })}>
                  <PoiMarkerIcon poi={poi} />
                </Pressable>
              </AppMapMarker>
            );
          })}
        </AppMapView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {POI_TYPES.map((type) => {
            const meta = POI_TYPE_META[type];
            const active = enabledTypes.has(type);
            return (
              <Pressable
                key={type}
                onPress={() => toggleType(type)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <MaterialCommunityIcons
                  name={meta.icon}
                  size={14}
                  color={active ? colors.textPrimary : colors.textSecondary}
                />
                <AppText
                  variant="caption"
                  color={active ? colors.textPrimary : colors.textSecondary}
                  style={styles.filterChipLabel}
                >
                  {meta.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {addingPoi ? (
          <View style={styles.hintBanner}>
            <AppText variant="caption" color={colors.textSecondary}>
              İşaretli nokta eklemek için haritaya dokunun
            </AppText>
          </View>
        ) : null}

        <Pressable
          style={[styles.fab, styles.fabSecondary, addingPoi && styles.fabActive]}
          onPress={() => setAddingPoi((prev) => !prev)}
        >
          <Ionicons name="location" size={24} color={colors.textPrimary} />
        </Pressable>

        {addingPoi ? null : (
          <Pressable style={styles.fab} onPress={() => router.push("/rota/olustur")}>
            <Ionicons name="add" size={28} color={colors.textPrimary} />
          </Pressable>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    flex: 1,
  },
  filterRow: {
    position: "absolute",
    top: spacing.md,
    maxHeight: 40,
  },
  filterRowContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  filterChipLabel: {
    marginLeft: 4,
  },
  loadingOverlay: {
    position: "absolute",
    top: spacing.xxl + spacing.md,
    alignSelf: "center",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hintBanner: {
    position: "absolute",
    bottom: spacing.lg + 72,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
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
  fabSecondary: {
    bottom: spacing.lg + 68,
    backgroundColor: colors.surfaceHighlight,
  },
  fabActive: {
    backgroundColor: colors.primary,
  },
  routeMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
