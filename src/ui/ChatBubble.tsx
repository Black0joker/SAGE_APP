import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { radius, space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatTime } from '@/lib/time';
import { USE_NATIVE_DRIVER } from './anim';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Button } from './Button';

/** Three bouncing dots while a reply is pending (DESIGN §4.7). */
export function TypingDots() {
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const [values] = useState(() => [new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]);

  useEffect(() => {
    if (reduced) {
      values.forEach((value) => value.setValue(0.6));
      return;
    }
    const animations = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(value, {
            toValue: 1,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.delay((2 - index) * 160),
        ]),
      ),
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [reduced, values]);

  return (
    <View style={{ flexDirection: 'row', gap: space(1), alignItems: 'center', height: 18 }}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.textMuted,
            opacity: value,
          }}
        />
      ))}
    </View>
  );
}

/** Blinking caret appended to a streaming answer. */
export function StreamingCaret() {
  const theme = useAppTheme();
  const reduced = useReducedMotion();
  const { isRtl } = useT();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduced) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: 2,
        height: 15,
        // Explicit side rather than `marginStart`, which follows the native RTL
        // flag we no longer set.
        ...(isRtl ? { marginRight: 2 } : { marginLeft: 2 }),
        backgroundColor: theme.bubbleAssistantText,
        opacity,
      }}
    />
  );
}

export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  isError?: boolean;
  pending?: boolean;
  streaming?: boolean;
  /** Transient tool activity line, shown under the assistant bubble. */
  toolLine?: string | null;
  onDelete?: () => void;
  /** Whether the delete affordance is available (no server id yet = no). */
  canDelete?: boolean;
};

export function ChatBubble({
  role,
  content,
  createdAt,
  isError,
  pending,
  streaming,
  toolLine,
  onDelete,
  canDelete,
}: ChatBubbleProps) {
  const theme = useAppTheme();
  const { t, isRtl, locale } = useT();

  const isUser = role === 'user';
  const bg = isError
    ? theme.bubbleError
    : isUser
      ? theme.bubbleUser
      : theme.bubbleAssistant;
  const fg = isError
    ? theme.bubbleErrorText
    : isUser
      ? theme.bubbleUserText
      : theme.bubbleAssistantText;

  const showTyping = pending && !content && !isError;

  return (
    <View
      style={{
        flexDirection: isRtl ? 'row-reverse' : 'row',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: space(3),
        maxWidth: '100%',
      }}
    >
      {!isUser ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.pill,
            backgroundColor: theme.avatarGradient[0],
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <Icon name="spa" size={16} color="#b9ede0" />
        </View>
      ) : null}

      <View style={{ maxWidth: '85%', gap: space(1) }}>
        <View
          style={{
            backgroundColor: bg,
            borderRadius: radius.bubble,
            // The squared corner sits on the sender's side: the assistant's
            // bottom-start, the user's bottom-end. Written as explicit
            // left/right radii because the logical `borderBottom*Radius` props
            // follow the native RTL flag, which we no longer set.
            //
            // squaredLeft = (assistant && LTR) || (user && RTL) = (isUser === isRtl)
            borderBottomLeftRadius: isUser === isRtl ? 4 : radius.bubble,
            borderBottomRightRadius: isUser === isRtl ? radius.bubble : 4,
            paddingHorizontal: space(3.5),
            paddingVertical: space(3),
          }}
        >
          {showTyping ? (
            <TypingDots />
          ) : (
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              <AppText variant="body" color={fg} style={{ flexShrink: 1 }}>
                {content}
              </AppText>
              {streaming ? <StreamingCaret /> : null}
            </View>
          )}
        </View>

        {toolLine ? (
          <AppText variant="meta" color={theme.textMeta}>
            {toolLine}
          </AppText>
        ) : null}

        <View
          style={{
            flexDirection: isRtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: space(2),
            justifyContent: isUser ? 'flex-end' : 'flex-start',
          }}
        >
          <AppText variant="meta" color={theme.textMeta}>
            {formatTime(createdAt, locale)}
          </AppText>
          {canDelete && onDelete ? (
            <Button
              variant="text"
              label={t('deleteReply')}
              icon="delete-outline"
              onPress={onDelete}
              accessibilityHint={t('deleteOne')}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
