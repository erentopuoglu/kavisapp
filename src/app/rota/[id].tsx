import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import {
  fetchMyRating,
  fetchRouteById,
  fetchRouteRatings,
  incrementRouteView,
  rateRoute,
} from "@/features/routes/api/routesApi";
import { RatingModal, type RatingFormValues } from "@/features/routes/components/RatingModal";
import { RATING_CRITERIA, overallAverage, type Route, type RouteRatingWithAuthor } from "@/features/routes/types";
import { geoJsonLineStringToLatLngs } from "@/shared/utils/geo";
import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { AppMapPolyline, AppMapView } from "@/lib/map";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { StarRating } from "@/shared/components/StarRating";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

export default function RotaDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((state) => state.session);

  const [route, setRoute] = useState<Route | null>(null);
  const [ratings, setRatings] = useState<RouteRatingWithAuthor[]>([]);
  const [myRatingValues, setMyRatingValues] = useState<Partial<RatingFormValues> | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [routeData, ratingsData] = await Promise.all([fetchRouteById(id), fetchRouteRatings(id)]);
      setRoute(routeData);
      setRatings(ratingsData);

      if (session) {
        const mine = await fetchMyRating(id, session.user.id);
        if (mine) {
          setMyRatingValues({
            curve_quality: mine.curve_quality,
            road_surface: mine.road_surface,
            scenery: mine.scenery,
            traffic: mine.traffic,
            comment: mine.comment ?? "",
          });
        }
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    // Mount'ta rota + değerlendirmeleri çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    incrementRouteView(id).catch((err) => console.warn("[rota/[id]] view_count artırılamadı:", err));
  }, [id]);

  const handleSubmitRating = async (values: RatingFormValues) => {
    if (!id || !session) return;
    setSubmittingRating(true);
    try {
      await rateRoute({
        route_id: id,
        user_id: session.user.id,
        curve_quality: values.curve_quality,
        road_surface: values.road_surface,
        scenery: values.scenery,
        traffic: values.traffic,
        comment: values.comment || null,
      });
      setShowRatingModal(false);
      setMyRatingValues(values);
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error && !route) {
    return (
      <ScreenContainer style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.errorText}>
          {error}
        </AppText>
      </ScreenContainer>
    );
  }

  if (!route) return null;

  const points = geoJsonLineStringToLatLngs(route.path_geojson);
  const isOwnRoute = session?.user.id === route.creator_id;

  return (
    <>
      <Stack.Screen options={{ title: route.title, headerShown: true }} />
      <ScreenContainer padded={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.mapWrapper}>
            <AppMapView fitToCoordinates={points}>
              <AppMapPolyline id="route-detail" coordinates={points} />
            </AppMapView>
          </View>

          <View style={styles.content}>
            <AppText variant="title">{route.title}</AppText>
            {route.description ? (
              <AppText variant="body" color={colors.textSecondary} style={styles.description}>
                {route.description}
              </AppText>
            ) : null}

            <View style={styles.statsRow}>
              {route.region ? <StatItem icon="location-outline" label={route.region} /> : null}
              {route.distance_km ? <StatItem icon="speedometer-outline" label={`${route.distance_km} km`} /> : null}
              {route.estimated_duration_min ? (
                <StatItem icon="time-outline" label={`${route.estimated_duration_min} dk`} />
              ) : null}
              <StatItem icon="eye-outline" label={`${route.view_count}`} />
            </View>

            <View style={styles.ratingSummary}>
              <StarRating value={overallAverage(route)} size={22} />
              <AppText variant="body" color={colors.textSecondary} style={styles.ratingCount}>
                {overallAverage(route).toFixed(1)} ({route.rating_count} değerlendirme)
              </AppText>
            </View>

            <View style={styles.criteriaBreakdown}>
              {RATING_CRITERIA.map((criterion) => (
                <View key={criterion.key} style={styles.criterionRow}>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {criterion.label}
                  </AppText>
                  <StarRating value={route[`avg_${criterion.key}` as keyof Route] as number} size={14} />
                </View>
              ))}
            </View>

            {isOwnRoute ? (
              <AppText variant="caption" color={colors.textSecondary} style={styles.ownRouteNote}>
                Kendi rotanızı puanlayamazsınız.
              </AppText>
            ) : session ? (
              <Button
                label={myRatingValues ? "Puanını Güncelle" : "Puanla"}
                onPress={() => setShowRatingModal(true)}
                variant="secondary"
                style={styles.rateButton}
              />
            ) : null}

            <AppText variant="subtitle" style={styles.ratingsTitle}>
              Değerlendirmeler
            </AppText>
            {ratings.length === 0 ? (
              <AppText variant="body" color={colors.textSecondary}>
                Henüz değerlendirme yok.
              </AppText>
            ) : (
              ratings.map((rating) => (
                <View key={rating.id} style={styles.ratingItem}>
                  <AppText variant="bodyMedium">{rating.profiles?.username ?? "Kullanıcı"}</AppText>
                  <StarRating
                    value={(rating.curve_quality + rating.road_surface + rating.scenery + rating.traffic) / 4}
                    size={14}
                  />
                  {rating.comment ? (
                    <AppText variant="body" color={colors.textSecondary} style={styles.ratingComment}>
                      {rating.comment}
                    </AppText>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ScreenContainer>

      <RatingModal
        visible={showRatingModal}
        initialValues={myRatingValues}
        submitting={submittingRating}
        onSubmit={handleSubmitRating}
        onClose={() => setShowRatingModal(false)}
      />
    </>
  );
}

function StatItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.statLabel}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  mapWrapper: {
    height: 260,
  },
  content: {
    padding: spacing.md,
  },
  description: {
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  statLabel: {
    marginLeft: spacing.xs,
  },
  ratingSummary: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
  },
  ratingCount: {
    marginLeft: spacing.sm,
  },
  criteriaBreakdown: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  criterionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  ownRouteNote: {
    marginTop: spacing.md,
  },
  rateButton: {
    marginTop: spacing.md,
  },
  ratingsTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  ratingItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ratingComment: {
    marginTop: spacing.xs,
  },
});
