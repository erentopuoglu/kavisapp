import { useCallback, useState } from "react";

import type { FlyoverControl, FlyoverProgress } from "@/lib/map";
import type { LatLng } from "@/lib/map/types";

// Ekranların (sürüş özeti, rota detay) "Oynat" düğmesi + AppMapView arasında
// paylaştığı state — ikisi de aynı davranışı istediği için (bkz. flyover
// araştırma/planı) burada tek yerde tutuluyor. Mapbox'a özgü hiçbir şey
// içermez, sadece FlyoverControl/FlyoverProgress tiplerini kullanır.
export function useRouteFlyover(coordinates: LatLng[]) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState<FlyoverProgress | null>(null);

  const toggle = useCallback(() => {
    setProgress(null);
    setIsPlaying((prev) => !prev);
  }, []);

  const flyover: FlyoverControl = {
    active: isPlaying,
    coordinates,
    onProgress: setProgress,
    onFinish: () => setIsPlaying(false),
  };

  return {
    flyover,
    isPlaying,
    progress,
    canPlay: coordinates.length >= 2,
    toggle,
  };
}
