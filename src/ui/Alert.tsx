import { View, type ViewStyle } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { AppText, type TextVariant } from './AppText';
import { Icon, type IconName } from './Icon';

export type AlertTone = 'error' | 'success' | 'warning' | 'info';

type ToneColors = { bg: string; border: string; text: string };

function toneColors(tone: AlertTone, theme: ReturnType<typeof useAppTheme>): ToneColors {
  switch (tone) {
    case 'error':
      return { bg: theme.dangerBg, border: theme.dangerBorder, text: theme.dangerText };
    case 'success':
      return { bg: theme.successBg, border: theme.successBorder, text: theme.successText };
    case 'warning':
      return { bg: theme.warningBg, border: theme.warningBorder, text: theme.warningText };
    case 'info':
      return { bg: theme.successBg, border: theme.successBorder, text: theme.successText };
  }
}

const toneIcon: Record<AlertTone, IconName> = {
  error: 'error-outline',
  success: 'check-circle-outline',
  warning: 'warning-amber',
  info: 'info-outline',
};

/**
 * Inline message block.
 *
 * Accessibility follows DESIGN §7: errors announce as `alert`, everything else as
 * `status` with a polite live region.
 */
export function InlineAlert({
  tone = 'error',
  message,
  style,
}: {
  tone?: AlertTone;
  message: string;
  style?: ViewStyle;
}) {
  const theme = useAppTheme();
  const colors = toneColors(tone, theme);

  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space(2),
          paddingHorizontal: space(3),
          paddingVertical: space(2.5),
          borderRadius: radius.input,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Icon name={toneIcon[tone]} size={18} color={colors.text} />
      <AppText variant="hint" color={colors.text} style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

/** Small centred muted line used for empty lists (DESIGN §5.7). */
export function EmptyState({ message, variant = 'hint' }: { message: string; variant?: TextVariant }) {
  const theme = useAppTheme();
  return (
    <AppText variant={variant} color={theme.textMeta} align="center" style={{ paddingVertical: space(3) }}>
      {message}
    </AppText>
  );
}
