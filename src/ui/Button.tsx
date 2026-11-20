import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { opacity, radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'hangup' | 'text' | 'tonal';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  trailingIcon?: IconName;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: ViewStyle;
};

const MIN_HEIGHT = 44;

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  trailingIcon,
  fullWidth,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const theme = useAppTheme();
  const isDisabled = disabled || busy;
  const [focused, setFocused] = useState(false);

  const paletteFor = () => {
    switch (variant) {
      case 'primary':
        return { bg: theme.mode === 'dark' ? '#1c4f45' : '#0f3d33', fg: '#ffffff', border: 'transparent' };
      case 'secondary':
        return { bg: theme.card, fg: theme.textMuted, border: theme.border };
      case 'danger':
        return { bg: theme.dangerBg, fg: theme.dangerText, border: theme.dangerBorder };
      case 'hangup':
        return { bg: theme.mode === 'dark' ? '#dc2626' : '#b91c1c', fg: '#ffffff', border: 'transparent' };
      case 'tonal':
        return { bg: theme.navChip, fg: theme.chipText, border: 'transparent' };
      case 'text':
        return { bg: 'transparent', fg: theme.textMuted, border: 'transparent' };
    }
  };

  const { bg, fg, border } = paletteFor();
  const minHeight = variant === 'primary' ? 48 : MIN_HEIGHT;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(busy) }}
      disabled={isDisabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: border === 'transparent' ? 0 : 1,
          minHeight,
          opacity: isDisabled ? (variant === 'primary' ? opacity.disabledPrimary : opacity.disabledSecondary) : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: variant === 'text' ? space(2) : space(4),
          // Always an array: React Native's Fabric diff passes `null` to
          // `processTransform` when this flips to undefined, which throws
          // "Cannot read property 'forEach' of null". A neutral scale is safe.
          transform: [{ scale: pressed && variant === 'primary' ? 0.995 : 1 }],
        },
        focused ? { shadowColor: theme.focus, shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 0 }, elevation: 0 } : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <Icon name={icon} size={18} color={fg} />
        ) : null}
        <AppText variant="button" color={fg} style={styles.label}>
          {label}
        </AppText>
        {trailingIcon ? <Icon name={trailingIcon} size={18} color={fg} /> : null}
      </View>
    </Pressable>
  );
}

type IconButtonProps = {
  name: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  background?: string;
  disabled?: boolean;
  testID?: string;
};

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 32,
  color,
  background,
  disabled,
  testID,
}: IconButtonProps) {
  const theme = useAppTheme();
  const iconColor = color ?? theme.textMuted;
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background ?? theme.navChip,
        borderWidth: 1,
        borderColor: theme.border,
        opacity: disabled ? opacity.disabledSecondary : pressed ? 0.7 : 1,
        ...(focused ? { borderColor: theme.focus, borderWidth: 2 } : null),
      })}
    >
      <Icon name={name} size={Math.round(size * 0.55)} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space(2.5),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
  },
  label: {
    textAlign: 'center',
  },
});
