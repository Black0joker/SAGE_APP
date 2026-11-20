import { Pressable, View, type ViewStyle } from 'react-native';

import { useT } from '@/i18n/useT';
import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { AppText } from './AppText';

export type BadgeTone = 'neutral' | 'pending' | 'accepted' | 'revoked' | 'active' | 'stale' | 'unknown' | 'brand';

function badgeColors(tone: BadgeTone, theme: ReturnType<typeof useAppTheme>) {
  switch (tone) {
    case 'accepted':
    case 'active':
    case 'brand':
      return { bg: theme.mode === 'dark' ? 'rgba(15,61,51,0.4)' : '#eef5f1', text: theme.mode === 'dark' ? '#dbe5e0' : '#143f36' };
    case 'pending':
    case 'unknown':
      return { bg: theme.navChip, text: theme.textMuted };
    case 'revoked':
    case 'stale':
      return { bg: theme.dangerBg, text: theme.dangerText };
    case 'neutral':
      return { bg: theme.navChip, text: theme.textMeta };
  }
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useAppTheme();
  const colors = badgeColors(tone, theme);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors.bg,
        paddingHorizontal: space(2.5),
        paddingVertical: space(1),
        borderRadius: radius.pill,
      }}
    >
      <AppText variant="badge" color={colors.text}>
        {label}
      </AppText>
    </View>
  );
}

/** Neutral header pill, e.g. `Personal memory` / `Voice call`. */
export function Chip({ label, style }: { label: string; style?: ViewStyle }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.navChip,
          borderRadius: radius.pill,
          paddingHorizontal: space(3),
          paddingVertical: space(1.25),
        },
        style,
      ]}
    >
      <AppText variant="meta" color={theme.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * On/Off consent switch (DESIGN §4.5). The label carries the state in text, so
 * the control never relies on colour alone.
 */
export function TogglePill({
  active,
  onPress,
  disabled,
  onLabel,
  offLabel,
  testID,
}: {
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  onLabel: string;
  offLabel: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  const bg = active ? (theme.mode === 'dark' ? 'rgba(15,61,51,0.5)' : '#dbe5e0') : theme.navChip;
  const fg = active ? (theme.mode === 'dark' ? '#b9ede0' : '#143f36') : theme.textMuted;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled: Boolean(disabled) }}
      accessibilityLabel={active ? onLabel : offLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        minWidth: 72,
        paddingHorizontal: space(3.5),
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <AppText variant="badge" color={fg} style={{ fontSize: 12 }}>
        {active ? onLabel : offLabel}
      </AppText>
    </Pressable>
  );
}

/** 32px gradient avatar with the user's initial. */
export function Avatar({ name, size = 32, onPress }: { name: string; size?: number; onPress?: () => void }) {
  const theme = useAppTheme();
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={name}
      disabled={!onPress}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: theme.avatarGradient[0],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText variant="badge" color="#ffffff" style={{ fontSize: size * 0.42 }}>
        {initial}
      </AppText>
    </Pressable>
  );
}

/** Status line under the composer (`Thinking…`, `Listening…`). */
export function StatusLine({ text }: { text: string | null }) {
  const theme = useAppTheme();
  const { isRtl } = useT();
  if (!text) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: isRtl ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: space(2),
        paddingTop: space(2),
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.mode === 'dark' ? '#7ca89b' : '#5b8f7a',
        }}
      />
      <AppText variant="status" color={theme.mode === 'dark' ? '#7ca89b' : '#5b8f7a'}>
        {text}
      </AppText>
    </View>
  );
}
