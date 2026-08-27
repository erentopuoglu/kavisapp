import { MAX_PHYSICAL_SPEED_KMH, MAX_STORED_TRACK_POINTS } from "@/features/recording/constants";
import type { RecordedRide, TrackedPoint } from "@/features/recording/types";
import type { ParsedGpxPoint } from "@/features/recording/utils/gpx";
import { readFileAsText } from "@/features/recording/utils/gpxFile";
import { supabase } from "@/lib/supabase/client";
import {
  filterGpsNoise,
  haversineDistanceKm,
  pointsToLineStringWkt,
  simplifyToMaxPoints,
  totalDistanceKm,
} from "@/shared/utils/geo";

type RideStats = {
  distanceKm: number;
  durationSeconds: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
};

function computeStatsFromTrackedPoints(points: TrackedPoint[]): RideStats {
  const distanceKm = totalDistanceKm(points);
  const first = points[0];
  const last = points[points.length - 1];
  const durationSeconds = last && first ? Math.max(0, Math.round((last.timestampMs - first.timestampMs) / 1000)) : null;
  const avgSpeedKmh = durationSeconds && durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : null;

  const speedsKmh = points
    .map((p) => (p.speedMps !== null && p.speedMps >= 0 ? p.speedMps * 3.6 : null))
    .filter((v): v is number => v !== null);
  const maxSpeedKmh = speedsKmh.length > 0 ? Math.max(...speedsKmh) : null;

  return { distanceKm, durationSeconds, avgSpeedKmh, maxSpeedKmh };
}

function computeStatsFromGpxPoints(points: ParsedGpxPoint[]): RideStats {
  const distanceKm = totalDistanceKm(points);
  const hasTimestamps = points.every((p) => p.timestampMs !== undefined);

  if (!hasTimestamps) {
    return { distanceKm, durationSeconds: null, avgSpeedKmh: null, maxSpeedKmh: null };
  }

  const first = points[0].timestampMs!;
  const last = points[points.length - 1].timestampMs!;
  const durationSeconds = Math.max(0, Math.round((last - first) / 1000));
  const avgSpeedKmh = durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : null;

  let maxSpeedKmh: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const dtSeconds = (points[i].timestampMs! - points[i - 1].timestampMs!) / 1000;
    if (dtSeconds <= 0) continue;
    const segmentKm = haversineDistanceKm(points[i - 1], points[i]);
    const speedKmh = segmentKm / (dtSeconds / 3600);
    if (maxSpeedKmh === null || speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
  }

  return { distanceKm, durationSeconds, avgSpeedKmh, maxSpeedKmh };
}

