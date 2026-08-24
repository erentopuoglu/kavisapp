import { supabase } from "@/lib/supabase/client";
import type { BlockedUser } from "@/features/blocks/types";

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("*, profiles!blocks_blocked_id_fkey(username, display_name, avatar_url)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BlockedUser[];
}

export async function blockUser(blockedId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Kullanıcı engellemek için giriş yapmalısınız.");

  const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error) throw error;
}

export async function unblockUser(blockedId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Giriş yapmalısınız.");

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}
