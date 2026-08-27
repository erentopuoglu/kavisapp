import { supabase } from "@/lib/supabase/client";
import type { LeaderboardCategory, LeaderboardEntry } from "@/features/leaderboard/types";

// Bu haftanın Pazartesi'si (Postgres date_trunc('week', ...) ile aynı
// kural) — RPC'lere p_week_start olarak gönderiliyor, ama tüm fonksiyonlar
// zaten aynı varsayılana sahip; burada açıkça göndermemizin sebebi
// istemci/sunucu saat dilimi farkının sonucu bir gün kaydırmasını önlemek.
function currentWeekStartIso(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Pazar
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

// Liderlik tablosu ekranı her açıldığında önce bu çağrılır: geçen hafta
// henüz ödüllendirilmediyse (rozet dağıtılmadıysa) dağıtır, dağıtıldıysa
// no-op. Cron YOK — bkz. 0011_weekly_leaderboard_badges.sql tasarım notu.
// Başarısız olursa (ör. ağ hatası) sessizce yutuluyor: bu bir "arka plan
// bakım" işlemi, kullanıcının liderlik tablosunu görmesini engellememeli.
export async function finalizeWeeklyAwardsIfNeeded(): Promise<void> {
  try {
    const { error } = await supabase.rpc("finalize_weekly_awards");
    if (error) console.warn("[leaderboardApi] finalize_weekly_awards başarısız:", error);
  } catch (err) {
    console.warn("[leaderboardApi] finalize_weekly_awards çağrılamadı:", err);
  }
}

export async function fetchLeaderboard(category: LeaderboardCategory, limit = 10): Promise<LeaderboardEntry[]> {
  const weekStart = currentWeekStartIso();

  switch (category) {
    case "routes_ridden": {
      const { data, error } = await supabase.rpc("get_weekly_route_leaderboard", {
        p_week_start: weekStart,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ username: row.username, count: row.distinct_routes }));
    }
    case "routes_shared": {
      const { data, error } = await supabase.rpc("get_weekly_routes_shared_leaderboard", {
        p_week_start: weekStart,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ username: row.username, count: row.shared_count }));
    }
    case "pois_added": {
      const { data, error } = await supabase.rpc("get_weekly_pois_leaderboard", {
        p_week_start: weekStart,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ username: row.username, count: row.poi_count }));
    }
    case "best_answers": {
      const { data, error } = await supabase.rpc("get_weekly_best_answers_leaderboard", {
        p_week_start: weekStart,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({ username: row.username, count: row.best_answer_count }));
    }
  }
}

// Kişisel istatistik — SIRALAMADA KULLANILMIYOR, sadece "bu hafta kaç km
// sürdün" bilgisi için. recorded_rides zaten RLS ile kullanıcıya kendi
// satırlarını gösteriyor, ayrı bir RPC gerekmiyor. Serbest/canlı ayrımı
// yapılmıyor (kişisel istatistikte GPX de dahil, sadece rekabette hariç).
export async function fetchMyWeeklyDistanceKm(userId: string): Promise<number> {
  const weekStart = currentWeekStartIso();
  const { data, error } = await supabase
    .from("recorded_rides")
    .select("distance_km")
    .eq("user_id", userId)
    .gte("started_at", `${weekStart}T00:00:00Z`);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.distance_km ?? 0), 0);
}