export async function fetchMyRides(userId: string): Promise<RecordedRide[]> {
  const { data, error } = await supabase
    .from("recorded_rides")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchRideById(rideId: string): Promise<RecordedRide> {
  const { data, error } = await supabase.from("recorded_rides").select("*").eq("id", rideId).single();
  if (error) throw error;
  return data;
}

export type CreateRideFromRecordingInput = {
  points: TrackedPoint[];
  startedAtMs: number;
  endedAtMs: number;
  routeId?: string;
  // Kayıt sırasında herhangi bir nokta sahte konum (mock location) olarak
  // işaretlenmişse true — bkz. useRecordingStore.hasMockedLocation.
  // Sürüş normal şekilde kaydedilir/gösterilir, sadece haftalık liderlik
  // tablosuna hiç girmez (bkz. 0011_weekly_leaderboard_badges.sql).
  isSuspicious?: boolean;
};

export async function createRideFromRecording(input: CreateRideFromRecordingInput): Promise<RecordedRide> {
  if (input.points.length < 2) {
    throw new Error("Kaydedilecek kadar konum noktası yok.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sürüş kaydetmek için giriş yapmalısınız.");

  const stats = computeStatsFromTrackedPoints(input.points);
  const simplifiedPoints = simplifyToMaxPoints(input.points, MAX_STORED_TRACK_POINTS);

  const { data, error } = await supabase
    .from("recorded_rides")
    .insert({
      user_id: user.id,
      route_id: input.routeId ?? null,
      track: pointsToLineStringWkt(simplifiedPoints),
      distance_km: Math.round(stats.distanceKm * 100) / 100,
      duration_seconds: stats.durationSeconds,
      avg_speed_kmh: stats.avgSpeedKmh !== null ? Math.round(stats.avgSpeedKmh * 100) / 100 : null,
      max_speed_kmh: stats.maxSpeedKmh !== null ? Math.round(stats.maxSpeedKmh * 100) / 100 : null,
      started_at: new Date(input.startedAtMs).toISOString(),
      ended_at: new Date(input.endedAtMs).toISOString(),
      source: "recorded",
      is_suspicious: input.isSuspicious ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export type CreateRideFromGpxInput = {
  points: ParsedGpxPoint[];
  fileUri: string;
  fileName: string;
};

export async function createRideFromGpx(input: CreateRideFromGpxInput): Promise<RecordedRide> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sürüş içe aktarmak için giriş yapmalısınız.");

  // GPS sıçraması: ardışık nokta arası üstü kapalı hız fiziksel olarak
  // imkansızsa (>250 km/sa) o nokta hem geometriden hem istatistiklerden
  // çıkarılır. Zaman damgası olmayan GPX'lerde no-op (dizi aynen döner).
  const cleanPoints = filterGpsNoise(input.points, MAX_PHYSICAL_SPEED_KMH);
  if (cleanPoints.length < 2) {
    throw new Error("GPS gürültü filtresinden sonra yeterli konum noktası kalmadı.");
  }

  const stats = computeStatsFromGpxPoints(cleanPoints);
  const simplifiedPoints = simplifyToMaxPoints(cleanPoints, MAX_STORED_TRACK_POINTS);

  const first = cleanPoints[0];
  const last = cleanPoints[cleanPoints.length - 1];
  const startedAtIso = first.timestampMs ? new Date(first.timestampMs).toISOString() : new Date().toISOString();
  const endedAtIso = last.timestampMs ? new Date(last.timestampMs).toISOString() : null;

  const storagePath = `${user.id}/${Date.now()}-${input.fileName}`;
  const fileContent = await readFileAsText(input.fileUri);
  const { error: uploadError } = await supabase.storage
    .from("gpx-files")
    .upload(storagePath, fileContent, { contentType: "application/gpx+xml" });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("recorded_rides")
    .insert({
      user_id: user.id,
      track: pointsToLineStringWkt(simplifiedPoints),
      distance_km: Math.round(stats.distanceKm * 100) / 100,
      duration_seconds: stats.durationSeconds,
      avg_speed_kmh: stats.avgSpeedKmh !== null ? Math.round(stats.avgSpeedKmh * 100) / 100 : null,
      max_speed_kmh: stats.maxSpeedKmh !== null ? Math.round(stats.maxSpeedKmh * 100) / 100 : null,
      started_at: startedAtIso,
      ended_at: endedAtIso,
      gpx_storage_path: storagePath,
      // ZORUNLU: recorded_rides.source'un DB varsayılanı 'recorded' —
      // bunu açıkça 'gpx_import' yapmazsak bu sürüş yanlışlıkla haftalık
      // liderlik tablosuna girer (bkz. 0011_weekly_leaderboard_badges.sql).
      source: "gpx_import",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRide(ride: Pick<RecordedRide, "id" | "gpx_storage_path">): Promise<void> {
  if (ride.gpx_storage_path) {
    await supabase.storage.from("gpx-files").remove([ride.gpx_storage_path]);
  }
  const { error } = await supabase.from("recorded_rides").delete().eq("id", ride.id);
  if (error) throw error;
}

export async function linkRideToRoute(rideId: string, routeId: string | null): Promise<void> {
  const { error } = await supabase.from("recorded_rides").update({ route_id: routeId }).eq("id", rideId);
  if (error) throw error;
}
