import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { voice as voiceApi } from '@/api/endpoints';
import type { Language } from '@/api/types';
import { splitForSpeech } from './speechSegments';

/**
 * Text-to-speech playback for call mode (DESIGN §5.5).
 *
 * `POST /api/voice/speak` returns `audio/mpeg` bytes. We cache them to a temp file
 * and play it with `expo-audio`. Voice text, tokens and audio are never persisted
 * beyond the temp file, which is deleted when the segment finishes (API.md §12.7).
 */

export async function configureAudioForPlayback(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
    });
  } catch {
    // Non-fatal: the platform default is still reasonable.
  }
}

async function speakSegment(
  text: string,
  language: Language,
  voice: string | undefined,
  onPlayerChange: (player: AudioPlayer | null) => void,
): Promise<void> {
  const bytes = await voiceApi.speak({ text, language, ...(voice ? { voice } : {}) });

  const file = new File(Paths.cache, `sage-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(bytes));

  const player = createAudioPlayer({ uri: file.uri });
  onPlayerChange(player);

  await new Promise<void>((resolve) => {
    let settled = false;
    let safety: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      subscription.remove();
      if (safety) clearTimeout(safety);
      try {
        player.pause();
        player.remove();
      } catch {
        // already released
      }
      try {
        if (file.exists) file.delete();
      } catch {
        // best effort
      }
      onPlayerChange(null);
      resolve();
    };

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });

    // Safety net sized to the text, not a flat minute: ~15 characters per second
    // of speech is a conservative floor, plus a generous margin.
    const expectedMs = Math.max(30_000, Math.ceil((text.length / 15) * 1000) + 15_000);
    safety = setTimeout(finish, expectedMs);

    try {
      player.play();
    } catch {
      finish();
    }
  });
}

/**
 * Serial playback queue.
 *
 * `enqueue` takes a **complete segment** — the assistant text between tool calls,
 * or the whole reply when there were no tools. Segments are spoken in order.
 *
 * There is deliberately no "how much have I spoken" bookkeeping: the caller
 * tracks its own buffer offset, and the old `spoken` string was not a prefix of
 * that buffer, so slicing against it dropped text at tool boundaries.
 */
export class SpeechQueue {
  private queue: string[] = [];
  private busy = false;
  private stopped = false;
  private current: AudioPlayer | null = null;

  constructor(
    private readonly language: Language,
    private readonly voice: string | undefined,
    private readonly onSpeakingChange?: (speaking: boolean) => void,
  ) {}

  /** Queue a whole segment. Oversized segments are split into safe requests. */
  enqueue(text: string): void {
    if (this.stopped) return;
    for (const chunk of splitForSpeech(text)) {
      this.queue.push(chunk);
    }
    void this.drain();
  }

  /** Stop immediately and drop anything queued. */
  clear(): void {
    this.stopped = true;
    this.queue = [];
    try {
      this.current?.pause();
      this.current?.remove();
    } catch {
      // already released
    }
    this.current = null;
    this.onSpeakingChange?.(false);
  }

  private async drain(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    this.onSpeakingChange?.(true);

    while (this.queue.length > 0 && !this.stopped) {
      const segment = this.queue.shift();
      if (!segment) continue;
      try {
        await speakSegment(segment, this.language, this.voice, (player) => {
          this.current = player;
        });
      } catch {
        // A failed segment is skipped; the transcript still shows the text.
      }
      // The user may have hung up while this segment was fetching or playing.
      // Bail without touching state — `clear()` already did the cleanup.
      if (this.stopped) {
        this.busy = false;
        return;
      }
    }

    this.busy = false;
    if (!this.stopped) this.onSpeakingChange?.(false);
  }
}

/**
 * Splits a segment into request-sized pieces. Re-exported so the pure logic stays
 * testable without a native runtime.
 */
export { splitForSpeech, MAX_SEGMENT_CHARS } from './speechSegments';
