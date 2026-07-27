import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

import {
  getForegroundPermissionStatus,
  requestForegroundPermission,
} from "@/lib/location/location";
import { removeMyLocation, upsertMyLocation } from "@/features/group-rides/api/liveLocationApi";
import {
  LIVE_LOCATION_MIN_DISTANCE_M,
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
} from "@/features/group-rides/types";

// Faz 4 v1 kapsamı: sadece bu ekran (canli.tsx) açıkken, foreground'da
// çalışır. Uygulama arka plana alınırsa paylaşım durur — arka plan desteği
// (Faz 2'deki expo-task-manager altyapısı) teknik borç olarak not edildi.
export function useLiveLocationSharing(rideId: string, userId: string, enabled: boolean) {
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      const { status } = await getForegroundPermissionStatus();
      let granted = status === Location.PermissionStatus.GRANTED;
      if (!granted) {
        const requested = await requestForegroundPermission();
        granted = requested.status === Location.PermissionStatus.GRANTED;
      }
      if (!granted) {
        if (!cancelled) setError("Konumunuzu paylaşmak için konum izni gerekiyor.");
        return;
      }

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LIVE_LOCATION_UPDATE_INTERVAL_MS,
          distanceInterval: LIVE_LOCATION_MIN_DISTANCE_M,
        },
        (location) => {
          const speedKmh = location.coords.speed != null ? location.coords.speed * 3.6 : null;
          upsertMyLocation(
            rideId,
            userId,
            { latitude: location.coords.latitude, longitude: location.coords.longitude },
            location.coords.heading,
            speedKmh
          ).catch((err) => {
            if (!cancelled) setError(err instanceof Error ? err.message : "Konum paylaşılamadı.");
          });
        }
      );
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      void removeMyLocation(rideId, userId);
    };
  }, [enabled, rideId, userId]);

  return { error };
}
