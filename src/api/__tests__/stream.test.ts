import { parseFrame, splitFrames } from '../stream';

describe('parseFrame', () => {
  it('parses a delta frame', () => {
    expect(parseFrame('data: {"delta":"hello"}')).toEqual({ delta: 'hello' });
  });

  it('ignores the [DONE] terminator', () => {
    expect(parseFrame('data: [DONE]')).toBeNull();
  });

  it('ignores empty and non-data blocks', () => {
    expect(parseFrame('')).toBeNull();
    expect(parseFrame('   ')).toBeNull();
    expect(parseFrame('event: ping')).toBeNull();
  });

  it('ignores malformed JSON rather than throwing', () => {
    expect(parseFrame('data: {not json')).toBeNull();
  });

  it('joins multiple data lines', () => {
    expect(parseFrame('data: {"delta":\ndata: "hi"}')).toEqual({ delta: 'hi' });
  });

  it('parses the saved frame with the ids to attach', () => {
    const frame =
      'data: {"saved":{"conversation_id":"c1","user_turn_id":"u1","assistant_turn_id":"a1"}}';
    expect(parseFrame(frame)).toEqual({
      saved: { conversation_id: 'c1', user_turn_id: 'u1', assistant_turn_id: 'a1' },
    });
  });

  it('parses a stopped frame', () => {
    expect(parseFrame('data: {"stopped":true}')).toEqual({ stopped: true });
  });

  it('parses an error frame with an upstream status', () => {
    const frame = 'data: {"error":{"code":"rate_limited","message":"slow down","status":429}}';
    expect(parseFrame(frame)).toEqual({
      error: { code: 'rate_limited', message: 'slow down', status: 429 },
    });
  });
});

describe('splitFrames', () => {
  it('returns complete frames and keeps the trailing partial', () => {
    const buffer = 'data: {"delta":"a"}\n\ndata: {"delta":"b"}\n\ndata: {"del';
    const { frames, rest } = splitFrames(buffer);
    expect(frames).toHaveLength(2);
    expect(parseFrame(frames[0]!)).toEqual({ delta: 'a' });
    expect(parseFrame(frames[1]!)).toEqual({ delta: 'b' });
    expect(rest).toBe('data: {"del');
  });

  it('handles a buffer with no complete frame yet', () => {
    const { frames, rest } = splitFrames('data: {"delta":"x"}');
    expect(frames).toHaveLength(0);
    expect(rest).toBe('data: {"delta":"x"}');
  });

  it('handles an empty buffer', () => {
    expect(splitFrames('')).toEqual({ frames: [], rest: '' });
  });
});
