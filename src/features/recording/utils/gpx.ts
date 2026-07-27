import { XMLParser } from "fast-xml-parser";

import { MAX_STORED_TRACK_POINTS } from "@/features/recording/constants";
import type { LatLng } from "@/lib/map/types";
import { simplifyToMaxPoints } from "@/shared/utils/geo";

export const MAX_GPX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_GPX_RAW_POINTS = 20000;

export type ParsedGpxPoint = LatLng & { timestampMs?: number; elevationM?: number };

export class GpxImportError extends Error {}

export function validateGpxFileSize(sizeBytes: number): void {
  if (sizeBytes > MAX_GPX_FILE_SIZE_BYTES) {
    const maxMb = (MAX_GPX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    const actualMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    throw new GpxImportError(`Dosya çok büyük (${actualMb} MB). En fazla ${maxMb} MB olabilir.`);
  }
}

type GpxTrkPt = { "@_lat": string; "@_lon": string; ele?: string; time?: string };
type GpxTrkSeg = { trkpt?: GpxTrkPt | GpxTrkPt[] };
type GpxTrk = { trkseg?: GpxTrkSeg | GpxTrkSeg[] };
type GpxDocument = { gpx?: { trk?: GpxTrk | GpxTrk[] } };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseGpxContent(xml: string): ParsedGpxPoint[] {
  let doc: GpxDocument;
  try {
    doc = parser.parse(xml) as GpxDocument;
  } catch {
    throw new GpxImportError("Dosya geçerli bir XML/GPX değil.");
  }

  if (!doc.gpx) {
    throw new GpxImportError("Geçerli bir GPX dosyası değil (<gpx> kökü bulunamadı).");
  }

  const points: ParsedGpxPoint[] = [];

  for (const track of asArray(doc.gpx.trk)) {
    for (const segment of asArray(track.trkseg)) {
      for (const trkpt of asArray(segment.trkpt)) {
        const latitude = Number(trkpt["@_lat"]);
        const longitude = Number(trkpt["@_lon"]);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue;

        const point: ParsedGpxPoint = { latitude, longitude };
        if (trkpt.ele !== undefined) {
          const elevation = Number(trkpt.ele);
          if (!Number.isNaN(elevation)) point.elevationM = elevation;
        }
        if (trkpt.time) {
          const parsedTime = Date.parse(trkpt.time);
          if (!Number.isNaN(parsedTime)) point.timestampMs = parsedTime;
        }

        points.push(point);
        if (points.length > MAX_GPX_RAW_POINTS) {
          throw new GpxImportError(
            `GPX dosyası çok fazla nokta içeriyor (>${MAX_GPX_RAW_POINTS}). Daha kısa bir kayıt seçin.`
          );
        }
      }
    }
  }

  if (points.length < 2) {
    throw new GpxImportError("GPX dosyasında yeterli konum noktası bulunamadı.");
  }

  return points;
}

/** Depolamadan/haritadan önce çok yoğun izleri makul boyuta indirir. */
export function simplifyForStorage(points: LatLng[]): LatLng[] {
  return simplifyToMaxPoints(points, MAX_STORED_TRACK_POINTS);
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

export function buildGpxDocument(params: { name: string; points: LatLng[]; startedAtIso: string }): string {
  const trkpts = params.points
    .map((p) => `      <trkpt lat="${p.latitude}" lon="${p.longitude}"></trkpt>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kavis" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(params.name)}</name>
    <time>${params.startedAtIso}</time>
  </metadata>
  <trk>
    <name>${escapeXml(params.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}
