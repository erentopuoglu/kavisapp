import * as Location from "expo-location";

import type { LatLng } from "@/lib/map/types";

export async function getForegroundPermissionStatus() {
  return Location.getForegroundPermissionsAsync();
}

export async function requestForegroundPermission() {
  return Location.requestForegroundPermissionsAsync();
}

export async function getBackgroundPermissionStatus() {
  return Location.getBackgroundPermissionsAsync();
}

// Android 10+ / iOS: arka plan izni yalnızca ön plan izni zaten verilmişken
// istenebilir — çağıran taraf önce requestForegroundPermission'ı beklemeli.
export async function requestBackgroundPermission() {
  return Location.requestBackgroundPermissionsAsync();
}

export async function getCurrentCoordinates(): Promise<LatLng | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
