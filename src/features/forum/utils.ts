import dayjs from "dayjs";

// Diğer fazlardaki (bkz. group-rides/utils.ts formatScheduledAt) sabit
// DD.MM.YYYY HH:mm formatıyla aynı — yeni bir dayjs plugin'i (relativeTime)
// eklemeye gerek kalmadan tutarlı bir tarih gösterimi.
export function formatForumDate(iso: string): string {
  return dayjs(iso).format("DD.MM.YYYY HH:mm");
}
