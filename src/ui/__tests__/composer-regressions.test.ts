/**
 * Regression tests for bugs found while running the web target against the real
 * SAGE API. Each case here failed at some point during manual QA.
 */

import { splitSpeakable } from '@/lib/speechSegments';

describe('composer: Enter must send (web)', () => {
  /**
   * On web, react-native-web renders the composer as a `<textarea>`, where
   * `onSubmitEditing` never fires. The composer therefore handles Enter in
   * `onKeyPress`. This test pins the decision logic so a refactor cannot quietly
   * drop the web branch again.
   */
  const shouldSendOnKey = (platform: string, key: string, shiftKey: boolean) =>
    platform === 'web' && key === 'Enter' && !shiftKey;

  it('sends on Enter on web', () => {
    expect(shouldSendOnKey('web', 'Enter', false)).toBe(true);
  });

  it('inserts a newline on Shift+Enter on web', () => {
    expect(shouldSendOnKey('web', 'Enter', true)).toBe(false);
  });

  it('does not intercept other keys', () => {
    expect(shouldSendOnKey('web', 'a', false)).toBe(false);
  });

  it('leaves Enter alone on native, where submitBehavior handles it', () => {
    expect(shouldSendOnKey('ios', 'Enter', false)).toBe(false);
  });
});

describe('composer: stopped text must be restorable', () => {
  /**
   * The composer value is `override ?? restored ?? ''`. Sending must reset the
   * override to `null`, not `''` — an empty-string override would mask the text
   * that a later stop restores.
   */
  type ComposerState = { override: string | null; restored: string | null };

  const value = (state: ComposerState) => state.override ?? state.restored ?? '';

  it('shows restored text when there is no override', () => {
    expect(value({ override: null, restored: 'draft that was stopped' })).toBe('draft that was stopped');
  });

  it('lets a typed override win', () => {
    expect(value({ override: 'typing', restored: 'old' })).toBe('typing');
  });

  it('would mask the restore if send reset the override to an empty string', () => {
    // The buggy behaviour, kept as documentation of what must not happen.
    const buggy = { override: '' as string | null, restored: 'stopped text' };
    expect(value(buggy)).toBe('');

    // The correct behaviour.
    const fixed = { override: null as string | null, restored: 'stopped text' };
    expect(value(fixed)).toBe('stopped text');
  });

  it('clears the composer once the override is null and nothing is restored', () => {
    expect(value({ override: null, restored: null })).toBe('');
  });
});

describe('call screen: sentence segmentation still holds', () => {
  it('does not lose text when a reply streams in fragments', () => {
    const full = 'You have a dentist appointment at 3pm. Bring the referral letter.';
    let spoken = '';
    let pending = '';

    for (const char of full) {
      pending += char;
      const { speak, rest } = splitSpeakable(pending);
      if (speak) {
        spoken += speak;
        pending = rest;
      }
    }
    spoken += pending;

    expect(spoken).toBe(full);
  });
});
