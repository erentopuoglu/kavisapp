import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { LOCATION_TASK_NAME } from "@/features/recording/constants";
import { useRecordingStore } from "@/features/recording/store/useRecordingStore";

// Bu dosya, TaskManager görev tanımının uygulama her başladığında (arka
// planda OS tarafından yeniden başlatılsa bile) kayıtlı olmasını sağlamak
// için src/app/_layout.tsx'te yan etki (side-effect) olarak import edilir.
type LocationTaskData = { locations: Location.LocationObject[] };

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn("[kavis-location-task] konum güncellemesi alınamadı:", error);
    return;
  }

  const { locations } = (data as LocationTaskData | undefined) ?? { locations: [] };
  if (locations.length > 0) {
    useRecordingStore.getState().ingestLocations(locations);
  }
});
