export type LeaderboardCategory = "routes_ridden" | "routes_shared" | "pois_added" | "best_answers";

export type LeaderboardEntry = {
  username: string;
  count: number;
};

export const LEADERBOARD_CATEGORIES: { key: LeaderboardCategory; label: string; unit: string }[] = [
  { key: "routes_ridden", label: "Farklı Rota Süren", unit: "rota" },
  { key: "routes_shared", label: "Rota Paylaşan", unit: "rota" },
  { key: "pois_added", label: "İşaretli Nokta Ekleyen", unit: "nokta" },
  { key: "best_answers", label: "En İyi Cevap Alan", unit: "cevap" },
];
