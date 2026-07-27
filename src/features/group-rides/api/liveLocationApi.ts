import type { LatLng } from "@/lib/map/types";
import { supabase } from "@/lib/supabase/client";
import type { LiveLocation } from "@/features/group-rides/types";

export async function fetchLiveLocations(rideId: string): Promise<LiveLocation[]> {
  const { data, error } = await supabase.from("live_locations").select("*").eq("ride_id", rideId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertMyLocation(
  rideId: string,
  userId: string,
  coordinate: LatLng,
  heading?: number | null,
  speedKmh?: number | null
): Promise<void> {
  const { error } = await supabase.from("live_locations").upsert(
    {
      ride_id: rideId,
      user_id: userId,
      location: `POINT(${coordinate.longitude} ${coordinate.latitude})`,
      heading: heading ?? null,
      speed_kmh: speedKmh ?? null,
    },
    { onConflict: "ride_id,user_id" }
  );
  if (error) throw error;
}

// Kullanıcı paylaşımı kapattığında pin'in hemen kaybolması için — 5
// dakikalık "bayat pin düşer" kuralını beklemeden kendi satırını siler.
export async function removeMyLocation(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("live_locations")
    .delete()
    .eq("ride_id", rideId)
    .eq("user_id", userId);
  if (error) throw error;
}

export function subscribeToLiveLocations(
  rideId: string,
  onChange: (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; row: LiveLocation | { id: string } }) => void
): () => void {
  const channel = supabase
    .channel(`live_locations:${rideId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_locations", filter: `ride_id=eq.${rideId}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          onChange({ eventType: "DELETE", row: payload.old as { id: string } });
        } else {
          onChange({ eventType: payload.eventType, row: payload.new as LiveLocation });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
