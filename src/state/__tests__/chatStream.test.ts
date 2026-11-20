import type { Turn } from '@/api/types';
import { bubbleFromTurn, mergeToolCall, nextLocalId, useChatStream } from '../chatStream';

function turn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 't1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'Hello!',
    created_at: '2026-11-20T09:00:02Z',
    finish_reason: 'stop',
    model: 'deepseek-v4.1-flash:free',
    strategy_id: null,
    latency_ms: 812.4,
    outcome: 'ok',
    tool_calls: [{ name: 'recall_memory', ok: true }],
    ...overrides,
  };
}

beforeEach(() => {
  useChatStream.getState().reset();
});

describe('bubbleFromTurn', () => {
  it('maps a stored turn to a bubble with a server id', () => {
    const bubble = bubbleFromTurn(turn());
    expect(bubble).toMatchObject({
      id: 't1',
      serverId: 't1',
      role: 'assistant',
      content: 'Hello!',
      pending: false,
      isError: false,
    });
  });

  it('marks an errored turn as an error bubble', () => {
    expect(bubbleFromTurn(turn({ outcome: 'error' })).isError).toBe(true);
  });

  it('keeps tool names and ok flags only', () => {
    expect(bubbleFromTurn(turn()).toolCalls).toEqual([{ name: 'recall_memory', ok: true }]);
  });
});

describe('nextLocalId', () => {
  it('produces unique ids', () => {
    const ids = new Set([nextLocalId(), nextLocalId(), nextLocalId()]);
    expect(ids.size).toBe(3);
  });
});

describe('mergeToolCall', () => {
  it('appends a new tool', () => {
    expect(mergeToolCall(null, { name: 'recall_memory', ok: null })).toEqual([
      { name: 'recall_memory', ok: null },
    ]);
  });

  it('updates an existing tool rather than duplicating it', () => {
    const merged = mergeToolCall([{ name: 'recall_memory', ok: null }], {
      name: 'recall_memory',
      ok: true,
    });
    expect(merged).toEqual([{ name: 'recall_memory', ok: true }]);
  });
});

describe('chat stream store', () => {
  it('adopts server ids on `saved` without refetching', () => {
    const store = useChatStream.getState();
    store.pushBubble({
      id: 'local-1',
      serverId: null,
      role: 'user',
      content: 'hi',
      createdAt: '2026-11-20T09:00:01Z',
      outcome: null,
      toolCalls: null,
      isError: false,
      pending: true,
    });

    useChatStream.getState().updateBubble('local-1', { serverId: 'u1', pending: false });

    const bubble = useChatStream.getState().bubbles[0];
    expect(bubble?.serverId).toBe('u1');
    expect(bubble?.pending).toBe(false);
    expect(useChatStream.getState().bubbles).toHaveLength(1);
  });

  it('rolls back both bubbles on a stop', () => {
    const store = useChatStream.getState();
    for (const id of ['u-local', 'a-local']) {
      store.pushBubble({
        id,
        serverId: null,
        role: id.startsWith('u') ? 'user' : 'assistant',
        content: '',
        createdAt: '2026-11-20T09:00:00Z',
        outcome: null,
        toolCalls: null,
        isError: false,
        pending: true,
      });
    }

    useChatStream.getState().removeBubbles(['u-local', 'a-local']);

    expect(useChatStream.getState().bubbles).toHaveLength(0);
  });

  it('appends deltas to the right bubble', () => {
    const store = useChatStream.getState();
    store.pushBubble({
      id: 'a1',
      serverId: null,
      role: 'assistant',
      content: 'You ',
      createdAt: '2026-11-20T09:00:00Z',
      outcome: null,
      toolCalls: null,
      isError: false,
      pending: true,
    });

    useChatStream.getState().appendToBubble('a1', 'have a dentist appointment.');

    expect(useChatStream.getState().bubbles[0]?.content).toBe('You have a dentist appointment.');
  });

  it('clears everything on reset (used by sign-out)', () => {
    const store = useChatStream.getState();
    store.setThread('c1', [bubbleFromTurn(turn())]);
    store.setStreaming(true);
    store.setToolLine('Memory saved');

    useChatStream.getState().reset();

    const state = useChatStream.getState();
    expect(state.bubbles).toHaveLength(0);
    expect(state.conversationId).toBeNull();
    expect(state.streaming).toBe(false);
    expect(state.toolLine).toBeNull();
  });
});
