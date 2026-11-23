import { Linking, View } from 'react-native';

import type { Appointment, LocationContext } from '@/api/types';
import { useT } from '@/i18n/useT';
import { telUrl } from '@/lib/care';
import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { formatTime } from '@/lib/time';
import { AppText } from './AppText';
import { Button } from './Button';
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

/**
 * The crisis band (CARE.md §10.4, DESIGN §5.12).
 *
 * Rules this component enforces, because they are safety requirements rather
 * than styling choices:
 *  - it is `alert`, not `status`, so a screen reader interrupts for it;
 *  - it has **no dismiss control** and is never auto-dismissed;
 *  - it renders above every other band, so nothing can cover it;
 *  - the number is whatever the server returned — never a hard-coded hotline.
 */
export function CrisisBand({
  title,
  body,
  emergency,
  callLabel,
  careLabel,
  trustedLabel,
  onOpenCare,
  onOpenTrusted,
}: {
  title: string;
  body: string;
  emergency: string | null;
  callLabel: string;
  careLabel: string;
  trustedLabel: string;
  onOpenCare: () => void;
  onOpenTrusted: () => void;
}) {
  const theme = useAppTheme();
  const tel = telUrl(emergency);

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        gap: space(2),
        paddingHorizontal: space(4),
        paddingVertical: space(3.5),
        backgroundColor: theme.warningBg,
        borderBottomWidth: 2,
        borderBottomColor: theme.warningBorder,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <Icon name="warning-amber" size={20} color={theme.warningText} />
        <AppText variant="sectionTitle" color={theme.warningText} style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>

      <AppText variant="hint" color={theme.warningText}>
        {body}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {tel ? (
          <Button
            label={callLabel}
            icon="call"
            onPress={() => {
              // The OS dialer. `Linking.openURL` is a no-op on web, where the
              // number is still readable in the body above.
              void Linking.openURL(tel);
            }}
            testID="crisis-call"
          />
        ) : null}
        <Button variant="secondary" label={careLabel} onPress={onOpenCare} />
        <Button variant="secondary" label={trustedLabel} onPress={onOpenTrusted} />
      </View>
    </View>
  );
}

/**
 * A model's mode suggestion. Always a prompt: the mode never changes silently
 * (CARE.md §2, §10.4).
 */
export function CareSuggestionBand({
  title,
  note,
  acceptLabel,
  dismissLabel,
  onAccept,
  onDismiss,
}: {
  title: string;
  note: string;
  acceptLabel: string;
  dismissLabel: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const theme = useAppTheme();

  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        gap: space(2),
        paddingHorizontal: space(4),
        paddingVertical: space(3),
        backgroundColor: theme.successBg,
        borderBottomWidth: 1,
        borderBottomColor: theme.successBorder,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <Icon name="info-outline" size={18} color={theme.successText} />
        <AppText variant="hint" color={theme.successText} style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>
      <AppText variant="meta" color={theme.successText}>
        {note}
      </AppText>
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <Button variant="secondary" label={acceptLabel} onPress={onAccept} />
        <Button variant="text" label={dismissLabel} onPress={onDismiss} />
      </View>
    </View>
  );
}
