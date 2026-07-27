import AsyncStorage from "@react-native-async-storage/async-storage";

const BATTERY_SAVER_KEY = "@kavis/recording/battery-saver-mode";

export async function getBatterySaverMode(): Promise<boolean> {
  const value = await AsyncStorage.getItem(BATTERY_SAVER_KEY);
  return value === "1";
}

export async function setBatterySaverMode(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BATTERY_SAVER_KEY, enabled ? "1" : "0");
}
