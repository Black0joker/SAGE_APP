import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, View, type ListRenderItemInfo } from 'react-native';

import { useChatController } from '@/hooks/useChatController';
import { useLocationPing } from '@/hooks/useLocationPing';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTodayAppointments } from '@/hooks/useThread';
import { useT } from '@/i18n/useT';
import { confirmDestructive } from '@/lib/confirm';
import { isPast } from '@/lib/time';
import type { Bubble } from '@/state/chatStream';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppointmentBand, PlaceBand } from '@/ui/Banners';
import { Button } from '@/ui/Button';
import { ChatBubble } from '@/ui/ChatBubble';
import { Composer } from '@/ui/Composer';
import { StatusLine } from '@/ui/Pill';

/**
 * `/chat` — the home screen (DESIGN §5.4).
 *
 * Layer order: app bar → today's appointment → familiar place → thread → composer
 * → status line. Only the thread scrolls.
 */
export default function ChatScreen() {
  const { t, isRtl } = useT();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const session = useSession();

  const {
    bubbles,
    streaming,
    toolLine,
    loading,
    loadError,
    restoredText,
    consumeRestoredText,
    send,
    stop,
    deleteBubble,
    clearAll,
  } = useChatController();

  const { context } = useLocationPing(true);
  const today = useTodayAppointments();

  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const listRef = useRef<FlatList<Bubble>>(null);

  /**
   * A stopped turn puts its text back in the composer (DESIGN §5.4).
   *
   * `draftOverride` is `null` until the user actually types, which is what lets
   * `restoredText` show through. After a send it must go back to `null`, not to
   * `''`, or the empty override would mask the restored text.
   */
  const draft = draftOverride ?? restoredText ?? '';

  const handleChangeText = useCallback(
    (text: string) => {
      setDraftOverride(text);
      if (restoredText) consumeRestoredText();
    },
    [consumeRestoredText, restoredText],
  );

  const nextAppointment = useMemo(() => {
    const list = today.data?.appointments ?? [];
    return list.find((appointment) => !isPast(appointment.starts_at)) ?? null;
  }, [today.data]);

  const firstName = session.user?.first_name ?? session.user?.full_name ?? '';

  const handleSend = useCallback(() => {
    const text = draft;
    // `null` rather than `''`, so a later restore can show through.
    setDraftOverride(null);
    consumeRestoredText();
    send(text);
  }, [consumeRestoredText, draft, send]);

  const handleStop = useCallback(() => stop(), [stop]);

  const handleClear = useCallback(() => {
    confirmDestructive({
      title: t('confirmClearTitle'),
      message: t('confirmClearMessage'),
      confirmLabel: t('clear'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void clearAll();
      },
    });
  }, [clearAll, t]);

  const handleDelete = useCallback(
    (bubble: Bubble) => {
      confirmDestructive({
        title: t('confirmDeleteTitle'),
        message: t('confirmDeleteMessage'),
        confirmLabel: t('deleteReply'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void deleteBubble(bubble).catch(() => {
            // Surfaces as a failed delete only; the thread stays as-is.
          });
        },
      });
    },
    [deleteBubble, t],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Bubble>) => (
      <ChatBubble
        role={item.role}
        content={item.content}
        createdAt={item.createdAt}
        isError={item.isError}
        pending={item.pending}
        streaming={streaming && item.role === 'assistant' && item === bubbles[bubbles.length - 1]}
        toolLine={item === bubbles[bubbles.length - 1] ? toolLine : null}
        canDelete={Boolean(item.serverId) && !streaming}
        onDelete={() => handleDelete(item)}
      />
    ),
    [bubbles, handleDelete, streaming, toolLine],
  );

  return (
    <AppShell
      badge={t('badgeChat')}
      footer={
        <Composer
          value={draft}
          onChangeText={handleChangeText}
          onSend={handleSend}
          onStop={handleStop}
          onClear={handleClear}
          streaming={streaming}
          showClear={bubbles.length > 0}
          placeholder={t('placeholder')}
        />
      }
    >
      <View style={{ flex: 1 }}>
        {loadError ? (
          <View style={{ padding: space(4) }}>
            <InlineAlert tone="error" message={loadError} />
          </View>
        ) : null}

        {nextAppointment ? <AppointmentBand appointment={nextAppointment} /> : null}
        {context?.place ? <PlaceBand context={context} /> : null}

        <FlatList
          ref={listRef}
          data={bubbles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          // The thread is the only scroll region. Note: the scroll *indicator*
          // follows the native RTL flag, which we no longer force, so on native
          // it stays on the right in Arabic. Everything inside mirrors correctly;
          // this is the one cosmetic cost of instant language switching.
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space(6), gap: space(6) }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => {
            listRef.current?.scrollToEnd({ animated: !reducedMotion });
          }}
          ListEmptyComponent={
            loading ? (
              <EmptyState message={t('loading')} />
            ) : (
              <View style={{ gap: space(5), alignItems: 'flex-start' }}>
                <ChatBubble
                  role="assistant"
                  content={t('welcomeNamed', { name: firstName || '' }).trim()}
                  createdAt={new Date().toISOString()}
                />
                <View style={isRtl ? { marginRight: space(11) } : { marginLeft: space(11) }}>
                  <Button
                    variant="secondary"
                    label={t('callNow')}
                    icon="call"
                    onPress={() => router.push('/call')}
                  />
                </View>
              </View>
            )
          }
        />

        <View style={{ paddingHorizontal: space(6), paddingBottom: space(1) }}>
          <StatusLine text={streaming ? t('thinking') : null} />
        </View>
      </View>
    </AppShell>
  );
}
