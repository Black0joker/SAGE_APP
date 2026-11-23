import { View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { AppText } from './AppText';

/**
 * Determinate progress for work that reports its own counts — currently only PDF
 * indexing (DESIGN §4.12).
 *
 * `percent === null` means the server has not counted the work yet (`total: 0`),
 * so the bar shows an indeterminate track instead of inventing a percentage.
 */
export function ProgressBar({
  label,
  percent,
  detail,
  testID,
}: {
  label: string;
  percent: number | null;
  /** e.g. `12 / 300`. Omitted when the total is unknown. */
  detail?: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  // React Native has no CSS transitions; the fill is set directly and reduced
  // motion needs no special case. The hook is deliberately not used here.
  const track = theme.navChip;
  const fill = theme.mode === 'dark' ? theme.chipText : '#143f36';

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        percent === null ? { text: label } : { now: percent, min: 0, max: 100 }
      }
      style={{ gap: space(1.5) }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <AppText variant="hint" color={theme.textMuted} style={{ flex: 1 }}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="meta" color={theme.textMeta}>
            {detail}
          </AppText>
        ) : null}
      </View>

      <View
        style={{
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: track,
          overflow: 'hidden',
        }}
      >
        {percent === null ? (
          // Indeterminate: a muted full track, no fake movement.
          <View style={{ flex: 1, backgroundColor: theme.border }} />
        ) : (
          <View
            style={{
              width: `${percent}%`,
              height: '100%',
              backgroundColor: fill,
              borderRadius: radius.pill,
            }}
          />
        )}
      </View>
    </View>
  );
}
