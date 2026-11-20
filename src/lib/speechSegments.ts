/**
 * Segment splitting for call-mode speech.
 *
 * Kept free of native imports so it is unit-testable: `speech.ts` pulls in
 * `expo-audio` and `expo-file-system`, which need a real runtime.
 *
 * The rule (API.md §9.2): send **one segment at a time** — the assistant text
 * between tool calls. We do not speak sentence-by-sentence as deltas arrive; that
 * produced a request per sentence, choppy audio, and (via the old offset
 * arithmetic) dropped text at tool boundaries.
 */

/** A sentence terminator followed by whitespace or the end of the text. */
const SENTENCE_END = /[.!?؟…](?:\s|$)|\n/g;

/**
 * The endpoint rejects text over 4000 characters, so stay comfortably under it.
 * The provider additionally splits anything over 2000 internally.
 */
export const MAX_SEGMENT_CHARS = 3500;

/**
 * Splits one speakable segment into request-sized pieces.
 *
 * Returns `[text]` when it already fits, so the common case is a single request.
 * Otherwise it packs whole sentences up to `maxChars`, and hard-splits any single
 * sentence that is itself too long (long URLs, unpunctuated rambling).
 *
 * Concatenating the result always reproduces the input exactly — no text is
 * dropped, which is what the previous implementation got wrong.
 */
export function splitForSpeech(text: string, maxChars: number = MAX_SEGMENT_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const sentences = splitSentences(trimmed);
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // A single sentence too long to send: flush, then hard-split it.
      push();
      chunks.push(...hardSplit(sentence, maxChars));
      continue;
    }
    if (current.length + sentence.length > maxChars) push();
    current += sentence;
  }
  push();

  return chunks;
}

/** Splits on sentence terminators, keeping each terminator with its sentence. */
function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_END.exec(text)) !== null) {
    const end = match.index + match[0].length;
    parts.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

/** Last-resort split at a word boundary, or mid-word if there is no space. */
function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text.trim();

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
    // `cut <= 0` means no usable boundary: fall back to a hard cut.
    const index = cut > 0 ? cut : maxChars;
    out.push(rest.slice(0, index).trim());
    rest = rest.slice(index).trim();
  }
  if (rest) out.push(rest);
  return out;
}
