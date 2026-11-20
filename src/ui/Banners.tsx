import { View } from 'react-native';

import type { Appointment, LocationContext } from '@/api/types';
import { useT } from '@/i18n/useT';
import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { formatTime } from '@/lib/time';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/**
 * Full-width status band under the header (DESIGN §4.3).
 *
 * Copy rule from the docs: an unfamiliar place produces an empty band — the app
 * never hints that the user is lost or in danger.
 */
function Band({
  icon,
  lines,
}: {
  icon: IconName;
  lines: { label: string; value: string }[];
}) {
  const theme = useAppTheme();
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        paddingHorizontal: space(4),
        paddingVertical: space(2.5),
        backgroundColor: theme.successBg,
        borderBottomWidth: 1,
        borderBottomColor: theme.successBorder,
      }}
    >
      <Icon name={icon} size={18} color={theme.successText} />
      <View style={{ flex: 1, gap: space(0.5) }}>
        {lines.map((line) => (
          <AppText key={line.label} variant="meta" color={theme.successText}>
            {line.label} · {line.value}
          </AppText>
        ))}
      </View>
    </View>
  );
}

export function AppointmentBand({ appointment }: { appointment: Appointment }) {
  const { t, locale } = useT();
  return (
    <Band
      icon="event"
      lines={[
        { label: t('appointmentBanner'), value: appointment.title },
        ...(appointment.starts_at
          ? [{ label: t('locAt'), value: formatTime(appointment.starts_at, locale) }]
          : []),
      ]}
    />
  );
}

export function PlaceBand({ context }: { context: LocationContext }) {
  const { t, locale } = useT();

  const lines: { label: string; value: string }[] = [
    { label: context.place.name, value: '' },
  ];

  if (context.appointment) {
    lines.push({
      label: t('locNext'),
      value: `${context.appointment.title} · ${formatTime(context.appointment.starts_at, locale)}`,
    });
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        paddingHorizontal: space(4),
        paddingVertical: space(2.5),
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space(3),
          backgroundColor: 'transparent',
        }}
      >
        <Icon name="place" size={18} color="#5b8f7a" />
        <AppText variant="hint" color="#5b8f7a" style={{ flex: 1 }}>
          {context.place.name}
          {context.appointment ? ` · ${t('locNext')} ${formatTime(context.appointment.starts_at, locale)}` : ''}
        </AppText>
      </View>
    </View>
  );
}

/** Small pill shown on the memory screen when location is switched off. */
export function InfoBand({ message, tone = 'warning' }: { message: string; tone?: 'warning' | 'info' }) {
  const theme = useAppTheme();
  const background = tone === 'warning' ? theme.warningBg : theme.successBg;
  const text = tone === 'warning' ? theme.warningText : theme.successText;
  const border = tone === 'warning' ? theme.warningBorder : theme.successBorder;

  return (
    <View
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(2),
        backgroundColor: background,
        borderWidth: 1,
        borderColor: border,
        borderRadius: radius.input,
        paddingHorizontal: space(3),
        paddingVertical: space(2.5),
      }}
    >
      <Icon name={tone === 'warning' ? 'warning-amber' : 'info-outline'} size={18} color={text} />
      <AppText variant="hint" color={text} style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}
