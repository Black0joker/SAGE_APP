import { useCallback, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n/useT';
import { opacity, radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { Icon } from './Icon';

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 144;

type ComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onClear?: () => void;
  streaming?: boolean;
  showClear?: boolean;
  disabled?: boolean;
  placeholder: string;
};

/**
 * The sticky composer (DESIGN §4.8).
 *
 * The textarea grows from one row to 144px, Enter sends and Shift+Enter inserts a
 * newline on web, and the stop button only exists while a generation is running.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  onClear,
  streaming,
  showClear,
  disabled,
  placeholder,
}: ComposerProps) {
  const theme = useAppTheme();
  const { t, isRtl } = useT();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(MIN_HEIGHT);

  const canSend = value.trim().length > 0 && !disabled;

  const handleContentSize = useCallback((event: unknown) => {
    const native = (event as { nativeEvent?: { contentSize?: { height?: number } } }).nativeEvent;
    const measured = native?.contentSize?.height ?? MIN_HEIGHT;
    setHeight(Math.min(Math.max(measured, MIN_HEIGHT), MAX_HEIGHT));
  }, []);

  const containerBg =
    theme.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(250,249,245,0.9)';

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.cardBorder,
        backgroundColor: theme.surface,
        paddingHorizontal: space(4),
        paddingTop: space(3),
        // Keep clear of the home indicator.
        paddingBottom: space(3) + insets.bottom,
      }}
    >
      <View
        style={{
          flexDirection: isRtl ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          gap: space(2),
          backgroundColor: containerBg,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? (theme.mode === 'dark' ? '#5b8f7a' : '#5b8f7a') : theme.border,
          borderRadius: radius.bubble,
          paddingHorizontal: space(2.5),
          paddingVertical: space(2.5),
        }}
      >
        {showClear && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('clear')}
            onPress={onClear}
            hitSlop={6}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(1),
              paddingHorizontal: space(2),
              minHeight: 36,
            }}
          >
            <Icon name="delete-sweep" size={18} color={theme.textMeta} />
          </Pressable>
        ) : null}

        <TextInput
          accessibilityLabel={placeholder}
          value={value}
          onChangeText={onChangeText}
          multiline
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          selectionColor={theme.focus}
          // Native: Enter submits, Shift+Enter inserts a newline.
          submitBehavior="submit"
          onSubmitEditing={() => {
            if (canSend) onSend();
          }}
          // Web: react-native-web renders a <textarea>, where onSubmitEditing
          // never fires and Enter would only insert a newline. Handle it here.
          onKeyPress={(event) => {
            if (Platform.OS !== 'web') return;
            const native = event.nativeEvent as unknown as {
              key?: string;
              shiftKey?: boolean;
              preventDefault?: () => void;
            };
            if (native.key !== 'Enter' || native.shiftKey) return;
            native.preventDefault?.();
            if (canSend) onSend();
          }}
          onContentSizeChange={handleContentSize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            height,
            maxHeight: MAX_HEIGHT,
            color: theme.text,
            fontSize: 16,
            lineHeight: isRtl ? 26 : 22,
            paddingTop: space(1.5),
            paddingBottom: space(1.5),
            textAlign: isRtl ? 'right' : 'left',
            textAlignVertical: 'top',
          }}
        />

        {streaming && onStop ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('stop')}
            onPress={onStop}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.navChip,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Icon name="stop" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('send')}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.mode === 'dark' ? '#1c4f45' : '#0f3d33',
            opacity: canSend ? 1 : opacity.disabledPrimary,
          }}
        >
          <Icon name="arrow-upward" size={18} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
