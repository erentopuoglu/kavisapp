// Kavis koyu tema paleti — asfalt/gece sürüşü estetiği.
// v1 kapsamında yalnızca koyu tema desteklenir (bkz. README "Tasarım kararları").
export const colors = {
  background: "#14171C",
  backgroundElevated: "#1C2026",
  surface: "#20242B",
  surfaceHighlight: "#2A2F37",
  border: "#2A2F37",

  textPrimary: "#F2F3F5",
  textSecondary: "#9AA0A6",
  textDisabled: "#5B6068",

  primary: "#FF7A1A",
  primaryPressed: "#E56A10",
  primaryMuted: "#4A3420",

  danger: "#E5484D",
  dangerMuted: "#3A2226",
  success: "#3DDC84",
  warning: "#FFC107",

  ratingGold: "#FFC107",
  overlay: "rgba(0, 0, 0, 0.6)",
} as const;

export type ColorToken = keyof typeof colors;
