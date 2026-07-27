import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const DATE_FORMAT = "DD.MM.YYYY";
const TIME_FORMAT = "HH:mm";

// Kullanıcının ayrı ayrı girdiği "GG.AA.YYYY" + "SS:DD" metinlerini tek bir
// Date'e dönüştürür; herhangi biri geçersizse null döner.
export function parseScheduledAt(dateText: string, timeText: string): Date | null {
  const combined = `${dateText.trim()} ${timeText.trim()}`;
  const parsed = dayjs(combined, `${DATE_FORMAT} ${TIME_FORMAT}`, true);
  return parsed.isValid() ? parsed.toDate() : null;
}

export function formatScheduledAt(iso: string): string {
  return dayjs(iso).format("DD.MM.YYYY HH:mm");
}

// Canlı konum pin'lerinde "X dk önce" etiketi için — Faz 4 onayındaki
// tazelik göstergesi.
export function formatAgeShort(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return "az önce";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} dk önce`;
}
