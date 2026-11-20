import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { conversations } from '@/api/endpoints';
import { keys } from '@/api/queryKeys';
import { openChatStream, stopChatStream, type StreamController } from '@/api/stream';
import type { ChatRequest, StreamEvent } from '@/api/types';
import { usePrefs } from '@/state/prefs';
import {
  bubbleFromTurn,
  mergeToolCall,
  nextLocalId,
  useChatStream,
  type Bubble,
} from '@/state/chatStream';
import { useT } from '@/i18n/useT';
import { useCurrentThread } from './useThread';

/**
 * Maps a tool event to the one transient line the thread shows. Only names and
 * status are ever surfaced — never arguments or results (API.md §3.2, §12).
 */
function toolLineFor(
  name: string,
  status: 'start' | 'end',
  ok: boolean | undefined,
  t: ReturnType<typeof useT>['t'],
): string {
  const lower = name.toLowerCase();
  const isMemory =
    lower.includes('memory') || lower.includes('recall') || lower.includes('fact') || lower.includes('entity');
  const isSave = lower.includes('save') || lower.includes('store') || lower.includes('write') || lower.includes('remember');
  const isAccount = lower.includes('account') || lower.includes('profile') || lower.includes('user');

  if (status === 'start') {
    if (isAccount) return t('toolAccount');
    if (isMemory && isSave) return t('toolSaving');
    if (isMemory) return t('toolSearching');
    return t('toolGeneric');
  }

  if (ok === false) return t('toolFailed');
  if (isAccount) return t('toolAccountDone');
  if (isMemory && isSave) return t('toolSaved');
  if (isMemory) return t('toolFound');
  return t('toolGeneric');
}

export type ChatController = {
  bubbles: Bubble[];
  conversationId: string | null;
  streaming: boolean;
  toolLine: string | null;
  loading: boolean;
  loadError: string | null;
  restoredText: string | null;
  consumeRestoredText: () => void;
  send: (text: string) => void;
  stop: () => void;
  deleteBubble: (bubble: Bubble) => Promise<void>;
  clearAll: () => Promise<void>;
};

