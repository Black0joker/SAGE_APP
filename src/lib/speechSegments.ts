/**
 * Sentence segmentation for call-mode speech.
 *
 * Kept free of native imports so it is unit-testable: `speech.ts` pulls in
 * `expo-audio` and `expo-file-system`, which need a real runtime.
 */

/**
 * A sentence terminator followed by whitespace or the end of the text, or a
 * bare newline. A newline stands on its own so `Line one\nLine two` splits even
 * when the next character is not whitespace.
 */
const BOUNDARY = /(?:[.!?؟…](?:\s|$))|\n/g;

/**
 * Splits accumulated assistant text into what can be spoken now and what should
 * wait for more deltas. Only complete sentences are returned as `speak`, so
 * playback can start before the whole answer has streamed in (DESIGN §5.5).
 */
export function splitSpeakable(accumulated: string): { speak: string; rest: string } {
  let lastIndex = -1;
  BOUNDARY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOUNDARY.exec(accumulated)) !== null) {
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex <= 0) return { speak: '', rest: accumulated };
  return { speak: accumulated.slice(0, lastIndex), rest: accumulated.slice(lastIndex) };
}
