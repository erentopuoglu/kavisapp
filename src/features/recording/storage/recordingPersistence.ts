import AsyncStorage from "@react-native-async-storage/async-storage";

import type { RecordingManifest, TrackedPoint } from "@/features/recording/types";

// Noktalar tek tek değil ~10'luk tamponlarla (chunk) yazılıyor — her nokta
// için ayrı bir AsyncStorage yazımı, uzun bir sürüşte gereksiz I/O ve
// pil tüketimine yol açardı.
export const CHUNK_SIZE = 10;

const MANIFEST_KEY = "@kavis/recording/manifest";
const chunkKey = (index: number) => `@kavis/recording/chunk/${index}`;

export async function saveManifest(manifest: RecordingManifest): Promise<void> {
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

export async function loadManifest(): Promise<RecordingManifest | null> {
  const raw = await AsyncStorage.getItem(MANIFEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecordingManifest;
  } catch {
    return null;
  }
}

export async function saveChunk(index: number, points: TrackedPoint[]): Promise<void> {
  await AsyncStorage.setItem(chunkKey(index), JSON.stringify(points));
}

export async function loadAllChunks(chunkCount: number): Promise<TrackedPoint[]> {
  if (chunkCount <= 0) return [];
  const keys = Array.from({ length: chunkCount }, (_, i) => chunkKey(i));
  const entries = await AsyncStorage.multiGet(keys);

  const points: TrackedPoint[] = [];
  for (const [, value] of entries) {
    if (!value) continue;
    try {
      points.push(...(JSON.parse(value) as TrackedPoint[]));
    } catch {
      // Bozuk bir chunk kurtarmayı tamamen engellemesin — en iyi çaba.
    }
  }
  return points;
}

export async function clearRecordingStorage(chunkCount: number): Promise<void> {
  const keys = [MANIFEST_KEY, ...Array.from({ length: chunkCount }, (_, i) => chunkKey(i))];
  await AsyncStorage.multiRemove(keys);
}
