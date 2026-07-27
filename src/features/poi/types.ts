import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Database, PoiType } from "@/lib/supabase/types";

type MaterialCommunityIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type Poi = Database["public"]["Tables"]["pois"]["Row"];
export type PoiVote = Database["public"]["Tables"]["poi_votes"]["Row"];
export type { PoiType };

export const POI_TYPES: PoiType[] = [
  "gas_station",
  "motorcycle_friendly_cafe",
  "dangerous_curve",
  "gravel_road",
  "rest_stop",
  "scenic_viewpoint",
  "repair_shop",
];

export const POI_TYPE_META: Record<PoiType, { label: string; icon: MaterialCommunityIconName; color?: string }> = {
  gas_station: { label: "Benzinlik", icon: "gas-station" },
  motorcycle_friendly_cafe: { label: "Motorcu Dostu Kafe", icon: "coffee" },
  dangerous_curve: { label: "Tehlikeli Viraj", icon: "alert-octagon", color: "#E5484D" },
  gravel_road: { label: "Çakıllı Yol", icon: "terrain", color: "#FFC107" },
  rest_stop: { label: "Mola Noktası", icon: "silverware-fork-knife" },
  scenic_viewpoint: { label: "Manzara Noktası", icon: "image-filter-hdr" },
  repair_shop: { label: "Tamirci", icon: "wrench" },
};

export function poiNetScore(poi: Pick<Poi, "upvotes" | "downvotes">): number {
  return poi.upvotes - poi.downvotes;
}

// Net oy skoru bu eşiğin altına düşen (belirgin negatif) POI'ler haritada
// soluk gösterilir — topluluk bu POI'nin güvenilirliğini sorguluyor demektir.
export const POI_FADE_NET_SCORE_THRESHOLD = -3;
