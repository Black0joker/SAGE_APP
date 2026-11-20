import { MAX_SEGMENT_CHARS, splitForSpeech } from '../speechSegments';

/**
 * Call-mode speech sends one segment at a time: the assistant text between tool
 * calls, or the whole reply when there were no tools (API.md §9.2).
 *
 * The previous implementation spoke sentence-by-sentence and tracked progress by
 * comparing character counts against a trimmed `spoken` string, which was not a
 * prefix of the streamed buffer. That dropped the tail of every segment at a tool
 * boundary; these tests pin the replacement.
 */

describe('splitForSpeech', () => {
  it('returns the whole text as one segment when it fits', () => {
    const text = 'You have a dentist appointment at 3pm. Bring the referral letter.';
    expect(splitForSpeech(text)).toEqual([text]);
  });

  it('trims surrounding whitespace', () => {
    expect(splitForSpeech('  hello  ')).toEqual(['hello']);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitForSpeech('')).toEqual([]);
    expect(splitForSpeech('   \n  ')).toEqual([]);
  });

  it('never exceeds the maximum segment length', () => {
    const long = 'This is a sentence. '.repeat(500);
    const chunks = splitForSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
    }
  });

  it('keeps the text intact when it splits (no dropped words)', () => {
    const long = 'Sentence one is here. Sentence two follows it. '.repeat(200);
    const chunks = splitForSpeech(long);
    const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();
    expect(normalise(chunks.join(' '))).toBe(normalise(long));
  });

  it('packs whole sentences and never splits mid-sentence', () => {
    const sentence = 'Short one. '; // 11 characters
    const chunks = splitForSpeech(sentence.repeat(20), 50);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
      // Every chunk ends on a terminator: no sentence was cut in half.
      expect(chunk.endsWith('.')).toBe(true);
    }
    // All the text survives, in order.
    expect(chunks.join(' ')).toBe(sentence.repeat(20).trim());
  });

  it('respects a small budget without exceeding it', () => {
    const chunks = splitForSpeech('Alpha beta. Gamma delta. Epsilon zeta.', 20);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it('hard-splits a single sentence that is itself too long', () => {
    const noPunctuation = 'word '.repeat(400);
    const chunks = splitForSpeech(noPunctuation, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it('stays under the endpoint limit of 4000 characters', () => {
    const long = 'x'.repeat(9000);
    for (const chunk of splitForSpeech(long)) {
      expect(chunk.length).toBeLessThan(4000);
    }
  });

  it('handles Arabic text with the Arabic question mark', () => {
    // ~28 chars per sentence; repeat enough to exceed the 3500-char budget.
    const arabic = 'هل أنت بخير؟ أخبرني من فضلك. '.repeat(200);
    expect(arabic.length).toBeGreaterThan(MAX_SEGMENT_CHARS);

    const chunks = splitForSpeech(arabic);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
    }
  });
});

describe('tool-boundary segmentation (the regression)', () => {
  /**
   * Reproduces the old data loss: with the buffer
   *   "I'll check your week. Let me look"
   * the old code compared `rest` ("Let me look", 11 chars) against
   * `spoken` ("I'll check your week. ", 22 chars) and enqueued `rest.slice(22)`,
   * which is the empty string — so the tail was never spoken.
   */
  const bufferBeforeTool = "I'll check your week. Let me look";
  const bufferAfterTool = bufferBeforeTool + ' at your schedule. Nothing today.';

  it('speaks the text before a tool exactly once', () => {
    let flushed = 0;
    const segments: string[] = [];
    const flush = (buffer: string) => {
      if (flushed >= buffer.length) return;
      const segment = buffer.slice(flushed);
      flushed = buffer.length;
      if (segment.trim()) segments.push(segment.trim());
    };

    flush(bufferBeforeTool);
    expect(segments).toEqual(["I'll check your week. Let me look"]);
  });

  it('speaks only the new text after the tool', () => {
    let flushed = 0;
    const segments: string[] = [];
    const flush = (buffer: string) => {
      if (flushed >= buffer.length) return;
      const segment = buffer.slice(flushed);
      flushed = buffer.length;
      if (segment.trim()) segments.push(segment.trim());
    };

    flush(bufferBeforeTool);
    flush(bufferAfterTool);

    expect(segments).toHaveLength(2);
    expect(segments[1]).toBe('at your schedule. Nothing today.');
    // Nothing is spoken twice.
    expect(segments.join(' ')).toBe(bufferAfterTool);
  });

  it('does not speak an empty segment when a tool fires before any text', () => {
    let flushed = 0;
    const segments: string[] = [];
    const flush = (buffer: string) => {
      if (flushed >= buffer.length) return;
      const segment = buffer.slice(flushed);
      flushed = buffer.length;
      if (segment.trim()) segments.push(segment.trim());
    };

    flush(''); // tool start with no text yet
    flush('Hello there.');
    expect(segments).toEqual(['Hello there.']);
  });

  it('speaks the remainder once when generation finishes with no tools', () => {
    let flushed = 0;
    const segments: string[] = [];
    const flush = (buffer: string) => {
      if (flushed >= buffer.length) return;
      const segment = buffer.slice(flushed);
      flushed = buffer.length;
      if (segment.trim()) segments.push(segment.trim());
    };

    // Deltas accumulate; nothing is flushed until `done`.
    let buffer = '';
    for (const delta of ['Your ', 'day is ', 'clear.']) {
      buffer += delta;
      expect(segments).toHaveLength(0);
    }
    flush(buffer);

    expect(segments).toEqual(['Your day is clear.']);
  });

  it('is a no-op when flush is called twice on the same buffer', () => {
    let flushed = 0;
    const segments: string[] = [];
    const flush = (buffer: string) => {
      if (flushed >= buffer.length) return;
      const segment = buffer.slice(flushed);
      flushed = buffer.length;
      if (segment.trim()) segments.push(segment.trim());
    };

    flush('Once only.');
    flush('Once only.');
    expect(segments).toEqual(['Once only.']);
  });
});
