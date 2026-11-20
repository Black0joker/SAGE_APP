import { create } from 'zustand';

import type { ToolCall, Turn, TurnOutcome } from '@/api/types';

/**
 * The live view of the conversation.
 *
 * Bubbles exist here before the server knows about them: a send renders the user
 * bubble and an assistant stub optimistically, then `saved` attaches the real
 * turn ids. That is why the app does not refetch the thread after every reply
 * (API.md §3.2).
 */
export type Bubble = {
  /** Stable local id; the server id arrives later in `serverId`. */
  id: string;
  serverId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  outcome: TurnOutcome | null;
  toolCalls: ToolCall[] | null;
  /** Rendered as the error bubble. */
  isError: boolean;
  /** Optimistic and not yet persisted. */
  pending: boolean;
};

export type ChatStreamState = {
  conversationId: string | null;
  bubbles: Bubble[];
  streaming: boolean;
  streamId: string | null;
  /** One transient line under the assistant bubble (tool names only). */
  toolLine: string | null;
  statusText: string | null;
  /** The most recent failed send, offered back to the composer. */
  lastFailedText: string | null;

  setThread: (conversationId: string | null, bubbles: Bubble[]) => void;
  setConversationId: (id: string | null) => void;
  pushBubble: (bubble: Bubble) => void;
  updateBubble: (id: string, patch: Partial<Bubble>) => void;
  appendToBubble: (id: string, text: string) => void;
  removeBubbles: (ids: string[]) => void;
  setStreaming: (streaming: boolean) => void;
  setStreamId: (id: string | null) => void;
  setToolLine: (line: string | null) => void;
  setStatusText: (text: string | null) => void;
  setLastFailedText: (text: string | null) => void;
  reset: () => void;
};

let localCounter = 0;
export function nextLocalId(prefix = 'local'): string {
  localCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localCounter}`;
}

/** Maps a stored turn to the bubble shape the thread renders. */
export function bubbleFromTurn(turn: Turn): Bubble {
  return {
    id: turn.id,
    serverId: turn.id,
    role: turn.role,
    content: turn.content,
    createdAt: turn.created_at,
    outcome: turn.outcome,
    toolCalls: turn.tool_calls,
    isError: turn.outcome === 'error',
    pending: false,
  };
}

const initialState = {
  conversationId: null as string | null,
  bubbles: [] as Bubble[],
  streaming: false,
  streamId: null as string | null,
  toolLine: null as string | null,
  statusText: null as string | null,
  lastFailedText: null as string | null,
};

export const useChatStream = create<ChatStreamState>((set) => ({
  ...initialState,

  setThread: (conversationId, bubbles) => set({ conversationId, bubbles }),

  setConversationId: (conversationId) => set({ conversationId }),

  pushBubble: (bubble) => set((state) => ({ bubbles: [...state.bubbles, bubble] })),

  updateBubble: (id, patch) =>
    set((state) => ({
      bubbles: state.bubbles.map((bubble) =>
        bubble.id === id || bubble.serverId === id ? { ...bubble, ...patch } : bubble,
      ),
    })),

  appendToBubble: (id, text) =>
    set((state) => ({
      bubbles: state.bubbles.map((bubble) =>
        bubble.id === id || bubble.serverId === id
          ? { ...bubble, content: bubble.content + text }
          : bubble,
      ),
    })),

  removeBubbles: (ids) =>
    set((state) => ({
      bubbles: state.bubbles.filter(
        (bubble) => !ids.includes(bubble.id) && !(bubble.serverId && ids.includes(bubble.serverId)),
      ),
    })),

  setStreaming: (streaming) => set({ streaming }),

  setStreamId: (streamId) => set({ streamId }),

  setToolLine: (toolLine) => set({ toolLine }),

  setStatusText: (statusText) => set({ statusText }),

  setLastFailedText: (lastFailedText) => set({ lastFailedText }),

  reset: () => set({ ...initialState }),
}));

/** Additive merge for tool metadata collected during a stream. */
export function mergeToolCall(existing: ToolCall[] | null, call: ToolCall): ToolCall[] {
  const list = existing ? [...existing] : [];
  const index = list.findIndex((entry) => entry.name === call.name);
  if (index === -1) {
    list.push(call);
  } else {
    list[index] = { ...list[index], ...call };
  }
  return list;
}
