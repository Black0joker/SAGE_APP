import {
  abandon,
  beginRecording,
  captureFinal,
  capturePartial,
  idleRecording,
  interrupt,
  requestStop,
  takeText,
  type RecordingState,
} from '../pushToTalk';

/**
 * Push-to-talk state machine (DESIGN §5.5).
 *
 * These import the **real** module that `src/app/call.tsx` applies. The previous
 * version of this file mirrored the logic in a local type, so it kept passing
 * while the screen was broken — which is exactly how the "Stop & send sends
 * nothing" bug reached a device.
 */

/** Records one full interaction and returns the text that would be sent. */
function run(steps: (state: RecordingState) => RecordingState, start = beginRecording()) {
  return takeText(steps(start));
}

describe('push-to-talk', () => {
  it('sends nothing while recording', () => {
    let session = beginRecording();
    session = captureFinal(session, 'I want to book');
    session = captureFinal(session, 'a dentist appointment');

    expect(session.recording).toBe(true);
    expect(session.pendingSend).toBe(false);
    expect(session.captured).toBe('I want to book a dentist appointment');
  });

  it('sends the whole recording once after a stop', () => {
    const { text } = run((session) =>
      requestStop(captureFinal(captureFinal(session, 'Book me'), 'a dentist tomorrow')),
    );

    expect(text).toBe('Book me a dentist tomorrow');
  });

  it('sends at most once, however many flushes run', () => {
    // `end`, a trailing final and the safety timer can all fire.
    const stopped = requestStop(captureFinal(beginRecording(), 'Hello'));

    const first = takeText(stopped);
    expect(first.text).toBe('Hello');
    expect(first.next.pendingSend).toBe(false);

    // A second flush sees `pendingSend: false` and sends nothing.
    expect(takeText(first.next).text).toBe('');
  });

  it('keeps a pause mid-thought inside one message', () => {
    // Continuous mode can emit several finals for one utterance.
    const { text } = run((session) =>
      requestStop(captureFinal(captureFinal(session, 'So I was thinking'), 'maybe Tuesday works')),
    );

    expect(text).toBe('So I was thinking maybe Tuesday works');
  });

  it('ignores a stop when not recording', () => {
    const stopped = requestStop(idleRecording);
    expect(stopped.pendingSend).toBe(false);
    expect(takeText(stopped).text).toBe('');
  });

  it('starts a fresh session for the next recording', () => {
    const first = takeText(requestStop(captureFinal(beginRecording(), 'First message')));
    expect(first.text).toBe('First message');

    const second = beginRecording();
    expect(second.captured).toBe('');
    expect(second.partial).toBe('');
    expect(second.pendingSend).toBe(false);

    expect(takeText(requestStop(captureFinal(second, 'Second message'))).text).toBe('Second message');
  });

  it('does not send a recording discarded by hang-up', () => {
    const discarded = abandon();
    expect(takeText(discarded).text).toBe('');
  });
});

describe('partial-only recordings', () => {
  it('falls back to the latest partial when no final ever arrives', () => {
    // Short Android utterances often never produce an `isFinal`.
    let session = beginRecording();
    session = capturePartial(session, 'I want to book');
    session = capturePartial(session, 'I want to book a dentist');
    session = capturePartial(session, 'I want to book a dentist appointment');

    expect(takeText(requestStop(session)).text).toBe('I want to book a dentist appointment');
  });

  it('prefers the final over the partial', () => {
    let session = capturePartial(beginRecording(), 'Book me a dentist appoi');
    session = captureFinal(session, 'Book me a dentist appointment.');

    expect(takeText(requestStop(session)).text).toBe('Book me a dentist appointment.');
  });

  it('clears the partial once a final lands', () => {
    const session = captureFinal(capturePartial(beginRecording(), 'partial bit'), 'final bit');
    expect(session.partial).toBe('');
    expect(session.captured).toBe('final bit');
  });

  it('sends nothing when there was no partial and no final', () => {
    expect(takeText(requestStop(beginRecording())).text).toBe('');
  });

  it('ignores a partial recorded before the recording started', () => {
    // `beginRecording` returns a clean session, so stale words cannot leak in.
    const stale = capturePartial(idleRecording, 'words from a previous session');
    const fresh = beginRecording();
    expect(fresh.partial).toBe('');
    expect(takeText(requestStop(fresh)).text).toBe('');
    expect(stale.partial).toBe('words from a previous session');
  });
});

describe('the reported bug: stop sends nothing', () => {
  /**
   * An error mid-utterance used to set `recordingRef.current = false` and drop the
   * buffer, so words already heard were lost and nothing was ever sent.
   */
  it('keeps captured text when the recogniser fails mid-recording', () => {
    let session = captureFinal(beginRecording(), 'Book me a dentist');
    session = interrupt(session);

    expect(session.recording).toBe(false);
    // The error ended the utterance; it did not invalidate what was said.
    expect(session.captured).toBe('Book me a dentist');
    expect(session.pendingSend).toBe(true);
    expect(takeText(session).text).toBe('Book me a dentist');
  });

  it('keeps a partial when the recogniser fails before any final', () => {
    let session = capturePartial(beginRecording(), 'half a thought');
    session = interrupt(session);

    expect(takeText(session).text).toBe('half a thought');
  });

  it('does not queue a send when an error arrives with nothing captured', () => {
    const session = interrupt(beginRecording());

    expect(session.recording).toBe(false);
    // Nothing to send, so the screen reports the reason instead of sending.
    expect(session.pendingSend).toBe(false);
    expect(takeText(session).text).toBe('');
  });

  it('keeps a stop pending when an error follows the stop', () => {
    const stopped = requestStop(captureFinal(beginRecording(), 'already stopped'));
    const failed = interrupt(stopped);

    expect(failed.pendingSend).toBe(true);
    expect(takeText(failed).text).toBe('already stopped');
  });
});