export function useChatController(): ChatController {
  const queryClient = useQueryClient();
  const { t } = useT();
  const language = usePrefs((state) => state.language);
  const thread = useCurrentThread();

  const bubbles = useChatStream((state) => state.bubbles);
  const conversationId = useChatStream((state) => state.conversationId);
  const streaming = useChatStream((state) => state.streaming);
  const toolLine = useChatStream((state) => state.toolLine);
  const restoredText = useChatStream((state) => state.lastFailedText);

  const controllerRef = useRef<StreamController | null>(null);
  const toolTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the thread from the server, but never clobber a live generation.
  useEffect(() => {
    const data = thread.data;
    if (!data) return;
    const state = useChatStream.getState();
    if (state.streaming) return;
    state.setThread(
      data.conversation.id,
      data.turns.map(bubbleFromTurn),
    );
  }, [thread.data]);

  const clearToolTimer = useCallback(() => {
    if (toolTimerRef.current) {
      clearTimeout(toolTimerRef.current);
      toolTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearToolTimer(), [clearToolTimer]);

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      const store = useChatStream.getState();
      if (store.streaming) return;

      const userId = nextLocalId('user');
      const assistantId = nextLocalId('assistant');
      const now = new Date().toISOString();

      store.setLastFailedText(null);
      store.setToolLine(null);
      store.setStreaming(true);
      store.pushBubble({
        id: userId,
        serverId: null,
        role: 'user',
        content: text,
        createdAt: now,
        outcome: null,
        toolCalls: null,
        isError: false,
        pending: true,
      });
      store.pushBubble({
        id: assistantId,
        serverId: null,
        role: 'assistant',
        content: '',
        createdAt: now,
        outcome: null,
        toolCalls: null,
        isError: false,
        pending: true,
      });

      let sawSaved = false;
      let sawStopped = false;
      let sawError = false;

      const body: ChatRequest = {
        conversation_id: store.conversationId ?? undefined,
        message: text,
        language,
      };

      const handleEvent = (event: StreamEvent) => {
        const current = useChatStream.getState();

        if ('delta' in event) {
          // Answer text started: the tool line has served its purpose.
          clearToolTimer();
          current.setToolLine(null);
          current.updateBubble(assistantId, { pending: false });
          current.appendToBubble(assistantId, event.delta);
          return;
        }

        if ('reasoning' in event) {
          // Modelled separately; not shown in the thread by default.
          return;
        }

        if ('tool' in event) {
          const { name, status, ok } = event.tool;
          const line = toolLineFor(name, status, ok, t);
          current.setToolLine(line);
          current.updateBubble(assistantId, (() => {
            const bubble = useChatStream
              .getState()
              .bubbles.find((entry) => entry.id === assistantId);
            return {
              toolCalls: mergeToolCall(bubble?.toolCalls ?? null, { name, ok: ok ?? null }),
            };
          })());

          clearToolTimer();
          if (status === 'end') {
            // Expire the line 1.4 s after a tool finishes.
            toolTimerRef.current = setTimeout(() => {
              useChatStream.getState().setToolLine(null);
            }, 1400);
          }
          return;
        }

        if ('saved' in event) {
          sawSaved = true;
          current.setConversationId(event.saved.conversation_id);
          current.updateBubble(userId, { serverId: event.saved.user_turn_id, pending: false });
          current.updateBubble(assistantId, {
            serverId: event.saved.assistant_turn_id,
            pending: false,
          });
          return;
        }

        if ('stopped' in event) {
          sawStopped = true;
          // The server deleted the user turn and its reply: roll both back.
          current.removeBubbles([userId, assistantId]);
          current.setLastFailedText(text);
          return;
        }

        if ('error' in event) {
          sawError = true;
          current.updateBubble(assistantId, {
            isError: true,
            pending: false,
            content: event.error.message,
          });
          return;
        }

        if ('done' in event) {
          current.updateBubble(assistantId, { pending: false });
          return;
        }
      };

      const controller = openChatStream(body, {
        onEvent: handleEvent,
        onOpen: ({ streamId }) => {
          useChatStream.getState().setStreamId(streamId);
        },
        onError: (error) => {
          sawError = true;
          const current = useChatStream.getState();
          current.updateBubble(assistantId, {
            isError: true,
            pending: false,
            content: current.bubbles.find((b) => b.id === assistantId)?.content
              ? `${current.bubbles.find((b) => b.id === assistantId)?.content}\n\n${error.message}`
              : error.message,
          });
        },
        onClose: () => {
          const current = useChatStream.getState();
          clearToolTimer();
          current.setToolLine(null);
          current.setStreaming(false);
          current.setStreamId(null);
          controllerRef.current = null;

          // A dropped connection is not a rollback: the server kept the user turn
          // and the partial reply. Only refetch when we never learned the ids.
          if (!sawSaved && !sawStopped) {
            const assistantBubble = current.bubbles.find((bubble) => bubble.id === assistantId);
            if (!assistantBubble?.serverId && !sawError) {
              void queryClient.invalidateQueries({ queryKey: keys.currentThread });
            }
          }
        },
      });

      controllerRef.current = controller;
    },
    [clearToolTimer, language, queryClient, t],
  );

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const streamId = controller.getStreamId();

    // Stop on the server FIRST, then abort locally. A stopped turn is deleted
    // server-side, which is what makes the rollback honest.
    const abortLocal = () => {
      controller.abort();
      controllerRef.current = null;
    };

    if (!streamId) {
      abortLocal();
      return;
    }

    void stopChatStream(streamId).finally(abortLocal);
  }, []);

  const deleteBubble = useCallback(
    async (bubble: Bubble) => {
      const state = useChatStream.getState();
      const conversation = state.conversationId;
      const turnId = bubble.serverId;
      if (!conversation || !turnId) return;

      await conversations.deleteTurn(conversation, turnId);

      // Deleting a user turn also removes the assistant reply that followed it,
      // so drop the pair locally to match the server.
      const ids = [turnId];
      if (bubble.role === 'user') {
        const index = state.bubbles.findIndex((entry) => entry.id === bubble.id);
        const next = state.bubbles[index + 1];
        if (next && next.role === 'assistant') {
          ids.push(next.serverId ?? next.id);
        }
      }
      useChatStream.getState().removeBubbles(ids);
    },
    [],
  );

  const clearAll = useCallback(async () => {
    await conversations.clearAll();
    useChatStream.getState().reset();
    await queryClient.invalidateQueries({ queryKey: keys.currentThread });
  }, [queryClient]);

  const consumeRestoredText = useCallback(() => {
    useChatStream.getState().setLastFailedText(null);
  }, []);

  return {
    bubbles,
    conversationId,
    streaming,
    toolLine,
    loading: thread.isLoading,
    loadError: thread.isError ? t('loadFailed') : null,
    restoredText,
    consumeRestoredText,
    send,
    stop,
    deleteBubble,
    clearAll,
  };
}
