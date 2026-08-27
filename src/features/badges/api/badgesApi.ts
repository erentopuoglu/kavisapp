import { supabase } from "@/lib/supabase/client";
import type { BadgeWithStatus } from "@/features/badges/types";

// badges herkese açık okunabilir bir katalog, user_badges ise RLS ile
// SADECE sahibine görünür (user_badges_select_own) — bu yüzden burada
// userId parametresi almamıza rağmen ayrıca bir yetki kontrolüne gerek
// yok, RLS zaten başka birinin rozetlerini sorgulamayı engeller (boş
// döner, hata değil).
export async function fetchBadgesWithStatus(userId: string): Promise<BadgeWithStatus[]> {
  const [badgesRes, earnedRes] = await Promise.all([
    supabase.from("badges").select("*").order("created_at", { ascending: true }),
    supabase.from("user_badges").select("badge_id, awarded_at").eq("user_id", userId),
  ]);
  if (badgesRes.error) throw badgesRes.error;
  if (earnedRes.error) throw earnedRes.error;

  const earnedMap = new Map((earnedRes.data ?? []).map((row) => [row.badge_id, row.awarded_at]));

  return (badgesRes.data ?? []).map((badge) => ({
    id: badge.id,
    key: badge.key,
    title: badge.title,
    description: badge.description,
    earned: earnedMap.has(badge.id),
    awardedAt: earnedMap.get(badge.id) ?? null,
  }));
}
