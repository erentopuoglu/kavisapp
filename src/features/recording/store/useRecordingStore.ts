import { create } from "zustand";

import {
  BATTERY_SAVER_THRESHOLDS,
  LOCATION_TASK_NAME,
  MAX_PHYSICAL_SPEED_KMH,
  NORMAL_THRESHOLDS,
} from "@/features/recording/constants";
import {
  CHUNK_SIZE,
  clearRecordingStorage,
  loadAllChunks,
  loadManifest,
  saveChunk,
  saveManifest,
} from "@/features/recording/storage/recordingPersistence";
import type { RecordingManifest, RecordingStatus, TrackedPoint } from "@/features/recording/types";
import {
  BATTERY_SAVER_TRACKING_PROFILE,
  NORMAL_TRACKING_PROFILE,
  startBackgroundTracking,
  stopBackgroundTracking,
} from "@/lib/location/backgroundTracking";
import { haversineDistanceKm, isGpsJump } from "@/shared/utils/geo";

type RawLocation = {
  coords: {
    latitude: number;
    longitude: number;
    speed: number | null;
  };
  timestamp: number;
};

type RecordingState = {
  status: RecordingStatus;
  points: TrackedPoint[];
  pendingBuffer: TrackedPoint[];
  chunkCount: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  batterySaverMode: boolean;
  recoveredManifest: RecordingManifest | null;

  hydrate: () => Promise<void>;
  loadRecoveredPoints: () => Promise<TrackedPoint[]>;
  discardRecovered: () => Promise<void>;
  resumeRecoveredAsFinished: () => Promise<void>;

  start: (batterySaverMode: boolean) => Promise<void>;
  ingestLocations: (locations: RawLocation[]) => void;
  stop: () => Promise<void>;
  finalize: () => Promise<void>;
  discard: () => Promise<void>;
};

