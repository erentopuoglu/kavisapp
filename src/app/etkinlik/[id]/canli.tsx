import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { fetchGroupRideById, fetchParticipants } from "@/features/group-rides/api/groupRidesApi";
import { fetchLiveLocations, subscribeToLiveLocations } from "@/features/group-rides/api/liveLocationApi";
import { useLiveLocationSharing } from "@/features/group-rides/hooks/useLiveLocationSharing";
import {
  LIVE_LOCATION_DROP_AFTER_MS,
  LIVE_LOCATION_STALE_AFTER_MS,
  type GroupRide,
  type LiveLocation,
  type ParticipantWithProfile,
} from "@/features/group-rides/types";
import { formatAgeShort } from "@/features/group-rides/utils";
import { AppMapMarker, AppMapView } from "@/lib/map";
import type { LatLng } from "@/lib/map/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Canlı konum yüklenemedi.";
}

export default function EtkinlikCanliScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((state) => state.session);

  const [ride, setRide] = useState<GroupRide | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [locations, setLocations] = useState<Record<string, LiveLocation>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [rideData, participantsData, liveData] = await Promise.all([
        fetchGroupRideById(id),
        fetchParticipants(id),
        fetchLiveLocations(id),
      ]);
      setRide(rideData);
      setParticipants(participantsData);
      setLocations(Object.fromEntries(liveData.map((loc) => [loc.user_id, loc])));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Mount'ta etkinlik + canlı konum verisini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToLiveLocations(id, (payload) => {
      if (payload.eventType === "DELETE") {
        setLocations((prev) => {
          const next = { ...prev };
          for (const [userId, loc] of Object.entries(next)) {
            if (loc.id === payload.row.id) delete next[userId];
          }
          return next;
        });
      } else {
        const row = payload.row as LiveLocation;
        setLocations((prev) => ({ ...prev, [row.user_id]: row }));
      }
    });
    return unsubscribe;
  }, [id]);

  // Tazelik göstergesi (soluklaşma/düşme) zaman geçtikçe değişir — yeni bir
  // Realtime olayı gelmese de periyodik olarak yeniden hesaplanmalı.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  const { error: sharingError } = useLiveLocationSharing(id ?? "", session?.user.id ?? "", sharing);

  const participantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      map.set(p.user_id, p.profiles?.display_name ?? p.profiles?.username ?? "Kullanıcı");
    }
    return map;
  }, [participants]);

  const visibleLocations = useMemo(() => {
    return Object.values(locations).filter((loc) => now - new Date(loc.updated_at).getTime() < LIVE_LOCATION_DROP_AFTER_MS);
  }, [locations, now]);

  const canShare = ride ? session?.user.id === ride.creator_id || participants.some((p) => p.user_id === session?.user.id && p.status === "approved") : false;

  if (loading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error || !ride) {
    return (
      <ScreenContainer style={styles.center}>
        <AppText variant="body" color={colors.danger}>
          {error ?? "Etkinlik bulunamadı."}
        </AppText>
      </ScreenContainer>
    );
  }

  if (ride.status !== "active") {
    return (
      <ScreenContainer style={styles.center}>
        <AppText variant="body" color={colors.textSecondary} style={styles.centerText}>
          Canlı takip sadece sürüş aktifken kullanılabilir.
        </AppText>
      </ScreenContainer>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Canlı Takip", headerShown: true }} />
      <ScreenContainer padded={false}>
        <View style={styles.mapWrapper}>
          <AppMapView
            showsUserLocation
            fitToCoordinates={visibleLocations.map((loc) => ({
              latitude: loc.location_geojson?.coordinates[1] ?? 0,
              longitude: loc.location_geojson?.coordinates[0] ?? 0,
            }))}
          >
            {visibleLocations.map((loc) => {
              if (!loc.location_geojson) return null;
              const coordinate: LatLng = {
                latitude: loc.location_geojson.coordinates[1],
                longitude: loc.location_geojson.coordinates[0],
              };
              const ageMs = now - new Date(loc.updated_at).getTime();
              const isStale = ageMs > LIVE_LOCATION_STALE_AFTER_MS;
              const name = participantNames.get(loc.user_id) ?? "Kullanıcı";
              return (
                <AppMapMarker key={loc.user_id} marker={{ id: loc.user_id, coordinate }}>
                  <View style={[styles.markerWrapper, isStale && styles.markerStale]}>
                    <View style={styles.marker}>
                      <AppText variant="caption" color={colors.textPrimary}>
                        {name.charAt(0).toUpperCase()}
                      </AppText>
                    </View>
                    <View style={styles.markerLabel}>
                      <AppText variant="caption" color={colors.textPrimary} numberOfLines={1}>
                        {name} · {formatAgeShort(ageMs)}
                      </AppText>
                    </View>
                  </View>
                </AppMapMarker>
              );
            })}
          </AppMapView>
        </View>

        {canShare ? (
          <View style={styles.shareBar}>
            {sharingError ? (
              <AppText variant="caption" color={colors.danger} style={styles.shareError}>
                {sharingError}
              </AppText>
            ) : null}
            <Button
              label={sharing ? "Konum Paylaşımını Durdur" : "Konumumu Paylaş"}
              onPress={() => setSharing((prev) => !prev)}
              variant={sharing ? "danger" : "primary"}
            />
          </View>
        ) : null}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerText: {
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  mapWrapper: {
    flex: 1,
  },
  markerWrapper: {
    alignItems: "center",
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  markerLabel: {
    marginTop: 2,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    maxWidth: 140,
  },
  markerStale: {
    opacity: 0.4,
  },
  shareBar: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  shareError: {
    marginBottom: spacing.sm,
    textAlign: "center",
  },
});
