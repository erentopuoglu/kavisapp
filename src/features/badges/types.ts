export type Badge = {
  id: string;
  key: string;
  title: string;
  description: string;
};

export type EarnedBadge = Badge & {
  awardedAt: string;
};

// Katalogdaki her rozet + kullanıcının kazanıp kazanmadığı — "kilitli"
// rozetleri de göstermek (koleksiyon hissi) için kullanılıyor.
export type BadgeWithStatus = Badge & {
  earned: boolean;
  awardedAt: string | null;
};
