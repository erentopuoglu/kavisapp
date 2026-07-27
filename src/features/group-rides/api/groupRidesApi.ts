import type { LatLng } from "@/lib/map/types";
import { supabase } from "@/lib/supabase/client";
import type { GroupRide, GroupRideStatus, ParticipantWithProfile } from "@/features/group-rides/types";

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const withContext = error as { context?: Response; message?: string };
  if (withContext.context) {
    try {
      const body = (await withContext.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // gövde okunamadı, aşağıdaki genel mesaja düş
    }
  }
  return withContext.message ?? fallback;
}

export async function fetchGroupRides(): Promise<GroupRide[]> {
  const { data, error } = await supabase
    .from("group_rides")
    .select("*")
    .in("status", ["upcoming", "active"])
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchGroupRideById(rideId: string): Promise<GroupRide> {
  const { data, error } = await supabase.from("group_rides").select("*").eq("id", rideId).single();
  if (error) throw error;
  return data;
}

export type CreateGroupRideInput = {
  title: string;
  description?: string;
  startPoint?: LatLng;
  startAddress?: string;
  scheduledAt: Date;
  maxParticipants?: number;
};

export async function createGroupRide(input: CreateGroupRideInput): Promise<GroupRide> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Etkinlik oluşturmak için giriş yapmalısınız.");

  const { data, error } = await supabase
    .from("group_rides")
    .insert({
      creator_id: user.id,
      title: input.title,
      description: input.description ?? null,
      start_point: input.startPoint ? `POINT(${input.startPoint.longitude} ${input.startPoint.latitude})` : null,
      start_address: input.startAddress ?? null,
      scheduled_at: input.scheduledAt.toISOString(),
      max_participants: input.maxParticipants ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// 'completed' buradan asla ayarlanmaz — sadece end-group-ride Edge
// Function'ı (canlı konumları temizlemek için) yapabilir.
export async function setGroupRideStatus(
  rideId: string,
  status: Extract<GroupRideStatus, "active" | "cancelled">
): Promise<void> {
  const { error } = await supabase.from("group_rides").update({ status }).eq("id", rideId);
  if (error) throw error;
}

export async function endGroupRide(rideId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("end-group-ride", { body: { ride_id: rideId } });
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, "Sürüş bitirilemedi."));
  }
  if (data?.error) throw new Error(data.error as string);
}

export async function fetchParticipants(rideId: string): Promise<ParticipantWithProfile[]> {
  const { data, error } = await supabase
    .from("group_ride_participants")
    .select("*, profiles(username, display_name, avatar_url)")
    .eq("ride_id", rideId)
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ParticipantWithProfile[];
}

export async function fetchMyParticipation(
  rideId: string,
  userId: string
): Promise<ParticipantWithProfile | null> {
  const { data, error } = await supabase
    .from("group_ride_participants")
    .select("*, profiles(username, display_name, avatar_url)")
    .eq("ride_id", rideId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ParticipantWithProfile | null;
}

export async function requestToJoin(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("group_ride_participants")
    .insert({ ride_id: rideId, user_id: userId, status: "requested" });
  if (error) throw error;
}

// Katılımcı henüz onaylanmadan ("requested") isteğini geri çeker — satırı
// tamamen siler. Onaylanmış bir katılımcının sürüşten ayrılması için
// leaveApprovedRide kullanılır (durumu 'left' yapar, geçmiş kaydı kalır).
export async function withdrawJoinRequest(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("group_ride_participants")
    .delete()
    .eq("ride_id", rideId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function leaveApprovedRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("group_ride_participants")
    .update({ status: "left", responded_at: new Date().toISOString() })
    .eq("ride_id", rideId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function approveParticipant(rideId: string, participantUserId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("manage-group-ride-participant", {
    body: { ride_id: rideId, participant_user_id: participantUserId, action: "approve" },
  });
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, "İstek onaylanamadı."));
  }
  if (data?.error) throw new Error(data.error as string);
}

export async function rejectParticipant(rideId: string, participantUserId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("manage-group-ride-participant", {
    body: { ride_id: rideId, participant_user_id: participantUserId, action: "reject" },
  });
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, "İstek reddedilemedi."));
  }
  if (data?.error) throw new Error(data.error as string);
}
