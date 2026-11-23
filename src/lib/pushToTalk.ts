/**
 * Push-to-talk state machine (DESIGN §5.5).
 *
 * Call mode is not ambient listening: the microphone opens on **Record** and the
 * utterance is sent once, on **Stop & send**. The recogniser reports results
 * asynchronously *after* `stop()` is called, so the decision of when to send
 * cannot live in the tap handler.
 *
 * This module is the single source of truth for that decision. `src/app/call.tsx`
 * applies these transitions and the tests import the very same functions, so the
 * suite cannot drift from the screen the way a hand-mirrored copy would.
 */

export type RecordingState = {
  /** True only between tapping Record and tapping Stop. */
  recording: boolean;
  /** Finals accumulated during this recording, joined in order. */
  captured: string;
  /** Latest interim transcript — the fallback when no final ever arrives. */
  partial: string;
  /** Set by a stop: the next end/final must send, exactly once. */
  pendingSend: boolean;
};

export const idleRecording: RecordingState = {
  recording: false,
  captured: '',
  partial: '',
  pendingSend: false,
};

function join(existing: string, next: string): string {
  return existing ? `${existing} ${next}` : next;
}

/** Opens a fresh session. Anything from a previous recording is discarded. */
export function beginRecording(): RecordingState {
  return { ...idleRecording, recording: true };
}

/**
 * A final result. Accumulates only — sending here would split one utterance into
 * several messages, because continuous mode can emit more than one final.
 */
export function captureFinal(state: RecordingState, transcript: string): RecordingState {
  const text = transcript.trim();
  if (!text) return state;
  return { ...state, captured: join(state.captured, text), partial: '' };
}

/** An interim result: remembered as the fallback, never accumulated. */
export function capturePartial(state: RecordingState, transcript: string): RecordingState {
  return { ...state, partial: transcript };
}

/** The user tapped Stop. The engine finalises asynchronously from here. */
export function requestStop(state: RecordingState): RecordingState {
  if (!state.recording) return state;
  return { ...state, recording: false, pendingSend: true };
}

/**
 * The recogniser failed mid-utterance.
 *
 * The words already heard are kept: an error is the end of the utterance, not a
 * reason to throw away what was said. If anything was captured, the send is
 * finalised so the existing flush path delivers it; otherwise there is simply
 * nothing to send and the caller reports the reason.
 */
export function interrupt(state: RecordingState): RecordingState {
  const hasText = Boolean((state.captured || state.partial).trim());
  return { ...state, recording: false, pendingSend: state.pendingSend || hasText };
}

/** Hang-up: drop the recording without sending it. */
export function abandon(): RecordingState {
  return { ...idleRecording };
}

/**
 * The text to send, plus the session to continue with.
 *
 * Prefers the accumulated finals but falls back to the latest partial: short
 * Android utterances often never produce an `isFinal`, so a final-only buffer
 * would discard a recording whose words were visible on screen.
 */
export function takeText(state: RecordingState): { text: string; next: RecordingState } {
  const text = state.captured.trim() || state.partial.trim();
  return { text, next: { ...state, captured: '', partial: '', pendingSend: false } };
}
