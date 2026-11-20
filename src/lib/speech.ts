import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { voice as voiceApi } from '@/api/endpoints';
import type { Language } from '@/api/types';

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
    const finish = () => {
      if (settled) return;
      settled = true;
      subscription.remove();
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

    // Safety net: never hang the queue if the status event is missed.
    setTimeout(finish, 60_000);

    try {
      player.play();
    } catch {
      finish();
    }
  });
}

/**
 * Serial playback queue. Segments are spoken in order, while more text can still
 * be streaming in.
 */
export class SpeechQueue {
  private queue: string[] = [];
  private busy = false;
  private stopped = false;
  private current: AudioPlayer | null = null;
  private spokenText = '';

  constructor(
    private readonly language: Language,
    private readonly voice: string | undefined,
    private readonly onSpeakingChange?: (speaking: boolean) => void,
  ) {}

  /** Text already sent to the voice provider, used to avoid re-speaking. */
  get spoken(): string {
    return this.spokenText;
  }

  enqueue(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.stopped) return;
    this.spokenText += `${trimmed} `;
    this.queue.push(trimmed);
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
    }

    this.busy = false;
    if (!this.stopped) this.onSpeakingChange?.(false);
  }
}

/**
 * Splits accumulated assistant text into what can be spoken now and what should
 * wait for more deltas. Re-exported from `speechSegments` so the pure logic stays
 * testable without a native runtime.
 */
export { splitSpeakable } from './speechSegments';
