import { splitSpeakable } from '../speechSegments';

/**
 * Call-mode speech is split into segments so playback can start before the whole
 * answer has streamed in (DESIGN §5.5). Only sentence boundaries count.
 */
describe('splitSpeakable', () => {
  it('returns everything as rest when there is no sentence boundary yet', () => {
    expect(splitSpeakable('You have a dent')).toEqual({ speak: '', rest: 'You have a dent' });
  });

  it('speaks complete sentences and keeps the unfinished remainder', () => {
    const { speak, rest } = splitSpeakable('You have a dentist appointment at 3pm. Bring the letter');
    expect(speak).toBe('You have a dentist appointment at 3pm. ');
    expect(rest).toBe('Bring the letter');
  });

  it('handles multiple sentences', () => {
    const { speak, rest } = splitSpeakable('First. Second. Third');
    expect(speak).toBe('First. Second. ');
    expect(rest).toBe('Third');
  });

  it('treats the Arabic question mark as a boundary', () => {
    const { speak, rest } = splitSpeakable('هل أنت بخير؟ أخبرني');
    expect(speak).toBe('هل أنت بخير؟ ');
    expect(rest).toBe('أخبرني');
  });

  it('treats a newline as a standalone boundary', () => {
    const { speak, rest } = splitSpeakable('Line one\nLine two');
    expect(speak).toBe('Line one\n');
    expect(rest).toBe('Line two');
  });

  it('speaks a text that already ends on a boundary, leaving no rest', () => {
    expect(splitSpeakable('All done.')).toEqual({ speak: 'All done.', rest: '' });
  });

  it('handles an empty string', () => {
    expect(splitSpeakable('')).toEqual({ speak: '', rest: '' });
  });

  it('is stateless across calls (the regex lastIndex must not leak)', () => {
    expect(splitSpeakable('First. Second.').speak).toBe('First. Second.');
    expect(splitSpeakable('First. Second.').speak).toBe('First. Second.');
  });

  it('never loses text: speak + rest always reconstructs the input', () => {
    for (const input of ['', 'a', 'a. b', 'a\nb', 'done.', '٣ مساءً. أحضر الخطاب']) {
      const { speak, rest } = splitSpeakable(input);
      expect(speak + rest).toBe(input);
    }
  });
});