function shouldRecordPoint(last: TrackedPoint | undefined, candidate: TrackedPoint, batterySaver: boolean): boolean {
  if (!last) return true;

  const thresholds = batterySaver ? BATTERY_SAVER_THRESHOLDS : NORMAL_THRESHOLDS;
  const elapsedMs = candidate.timestampMs - last.timestampMs;
  if (elapsedMs >= thresholds.minIntervalMs) return true;

  const distanceM =
    haversineDistanceKm(
      { latitude: last.latitude, longitude: last.longitude },
      { latitude: candidate.latitude, longitude: candidate.longitude }
    ) * 1000;
  return distanceM >= thresholds.minDistanceM;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  status: "idle",
  points: [],
  pendingBuffer: [],
  chunkCount: 0,
  startedAtMs: null,
  endedAtMs: null,
  batterySaverMode: false,
  recoveredManifest: null,

  hydrate: async () => {
    const manifest = await loadManifest();
    if (manifest?.active) {
      set({ recoveredManifest: manifest });
    }
  },

  loadRecoveredPoints: async () => {
    const manifest = get().recoveredManifest;
    if (!manifest) return [];
    return loadAllChunks(manifest.chunkCount);
  },

  discardRecovered: async () => {
    const manifest = get().recoveredManifest;
    await clearRecordingStorage(manifest?.chunkCount ?? 0);
    set({ recoveredManifest: null });
  },

  // Gerçek "canlı takibe devam et" yerine (arka plan görevi bir process kill
  // sonrası güvenilir şekilde yeniden bağlanamayabiliyor), kurtarılan
  // noktaları "sürüş az önce durdu" gibi ele alıp özet ekranına taşıyoruz —
  // veri kaybı olmuyor, sadece kayıt kaldığı yerden devam etmiyor.
  resumeRecoveredAsFinished: async () => {
    const manifest = get().recoveredManifest;
    if (!manifest) return;
    const points = await loadAllChunks(manifest.chunkCount);
    const lastPoint = points[points.length - 1];
    set({
      status: "finished",
      points,
      pendingBuffer: [],
      chunkCount: manifest.chunkCount,
      startedAtMs: manifest.startedAtMs,
      endedAtMs: lastPoint?.timestampMs ?? manifest.startedAtMs,
      batterySaverMode: manifest.batterySaverMode,
      recoveredManifest: null,
    });
  },

  start: async (batterySaverMode: boolean) => {
    const startedAtMs = Date.now();
    set({
      status: "recording",
      points: [],
      pendingBuffer: [],
      chunkCount: 0,
      startedAtMs,
      endedAtMs: null,
      batterySaverMode,
    });

    await saveManifest({
      active: true,
      startedAtMs,
      chunkCount: 0,
      totalPoints: 0,
      batterySaverMode,
    });

    const profile = batterySaverMode ? BATTERY_SAVER_TRACKING_PROFILE : NORMAL_TRACKING_PROFILE;
    await startBackgroundTracking(LOCATION_TASK_NAME, profile);
  },

  ingestLocations: (locations: RawLocation[]) => {
    if (get().status !== "recording") return;

    const { points, pendingBuffer, batterySaverMode, chunkCount } = get();
    const nextPoints = [...points];
    const nextBuffer = [...pendingBuffer];

    for (const location of locations) {
      const candidate: TrackedPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestampMs: location.timestamp,
        speedMps: location.coords.speed,
      };
      const last = nextPoints[nextPoints.length - 1];

      // GPS sıçraması: ardışık iki nokta arası üstü kapalı hız fiziksel
      // olarak imkansızsa (>250 km/sa) bu noktayı tamamen at — ne rotaya
      // ne de maks/ort hız hesabına girsin.
      if (last && isGpsJump(last, candidate, MAX_PHYSICAL_SPEED_KMH)) {
        continue;
      }

      if (shouldRecordPoint(last, candidate, batterySaverMode)) {
        nextPoints.push(candidate);
        nextBuffer.push(candidate);
      }
    }

    let flushedChunkCount = chunkCount;
    let remainingBuffer = nextBuffer;
    const flushPromises: Promise<void>[] = [];

    while (remainingBuffer.length >= CHUNK_SIZE) {
      const chunk = remainingBuffer.slice(0, CHUNK_SIZE);
      flushPromises.push(saveChunk(flushedChunkCount, chunk));
      flushedChunkCount += 1;
      remainingBuffer = remainingBuffer.slice(CHUNK_SIZE);
    }

    set({ points: nextPoints, pendingBuffer: remainingBuffer, chunkCount: flushedChunkCount });

    if (flushPromises.length > 0) {
      Promise.all(flushPromises)
        .then(() =>
          saveManifest({
            active: true,
            startedAtMs: get().startedAtMs ?? Date.now(),
            chunkCount: flushedChunkCount,
            totalPoints: nextPoints.length,
            batterySaverMode,
          })
        )
        .catch((err) => console.warn("[useRecordingStore] chunk kaydedilemedi:", err));
    }
  },

  stop: async () => {
    await stopBackgroundTracking(LOCATION_TASK_NAME);

    const { pendingBuffer, chunkCount, points, startedAtMs, batterySaverMode } = get();
    let finalChunkCount = chunkCount;

    if (pendingBuffer.length > 0) {
      await saveChunk(chunkCount, pendingBuffer);
      finalChunkCount += 1;
      await saveManifest({
        active: true,
        startedAtMs: startedAtMs ?? Date.now(),
        chunkCount: finalChunkCount,
        totalPoints: points.length,
        batterySaverMode,
      });
    }

    set({ status: "finished", pendingBuffer: [], chunkCount: finalChunkCount, endedAtMs: Date.now() });
  },

  finalize: async () => {
    await clearRecordingStorage(get().chunkCount);
    set({ status: "idle", points: [], pendingBuffer: [], chunkCount: 0, startedAtMs: null, endedAtMs: null });
  },

  discard: async () => {
    await stopBackgroundTracking(LOCATION_TASK_NAME);
    await clearRecordingStorage(get().chunkCount);
    set({ status: "idle", points: [], pendingBuffer: [], chunkCount: 0, startedAtMs: null, endedAtMs: null });
  },
}));
