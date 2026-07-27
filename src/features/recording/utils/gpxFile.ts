import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function writeAndShareGpx(fileName: string, xmlContent: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(xmlContent);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Bu cihazda dosya paylaşımı desteklenmiyor.");
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: "application/gpx+xml",
    dialogTitle: "GPX Dışa Aktar",
  });
}

export async function readFileAsText(uri: string): Promise<string> {
  const file = new File(uri);
  return file.text();
}

export function getFileSizeBytes(uri: string): number {
  const file = new File(uri);
  return file.size;
}
