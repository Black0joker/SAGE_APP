import { getAuthToken, notifyUnauthorized } from './authBridge';
import { getApiBaseUrl } from './config';
import { chat as chatEndpoints } from './endpoints';
import { ApiError } from './errors';
import type { ChatRequest, StreamEvent } from './types';

/**
 * Server-sent-events transport for `POST /api/chat/stream`.
 *
 * Notes that matter (API.md §3.2, §11.3):
 *  - `X-Stream-ID` is the ONLY way to stop a generation, so it must be read from
 *    the response headers before the body is consumed.
 *  - Validation failures come back as JSON, not a stream, so a non
 *    `text/event-stream` content type is surfaced as an `ApiError`.
 *  - On native, Expo installs a WinterCG fetch as the global, which exposes a
 *    real `ReadableStream` body. Web does too. If a runtime ever hands back a
 *    body without a reader we fall back to buffering the whole response, which
 *    loses the incremental feel but keeps the feature working.
 */

const DATA_PREFIX = 'data:';

/** Parses one `\n\n`-delimited SSE block. Returns null for `[DONE]`/noise. */
export function parseFrame(block: string): StreamEvent | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const dataLines = trimmed
    .split('\n')
    .filter((line) => line.startsWith(DATA_PREFIX))
    .map((line) => line.slice(DATA_PREFIX.length).trim());

  if (dataLines.length === 0) return null;

  const data = dataLines.join('\n');
  if (!data || data === '[DONE]') return null;

  try {
    const parsed = JSON.parse(data) as StreamEvent;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Splits a growable buffer into complete frames, returning the remainder. */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  return { frames: parts, rest };
}

export type StreamMeta = { streamId: string | null; conversationId: string | null };

export type StreamHandlers = {
  onEvent: (event: StreamEvent) => void;
  onOpen?: (meta: StreamMeta) => void;
  onError?: (error: ApiError) => void;
  onClose?: () => void;
};

export type StreamController = {
  abort: () => void;
  getStreamId: () => string | null;
  getConversationId: () => string | null;
  finished: Promise<void>;
};

function normalise(body: ChatRequest): ChatRequest {
  // Never send a client-built history alongside `message`; the server ignores it
  // on purpose, and sending it would only invite bugs (API.md §3.1).
  if (body.message !== undefined) {
    const { messages: _ignored, ...rest } = body;
    return rest;
  }
  return body;
}

export function openChatStream(body: ChatRequest, handlers: StreamHandlers): StreamController {
  const controller = new AbortController();
  let streamId: string | null = null;
  let conversationId: string | null = null;

  const emitFrames = (chunk: string, buffer: string): string => {
    const combined = buffer + chunk;
    const { frames, rest } = splitFrames(combined);
    for (const frame of frames) {
      const event = parseFrame(frame);
      if (event) handlers.onEvent(event);
    }
    return rest;
  };

  const finished = (async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${getApiBaseUrl()}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(normalise(body)),
        signal: controller.signal,
      });

      // Read the ids before touching the body.
      streamId = response.headers.get('X-Stream-ID');
      conversationId = response.headers.get('X-Conversation-ID');
      handlers.onOpen?.({ streamId, conversationId });

      if (response.status === 401) notifyUnauthorized();

      const contentType = response.headers.get('content-type') ?? '';
      const isStream = contentType.includes('text/event-stream');

      if (!response.ok || !isStream) {
        let code = 'stream_failed';
        let message = `Stream failed (${response.status})`;
        try {
          const payload = (await response.json()) as {
            error?: { code?: string; message?: string };
          };
          if (payload?.error?.code) code = payload.error.code;
          if (payload?.error?.message) message = payload.error.message;
        } catch {
          // keep the generic message
        }
        handlers.onError?.(new ApiError(response.status, code, message));
        return;
      }

      const reader = response.body?.getReader();

      if (!reader) {
        // Fallback: buffer everything, then parse.
        const text = await response.text();
        const remainder = emitFrames(text, '');
        const tail = parseFrame(remainder);
        if (tail) handlers.onEvent(tail);
        handlers.onClose?.();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer = emitFrames(decoder.decode(value, { stream: true }), buffer);
      }

      const tail = parseFrame(buffer);
      if (tail) handlers.onEvent(tail);

      handlers.onClose?.();
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === 'AbortError') {
        handlers.onClose?.();
        return;
      }
      handlers.onError?.(
        new ApiError(0, 'stream_error', 'The connection to SAGE was interrupted.'),
      );
    }
  })();

  return {
    abort: () => controller.abort(),
    getStreamId: () => streamId,
    getConversationId: () => conversationId,
    finished,
  };
}

/** Ask the server to stop a generation. Returns whether it owned the stream. */
export async function stopChatStream(streamId: string): Promise<boolean> {
  try {
    const result = await chatEndpoints.stop(streamId);
    return Boolean(result?.stopped);
  } catch {
    return false;
  }
}
