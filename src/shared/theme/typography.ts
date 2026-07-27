import { TextStyle } from "react-native";

export const typography = {
  displayLg: { fontSize: 30, fontWeight: "700", lineHeight: 38 } satisfies TextStyle,
  title: { fontSize: 22, fontWeight: "700", lineHeight: 28 } satisfies TextStyle,
  subtitle: { fontSize: 17, fontWeight: "600", lineHeight: 24 } satisfies TextStyle,
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 } satisfies TextStyle,
  bodyMedium: { fontSize: 15, fontWeight: "600", lineHeight: 22 } satisfies TextStyle,
  caption: { fontSize: 13, fontWeight: "400", lineHeight: 18 } satisfies TextStyle,
  overline: { fontSize: 12, fontWeight: "600", lineHeight: 16, letterSpacing: 0.6 } satisfies TextStyle,
} as const;
