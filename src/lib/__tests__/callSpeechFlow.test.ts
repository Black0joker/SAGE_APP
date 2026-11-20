/**
 * End-to-end simulation of the call screen's speech flush logic.
 *
 * This mirrors `flushSpeech` in `src/app/call.tsx`: the buffer accumulates deltas,
 * and the text is handed to the speech queue only at a tool boundary or when
 * generation finishes. It exists to pin the *sequence*, not just the splitter.
 */

type FakeEvent =
  | { delta: string }
  | { tool: { name: string; status: 'start' | 'end'; ok?: boolean } }
  | { done: true }
  | { error: { code: string; message: string } };

function simulateStream(events: FakeEvent[], options: { stopped?: boolean } = {}) {
  let buffer = '';
  let flushed = 0;
  const spoken: string[] = [];
  let finished = false;

  const flush = () => {
    if (flushed >= buffer.length) return;
    const segment = buffer.slice(flushed);
    flushed = buffer.length;
    if (segment.trim()) spoken.push(segment.trim());
  };

  for (const event of events) {
    if ('delta' in event) {
      buffer += event.delta;
      continue;
    }
    if ('tool' in event && event.tool.status === 'start') {
      flush();
      continue;
    }
    if ('done' in event) {
      flush();
      finished = true;
      continue;
    }
    if ('error' in event) {
      continue;
    }
  }

  // `onClose` flushes the remainder unless the user hung up.
  if (!finished && !options.stopped) flush();

  return { spoken, buffer };
}

describe('call screen speech flush sequence', () => {
  it('speaks once at the end when the reply has no tools', () => {
    const { spoken } = simulateStream([
      { delta: 'You have ' },
      { delta: 'a dentist ' },
      { delta: 'appointment at 3pm.' },
      { done: true },
    ]);

    expect(spoken).toEqual(['You have a dentist appointment at 3pm.']);
  });

  it('speaks the pre-tool text, then the post-tool text', () => {
    const { spoken } = simulateStream([
      { delta: "I'll check your week. " },
      { delta: 'Let me look' },
      { tool: { name: 'recall_memory', status: 'start' } },
      { tool: { name: 'recall_memory', status: 'end', ok: true } },
      { delta: ' at your schedule. ' },
      { delta: 'Nothing today.' },
      { done: true },
    ]);

    // The old implementation lost "Let me look" here.
    expect(spoken).toEqual(["I'll check your week. Let me look", 'at your schedule. Nothing today.']);
  });

  it('handles several tools in one reply', () => {
    const { spoken } = simulateStream([
      { delta: 'First part.' },
      { tool: { name: 'recall_memory', status: 'start' } },
      { delta: 'Second part.' },
      { tool: { name: 'save_memory', status: 'start' } },
      { delta: 'Third part.' },
      { done: true },
    ]);

    expect(spoken).toEqual(['First part.', 'Second part.', 'Third part.']);
  });

  it('does not speak when a tool fires before any text arrived', () => {
    const { spoken } = simulateStream([
      { tool: { name: 'recall_memory', status: 'start' } },
      { delta: 'Hello there.' },
      { done: true },
    ]);

    expect(spoken).toEqual(['Hello there.']);
  });

  it('speaks a partial reply when the connection drops', () => {
    // No `done`: the stream ended early but the text is still worth saying.
    const { spoken } = simulateStream([
      { delta: 'Your day is ' },
      { delta: 'clear so far.' },
    ]);

    expect(spoken).toEqual(['Your day is clear so far.']);
  });

  it('says nothing when the user hung up mid-stream', () => {
    const { spoken } = simulateStream(
      [
        { delta: 'This should ' },
        { delta: 'not be spoken.' },
      ],
      { stopped: true },
    );

    expect(spoken).toEqual([]);
  });

  it('never speaks the same text twice', () => {
    const { spoken, buffer } = simulateStream([
      { delta: 'One. ' },
      { tool: { name: 'recall_memory', status: 'start' } },
      { delta: 'Two. ' },
      { done: true },
    ]);

    expect(spoken.join(' ')).toBe(buffer.trim());
    expect(new Set(spoken).size).toBe(spoken.length);
  });

  it('does not speak an error message as assistant text', () => {
    const { spoken } = simulateStream([
      { delta: 'Partial answer.' },
      { error: { code: 'rate_limited', message: 'Too many requests.' } },
    ]);

    // The error is shown in the transcript, but the partial text is still spoken.
    expect(spoken).toEqual(['Partial answer.']);
    expect(spoken.join(' ')).not.toContain('Too many requests');
  });
});
