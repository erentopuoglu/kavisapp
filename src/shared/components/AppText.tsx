import { Text, TextProps } from "react-native";

import { colors, typography } from "@/shared/theme";

type Variant = keyof typeof typography;

type Props = TextProps & {
  variant?: Variant;
  color?: string;
};

export function AppText({ variant = "body", color = colors.textPrimary, style, ...rest }: Props) {
  return <Text style={[typography[variant], { color }, style]} {...rest} />;
}
