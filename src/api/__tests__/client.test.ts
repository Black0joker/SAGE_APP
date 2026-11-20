import {
  getAuthToken,
  isSessionExpired,
  notifyUnauthorized,
  setAuthExpiry,
  setAuthToken,
  setUnauthorizedHandler,
} from '../authBridge';
import { apiRequest, apiRequestRaw, buildUrl } from '../client';
import { ApiError } from '../errors';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function emptyResponse(status: number) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}

describe('buildUrl', () => {
  it('appends query parameters and skips nullish ones', () => {
    const url = buildUrl('/api/memory', { include_expired: 1, limit: undefined, empty: null });
    expect(url).toContain('/api/memory?');
    expect(url).toContain('include_expired=1');
    expect(url).not.toContain('limit=');
    expect(url).not.toContain('empty=');
  });
});

describe('apiRequest', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setAuthToken(null);
    setAuthExpiry(null);
    setUnauthorizedHandler(null);
  });

  it('returns undefined for 204 No Content', async () => {
    global.fetch = jest.fn(async () => emptyResponse(204)) as unknown as typeof fetch;
    await expect(apiRequest<void>('/api/conversations', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('attaches the bearer token when one is set', async () => {
    setAuthToken('token-123');
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ user: {} });
    }) as unknown as typeof fetch;

    await apiRequest('/api/auth/me');

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
  });

  it('omits the token for anonymous requests', async () => {
    setAuthToken('token-123');
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ token: 'x' });
    }) as unknown as typeof fetch;

    await apiRequest('/api/auth/login', { method: 'POST', body: {}, anonymous: true });

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('maps the error envelope to an ApiError', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(
        { error: { code: 'invalid_request', message: 'Message content is too long (max 8000 characters).' } },
        400,
      ),
    ) as unknown as typeof fetch;

    await expect(apiRequest('/api/chat', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
      message: 'Message content is too long (max 8000 characters).',
    });
  });

  it('carries the upstream status through a provider failure', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(
        { error: { code: 'rate_limited', message: '[429 rate_limited] Too many requests.', status: 429 } },
        502,
      ),
    ) as unknown as typeof fetch;

    await expect(apiRequest('/api/chat', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('signs the user out on 401 and still throws', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('dead-token');

    global.fetch = jest.fn(async () =>
      jsonResponse({ error: { code: 'token_expired', message: 'Session expired.' } }, 401),
    ) as unknown as typeof fetch;

    await expect(apiRequest('/api/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not call the API at all when the stored expiry has passed', async () => {
    setAuthToken('token');
    setAuthExpiry(new Date(Date.now() - 1000).toISOString());
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiRequest('/api/auth/me')).rejects.toMatchObject({ code: 'token_expired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a network failure as a friendly ApiError', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    await expect(apiRequest('/api/auth/me')).rejects.toMatchObject({ code: 'network_error' });
  });

  it('re-throws an abort untouched so callers can ignore it', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch;

    await expect(apiRequest('/api/chat', { method: 'POST', body: {} })).rejects.toBe(abortError);
  });

  it('reads the X-Request-ID header onto the error', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ error: { code: 'bad_gateway', message: 'Upstream failed.' } }, 502, {
        'X-Request-ID': 'req-42',
      }),
    ) as unknown as typeof fetch;

    const error = await apiRequest('/api/chat', { method: 'POST', body: {} }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).requestId).toBe('req-42');
  });
});

describe('apiRequestRaw', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    setAuthToken(null);
    setAuthExpiry(null);
  });

  it('returns the response even for non-2xx so callers can sniff content types', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ anything: true }, 503)) as unknown as typeof fetch;
    const response = await apiRequestRaw('/api/voice/status');
    expect(response.status).toBe(503);
  });
});

describe('authBridge', () => {
  afterEach(() => {
    setAuthToken(null);
    setAuthExpiry(null);
  });

  it('tracks the token', () => {
    setAuthToken('abc');
    expect(getAuthToken()).toBe('abc');
  });

  it('treats a missing expiry as not expired', () => {
    setAuthExpiry(null);
    expect(isSessionExpired()).toBe(false);
  });

  it('treats a past expiry as expired', () => {
    setAuthExpiry(new Date(Date.now() - 1).toISOString());
    expect(isSessionExpired()).toBe(true);
  });

  it('notifies the handler without throwing when none is set', () => {
    setUnauthorizedHandler(null);
    expect(() => notifyUnauthorized()).not.toThrow();
  });
});
