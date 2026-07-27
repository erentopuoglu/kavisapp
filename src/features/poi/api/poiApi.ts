import type { LatLng } from "@/lib/map/types";
import { supabase } from "@/lib/supabase/client";
import type { Poi, PoiType, PoiVote } from "@/features/poi/types";

export async function fetchPois(): Promise<Poi[]> {
  const { data, error } = await supabase.from("pois").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPoiById(poiId: string): Promise<Poi> {
  const { data, error } = await supabase.from("pois").select("*").eq("id", poiId).single();
  if (error) throw error;
  return data;
}

export type CreatePoiInput = {
  type: PoiType;
  title: string;
  description?: string;
  location: LatLng;
};

export async function createPoi(input: CreatePoiInput): Promise<Poi> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("İşaretli nokta eklemek için giriş yapmalısınız.");

  const wkt = `POINT(${input.location.longitude} ${input.location.latitude})`;

  const { data, error } = await supabase
    .from("pois")
    .insert({
      creator_id: user.id,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      location: wkt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePoi(poiId: string): Promise<void> {
  const { error } = await supabase.from("pois").delete().eq("id", poiId);
  if (error) throw error;
}

export async function fetchMyVote(poiId: string, userId: string): Promise<PoiVote | null> {
  const { data, error } = await supabase
    .from("poi_votes")
    .select("*")
    .eq("poi_id", poiId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function voteOnPoi(poiId: string, userId: string, vote: "up" | "down"): Promise<void> {
  const { error } = await supabase
    .from("poi_votes")
    .upsert({ poi_id: poiId, user_id: userId, vote }, { onConflict: "poi_id,user_id" });
  if (error) throw error;
}

export async function removeVote(poiId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("poi_votes").delete().eq("poi_id", poiId).eq("user_id", userId);
  if (error) throw error;
}
