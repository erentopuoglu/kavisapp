import type { Database } from "@/lib/supabase/types";

export type RecordedRide = Database["public"]["Tables"]["recorded_rides"]["Row"];
export type RecordedRideInsert = Database["public"]["Tables"]["recorded_rides"]["Insert"];

export type TrackedPoint = {
  latitude: number;
  longitude: number;
  timestampMs: number;
  speedMps: number | null;
};

export type RecordingStatus = "idle" | "recording" | "finished";

export type RecordingManifest = {
  active: boolean;
  startedAtMs: number;
  chunkCount: number;
  totalPoints: number;
  batterySaverMode: boolean;
};
