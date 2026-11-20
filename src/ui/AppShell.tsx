import { useRouter, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n/useT';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { SHELL_MAX_WIDTH, radius, space } from '@/theme/tokens';
import { useAppTheme, useIsDark } from '@/theme/useAppTheme';
import { AppText } from './AppText';
import { IconButton } from './Button';
import { Avatar, Chip } from './Pill';
import { Icon, type IconName } from './Icon';

/**
 * The app shell (DESIGN §3.1–3.3): a centred 880px column with a sticky top bar
 * and an optional sticky footer.
 */

const NAV: { key: string; href: string; label: string; icon: IconName }[] = [
  { key: 'trusted', href: '/trusted', label: 'navTrusted', icon: 'verified-user' },
  { key: 'schedule', href: '/schedule', label: 'navSchedule', icon: 'event' },
  { key: 'memory', href: '/memory', label: 'navMemory', icon: 'psychology' },
  { key: 'call', href: '/call', label: 'navCall', icon: 'call' },
];

export function AppShell({
  children,
  footer,
  badge,
  showBack = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  badge?: string;
  showBack?: boolean;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: SHELL_MAX_WIDTH,
          alignSelf: 'center',
          backgroundColor: theme.surface,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: theme.cardBorder,
        }}
      >
        <AppBar badge={badge} showBack={showBack} topInset={insets.top} />
        <View style={{ flex: 1 }}>{children}</View>
        {footer}
      </View>
    </View>
  );
}

export function AppBar({
  badge,
  showBack = false,
  topInset = 0,
}: {
  badge?: string;
  showBack?: boolean;
  topInset?: number;
}) {
  const theme = useAppTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const pathname = usePathname();
  const { t, isRtl } = useT();
  const { width } = useWindowDimensions();
  const session = useSession();
  const setTheme = usePrefs((state) => state.setTheme);
  const language = usePrefs((state) => state.language);
  const setLanguage = usePrefs((state) => state.setLanguage);

  const compact = width < 1024;
  const narrow = width < 640;

  const greetingName = session.user?.first_name ?? session.user?.full_name ?? '';

  return (
    <View
      style={{
        paddingTop: topInset,
        backgroundColor: theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.cardBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space(3),
          paddingHorizontal: space(4),
          minHeight: 56,
        }}
      >
        {showBack ? (
          <IconButton
            name="arrow-back"
            size={32}
            accessibilityLabel={t('back')}
            onPress={() => {
              // A screen opened directly (deep link, web refresh) has no history
              // to pop, so fall back to the home screen instead of no-oping.
              if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
          />
        ) : null}

        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: '#0f3d33',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="spa" size={18} color="#b9ede0" />
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('appName')}
          onPress={() => router.replace('/')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}
        >
          <AppText variant="wordmark" color={theme.text}>
            {t('appName')}
          </AppText>
        </Pressable>

        {badge && !narrow ? (
          <Chip label={badge} style={isRtl ? { marginRight: space(1) } : { marginLeft: space(1) }} />
        ) : null}

        <View style={{ flex: 1 }} />

        {!narrow && greetingName ? (
          <AppText variant="meta" color={theme.textMuted} numberOfLines={1} style={{ maxWidth: 160 }}>
            {t('greeting')}, {greetingName}
          </AppText>
        ) : null}

        <IconButton
          name="logout"
          size={narrow ? 36 : 32}
          accessibilityLabel={t('logOut')}
          onPress={() => void session.signOut()}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('switchLanguage')}
          onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space(1), paddingHorizontal: space(1) }}
        >
          <Icon name="language" size={20} color={theme.textMuted} />
          {!narrow ? (
            <AppText variant="meta" color={theme.textMuted}>
              {language === 'ar' ? 'AR' : 'EN'}
            </AppText>
          ) : null}
        </Pressable>

        <IconButton
          name={isDark ? 'light-mode' : 'dark-mode'}
          size={32}
          accessibilityLabel={isDark ? t('switchToLight') : t('switchToDark')}
          onPress={() => {
            // 'system' resolves through the OS scheme, so the toggle always
            // switches away from whatever is currently showing.
            setTheme(isDark ? 'light' : 'dark');
          }}
        />

        <Avatar name={greetingName || '?'} onPress={() => router.push('/settings')} />
      </View>

      {compact ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1) }}>
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(item.label as never)}
                onPress={() => router.replace(item.href as never)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space(1),
                  borderRadius: 12,
                  backgroundColor: active ? theme.navChipActive : theme.navChip,
                }}
              >
                <Icon name={item.icon} size={18} color={active ? theme.chipText : theme.textMeta} />
                <AppText variant="badge" color={active ? theme.chipText : theme.textMeta} style={{ fontSize: 10 }}>
                  {t(item.label as never)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            gap: space(2),
            paddingHorizontal: space(4),
            paddingBottom: space(2),
          }}
        >
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(item.label as never)}
                onPress={() => router.replace(item.href as never)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space(1.5),
                  minHeight: 36,
                  paddingHorizontal: space(3),
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: active ? theme.chipText : theme.border,
                  backgroundColor: active ? theme.navChipActive : 'transparent',
                }}
              >
                <Icon name={item.icon} size={16} color={active ? theme.chipText : theme.textMuted} />
                <AppText variant="meta" color={active ? theme.chipText : theme.textMuted}>
                  {t(item.label as never)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
