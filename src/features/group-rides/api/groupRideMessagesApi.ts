import { supabase } from "@/lib/supabase/client";
import type { GroupRideMessage, MessageWithProfile } from "@/features/group-rides/types";

export async function fetchMessages(rideId: string): Promise<MessageWithProfile[]> {
  const { data, error } = await supabase
    .from("group_ride_messages")
    .select("*, profiles(username, display_name)")
    .eq("ride_id", rideId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as MessageWithProfile[];
}

export async function sendMessage(rideId: string, userId: string, message: string): Promise<GroupRideMessage> {
  const { data, error } = await supabase
    .from("group_ride_messages")
    .insert({ ride_id: rideId, user_id: userId, message })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Realtime: bu sürüşün sohbetine yeni bir mesaj eklendiğinde çağrılır.
// RLS, Postgres Changes akışına da uygulanır — gizli/erişimsiz mesajlar
// buraya hiç ulaşmaz.
export function subscribeToMessages(
  rideId: string,
  onInsert: (message: GroupRideMessage) => void
): () => void {
  const channel = supabase
    .channel(`group_ride_messages:${rideId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_ride_messages", filter: `ride_id=eq.${rideId}` },
      (payload) => onInsert(payload.new as GroupRideMessage)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
