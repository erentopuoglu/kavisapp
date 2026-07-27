import type { Database } from "@/lib/supabase/types";

export type Route = Database["public"]["Tables"]["routes"]["Row"];
export type RouteRating = Database["public"]["Tables"]["route_ratings"]["Row"];
export type RouteRatingInsert = Database["public"]["Tables"]["route_ratings"]["Insert"];

export type RouteRatingWithAuthor = RouteRating & {
  profiles: { username: string; avatar_url: string | null } | null;
};

export type RouteSortOption = "newest" | "top_rated";

export const RATING_CRITERIA = [
  { key: "curve_quality", label: "Viraj Kalitesi" },
  { key: "road_surface", label: "Asfalt Durumu" },
  { key: "scenery", label: "Manzara" },
  { key: "traffic", label: "Trafik Yoğunluğu (az = iyi)" },
] as const;

export function overallAverage(route: Pick<Route, "avg_curve_quality" | "avg_road_surface" | "avg_scenery" | "avg_traffic">): number {
  const sum = route.avg_curve_quality + route.avg_road_surface + route.avg_scenery + route.avg_traffic;
  return sum / 4;
}
