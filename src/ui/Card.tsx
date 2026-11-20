import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { AppText } from './AppText';

/** Section card: `rounded-2xl`, 1px border, 20/24px padding (DESIGN §3.3). */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: theme.cardBorder,
          padding: space(5),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionCard({
  title,
  hint,
  actions,
  children,
  style,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const theme = useAppTheme();
  return (
    <Card style={style}>
      <View style={{ gap: space(1) }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space(3),
          }}
        >
          <AppText variant="sectionTitle" style={{ flexShrink: 1 }}>
            {title}
          </AppText>
          {actions ? <View style={{ flexDirection: 'row', gap: space(2) }}>{actions}</View> : null}
        </View>
        {hint ? (
          <AppText variant="hint" color={theme.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>

      <View style={{ marginTop: space(4), gap: space(3) }}>{children}</View>
    </Card>
  );
}

/** Rounded-xl bordered row used by every list (DESIGN §4.4). */
export function ListRow({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={{
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: theme.border,
        paddingHorizontal: space(2.5),
        paddingVertical: space(3),
        gap: space(1),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space(3) }}>
        <View style={{ flex: 1, gap: space(1) }}>
          <AppText variant="hint" style={{ fontSize: 14 }}>
            {title}
          </AppText>
          {meta ? (
            <AppText variant="meta" color={theme.textMeta}>
              {meta}
            </AppText>
          ) : null}
        </View>
        {action ? <View style={{ flexShrink: 0 }}>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}
