import type { LatLng } from "@/lib/map/types";
import { supabase } from "@/lib/supabase/client";
import { pointsToLineStringWkt, totalDistanceKm } from "@/shared/utils/geo";
import type {
  Route,
  RouteRating,
  RouteRatingInsert,
  RouteRatingWithAuthor,
  RouteSortOption,
} from "@/features/routes/types";

export const MAX_ROUTE_POINTS = 500;

export type RouteFilters = {
  searchText?: string;
  sort?: RouteSortOption;
};

function overallAverage(route: Route): number {
  return (route.avg_curve_quality + route.avg_road_surface + route.avg_scenery + route.avg_traffic) / 4;
}

export async function fetchRoutes(filters: RouteFilters = {}): Promise<Route[]> {
  let query = supabase.from("routes").select("*");

  const term = filters.searchText?.trim();
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(`title.ilike.${pattern},region.ilike.${pattern}`);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const routes = data ?? [];
  if (filters.sort === "top_rated") {
    return [...routes].sort((a, b) => overallAverage(b) - overallAverage(a));
  }
  return routes;
}

export async function fetchNearbyRoutes(coordinate: LatLng, radiusMeters = 50000): Promise<Route[]> {
  const { data, error } = await supabase.rpc("nearby_routes", {
    user_lng: coordinate.longitude,
    user_lat: coordinate.latitude,
    radius_meters: radiusMeters,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchRouteById(routeId: string): Promise<Route> {
  const { data, error } = await supabase.from("routes").select("*").eq("id", routeId).single();
  if (error) throw error;
  return data;
}

export async function fetchRouteRatings(routeId: string): Promise<RouteRatingWithAuthor[]> {
  const { data, error } = await supabase
    .from("route_ratings")
    .select("*, profiles(username, avatar_url)")
    .eq("route_id", routeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RouteRatingWithAuthor[];
}

export async function fetchMyRating(routeId: string, userId: string): Promise<RouteRating | null> {
  const { data, error } = await supabase
    .from("route_ratings")
    .select("*")
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function rateRoute(rating: RouteRatingInsert): Promise<RouteRating> {
  const { data, error } = await supabase
    .from("route_ratings")
    .upsert(rating, { onConflict: "route_id,user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function incrementRouteView(routeId: string): Promise<void> {
  const { error } = await supabase.rpc("increment_route_view_count", { p_route_id: routeId });
  if (error) throw error;
}

export type CreateRouteInput = {
  title: string;
  description?: string;
  region?: string;
  estimatedDurationMin?: number;
  points: LatLng[];
  /** Verilirse (ör. Directions API'den gelen gerçek yol mesafesi) istemci
   *  haversine yaklaşıklığı yerine bu kullanılır — bkz. rota/olustur.tsx
   *  "Yol Takipli" modu ve README'deki distance_km teknik borç notu. */
  distanceKm?: number;
};

export async function createRoute(input: CreateRouteInput): Promise<Route> {
  if (input.points.length < 2) {
    throw new Error("Bir rota en az 2 nokta içermeli.");
  }
  if (input.points.length > MAX_ROUTE_POINTS) {
    throw new Error(`Bir rota en fazla ${MAX_ROUTE_POINTS} nokta içerebilir.`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Rota oluşturmak için giriş yapmalısınız.");

  const distanceKm =
    input.distanceKm !== undefined
      ? Math.round(input.distanceKm * 100) / 100
      : Math.round(totalDistanceKm(input.points) * 100) / 100;

  const { data, error } = await supabase
    .from("routes")
    .insert({
      creator_id: user.id,
      title: input.title,
      description: input.description ?? null,
      region: input.region ?? null,
      estimated_duration_min: input.estimatedDurationMin ?? null,
      distance_km: distanceKm,
      path: pointsToLineStringWkt(input.points),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
