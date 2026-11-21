/**
 * Push-to-talk state machine.
 *
 * The call screen records only between tapping Record and tapping Stop, then
 * sends **once**. These tests pin the rules that make that safe, since the
 * recogniser reports results asynchronously after `stop()` is called.
 */

type Session = {
  recording: boolean;
  captured: string;
  partial: string;
  pendingSend: boolean;
  sent: string[];
};

function createSession(): Session {
  return { recording: false, captured: '', partial: '', pendingSend: false, sent: [] };
}

/** Mirrors `startRecording` in `src/app/call.tsx`. */
function startRecording(session: Session) {
  session.captured = '';
  session.partial = '';
  session.pendingSend = false;
  session.recording = true;
}

/** Mirrors `handleFinalSpeech`: accumulate, never send. */
function onFinal(session: Session, transcript: string) {
  const text = transcript.trim();
  if (!text) return;
  session.captured = session.captured ? `${session.captured} ${text}` : text;
  session.partial = '';
}

/** Mirrors `onPartial`: remember the latest interim transcript. */
function onPartial(session: Session, transcript: string) {
  session.partial = transcript;
}

/**
 * Mirrors `flushRecording`: send at most once, then reset. Falls back to the
 * latest partial when the recogniser never marked a result final.
 */
function flush(session: Session, force = false) {
  if (!session.pendingSend) return;
  if (!force && session.recording) return;
  session.pendingSend = false;

  const finals = session.captured.trim();
  const fallback = session.partial.trim();
  const text = finals || fallback;

  session.captured = '';
  session.partial = '';
  if (!text) return;
  session.sent.push(text);
}

/** Mirrors `stopRecording`: mark for send, then wait for the final. */
function stopRecording(session: Session) {
  if (!session.recording) return;
  session.recording = false;
  session.pendingSend = true;
}

describe('push-to-talk', () => {
  it('sends nothing while recording', () => {
    const session = createSession();
    startRecording(session);

    onFinal(session, 'I want to book');
    onFinal(session, 'a dentist appointment');

    expect(session.sent).toEqual([]);
    expect(session.captured).toBe('I want to book a dentist appointment');
  });

  it('sends the whole recording once when the engine ends', () => {
    const session = createSession();
    startRecording(session);
    onFinal(session, 'Book me');
    onFinal(session, 'a dentist appointment tomorrow');

    stopRecording(session);
    flush(session); // onEnd

    expect(session.sent).toEqual(['Book me a dentist appointment tomorrow']);
  });

  it('does not send on an intermediate final while still recording', () => {
    // Continuous mode can emit several finals for one utterance.
    const session = createSession();
    startRecording(session);
    onFinal(session, 'First bit');
    flush(session); // must be a no-op: still recording

    expect(session.sent).toEqual([]);
    expect(session.captured).toBe('First bit');
  });

  it('never sends twice even if flush runs again', () => {
    const session = createSession();
    startRecording(session);
    onFinal(session, 'Hello');
    stopRecording(session);

    flush(session);
    flush(session); // e.g. onEnd firing after onFinal

    expect(session.sent).toEqual(['Hello']);
  });

  it('sends nothing when the user recorded silence', () => {
    const session = createSession();
    startRecording(session);
    stopRecording(session);
    flush(session);

    expect(session.sent).toEqual([]);
  });

  it('ignores a stop when not recording', () => {
    const session = createSession();
    stopRecording(session);
    flush(session);

    expect(session.sent).toEqual([]);
  });

  it('starts a fresh session for the next recording', () => {
    const session = createSession();
    startRecording(session);
    onFinal(session, 'First message');
    stopRecording(session);
    flush(session);

    startRecording(session);
    expect(session.captured).toBe('');
    expect(session.pendingSend).toBe(false);

    onFinal(session, 'Second message');
    stopRecording(session);
    flush(session);

    expect(session.sent).toEqual(['First message', 'Second message']);
  });

  it('keeps a pause mid-thought inside one message', () => {
    // The old behaviour sent each sentence as it was recognised.
    const session = createSession();
    startRecording(session);
    onFinal(session, 'So I was thinking');
    // ...a long pause, still recording...
    onFinal(session, 'maybe next Tuesday works');
    stopRecording(session);
    flush(session);

    expect(session.sent).toEqual(['So I was thinking maybe next Tuesday works']);
  });

  it('sends what exists when the engine never emits an end after stop', () => {
    const session = createSession();
    startRecording(session);
    onFinal(session, 'Partial thought');
    stopRecording(session);
    // Safety timer fires; the engine never signalled the end.
    flush(session, true);

    expect(session.sent).toEqual(['Partial thought']);
  });

  it('does not send a recording discarded by hang-up', () => {
    const session = createSession();
    startRecording(session);
    onFinal(session, 'Never mind');
    // hang-up: discard without sending
    session.recording = false;
    session.pendingSend = false;
    session.captured = '';
    session.partial = '';

    flush(session);
    expect(session.sent).toEqual([]);
  });
});

describe('partial-only recordings (the reported bug)', () => {
  /**
   * Reported symptom: tap Record, speak, tap Stop — nothing sent.
   *
   * Cause: the code accumulated only `isFinal` results, but short Android
   * utterances often never produce one, so the buffer was empty while the words
   * were visible in the live preview. The latest partial is now the fallback.
   */
  it('sends the latest partial when no final ever arrives', () => {
    const session = createSession();
    startRecording(session);

    onPartial(session, 'I want to book');
    onPartial(session, 'I want to book a dentist');
    onPartial(session, 'I want to book a dentist appointment');

    stopRecording(session);
    flush(session, true); // safety timer

    expect(session.sent).toEqual(['I want to book a dentist appointment']);
  });

  it('prefers the final over the partial', () => {
    const session = createSession();
    startRecording(session);
    onPartial(session, 'Book me a dentist appoi');
    onFinal(session, 'Book me a dentist appointment.');

    stopRecording(session);
    flush(session);

    expect(session.sent).toEqual(['Book me a dentist appointment.']);
  });

  it('sends once when the final arrives after end', () => {
    const session = createSession();
    startRecording(session);
    onPartial(session, 'Partial words here');

    stopRecording(session);
    // `end` fires first, inside the grace window; then the final lands.
    onFinal(session, 'Final words here');
    flush(session);

    expect(session.sent).toEqual(['Final words here']);
  });

  it('sends exactly once when both end and final trigger a flush', () => {
    const session = createSession();
    startRecording(session);
    onFinal(session, 'Hello there');
    stopRecording(session);

    flush(session); // from `end`
    flush(session); // from the trailing final
    flush(session, true); // safety timer

    expect(session.sent).toEqual(['Hello there']);
  });

  it('sends nothing when there was no partial and no final', () => {
    const session = createSession();
    startRecording(session);
    stopRecording(session);
    flush(session, true);

    expect(session.sent).toEqual([]);
  });

  it('does not send a partial recorded before the recording started', () => {
    const session = createSession();
    onPartial(session, 'stale words from a previous session');

    startRecording(session); // clears the partial
    stopRecording(session);
    flush(session, true);

    expect(session.sent).toEqual([]);
  });
});
