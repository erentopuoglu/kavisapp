import { forwardRef } from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";

import { AppText } from "@/shared/components/AppText";
import { colors, radius, spacing } from "@/shared/theme";

type Props = TextInputProps & {
  label?: string;
  errorText?: string;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, errorText, style, ...rest },
  ref
) {
  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="caption" color={colors.textSecondary} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textDisabled}
        style={[styles.input, !!errorText && styles.inputError, style]}
        {...rest}
      />
      {errorText ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {errorText}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.xs,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    marginTop: spacing.xs,
  },
});
