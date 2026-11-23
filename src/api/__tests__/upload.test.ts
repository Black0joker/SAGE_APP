import { parseUploadFrame, uploadDocument, type UploadAsset } from '../upload';
import { ApiError } from '../errors';

// The upload body wraps the picked file in expo-file-system's `File`, which has
// no jest implementation. The stand-in extends `Blob` because the test runtime's
// `FormData.append(name, value, filename)` only accepts a Blob part.
jest.mock('expo-file-system', () => ({
  File: class MockFile extends Blob {
    uri: string;
    constructor(uri: string) {
      super([`pdf-bytes:${uri}`]);
      this.uri = uri;
    }
  },
  Paths: { cache: { uri: 'file:///cache' } },
}));

/**
 * `POST /api/documents` contract (DOCUMENTS.md §4.3).
 *
 * The rules worth pinning: `201` means stream, `200` means JSON, and a stream
 * that ends without `done` is a failure — never a phantom success.
 */

const asset: UploadAsset = {
  uri: 'file:///tmp/Lease.pdf',
  name: 'Lease.pdf',
  mimeType: 'application/pdf',
  size: 2411724,
};

const createdDocument = {
  id: 'doc-1',
  name: 'Lease.pdf',
  page_count: 300,
  chunk_count: 640,
  size_bytes: 2411724,
  created_at: '2026-11-23T20:09:14Z',
};

function streamResponse(body: string): Response {
  return {
    ok: true,
    status: 201,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    // `body: null` exercises the buffered fallback, which parses the whole text.
    body: null,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as unknown as Response;
}

describe('parseUploadFrame', () => {
  it('parses a progress frame', () => {
    expect(parseUploadFrame('data: {"progress":{"stage":"extracting","done":12,"total":300}}')).toEqual({
      progress: { stage: 'extracting', done: 12, total: 300 },
    });
  });

  it('parses the done frame with the document to adopt', () => {
    const frame = `data: ${JSON.stringify({ done: { document: createdDocument, created: true } })}`;
    expect(parseUploadFrame(frame)).toEqual({
      done: { document: createdDocument, created: true },
    });
  });

  it('parses the scan-rejection error frame', () => {
    const frame =
      'data: {"error":{"code":"invalid_request","message":"That PDF has no extractable text."}}';
    expect(parseUploadFrame(frame)).toEqual({
      error: { code: 'invalid_request', message: 'That PDF has no extractable text.' },
    });
  });

  it('ignores the terminator, empty blocks and malformed JSON', () => {
    expect(parseUploadFrame('data: [DONE]')).toBeNull();
    expect(parseUploadFrame('')).toBeNull();
    expect(parseUploadFrame('event: ping')).toBeNull();
    expect(parseUploadFrame('data: {not json')).toBeNull();
  });
});

describe('uploadDocument', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(response: Response) {
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;
  }

  it('reports every progress frame, then resolves with the created document', async () => {
    mockFetch(
      streamResponse(
        [
          'data: {"progress":{"stage":"extracting","done":0,"total":300}}',
          'data: {"progress":{"stage":"extracting","done":12,"total":300}}',
          'data: {"progress":{"stage":"chunking","done":640,"total":640}}',
          'data: {"progress":{"stage":"indexing","done":200,"total":640}}',
          `data: ${JSON.stringify({ done: { document: createdDocument, created: true } })}`,
          'data: [DONE]',
        ].join('\n\n'),
      ),
    );

    const stages: string[] = [];
    const outcome = await uploadDocument(asset, {
      onProgress: (progress) => stages.push(`${progress.stage}:${progress.done}`),
    });

    expect(stages).toEqual(['extracting:0', 'extracting:12', 'chunking:640', 'indexing:200']);
    expect(outcome).toEqual({ kind: 'created', document: createdDocument });
  });

  it('treats `created: false` as a duplicate', async () => {
    mockFetch(
      streamResponse(
        `data: ${JSON.stringify({ done: { document: createdDocument, created: false } })}\n\ndata: [DONE]`,
      ),
    );

    await expect(uploadDocument(asset)).resolves.toEqual({
      kind: 'duplicate',
      document: createdDocument,
    });
  });

  it('adopts the 200 JSON body of a duplicate without reading a stream', async () => {
    mockFetch(jsonResponse({ document: createdDocument, duplicate: true }, 200));

    await expect(uploadDocument(asset)).resolves.toEqual({
      kind: 'duplicate',
      document: createdDocument,
    });
  });

  it('fails when the stream ends without done or error', async () => {
    // Indexing never finished; a success here would be a lie.
    mockFetch(streamResponse('data: {"progress":{"stage":"extracting","done":5,"total":300}}\n\n'));

    await expect(uploadDocument(asset)).rejects.toMatchObject({
      code: 'upload_incomplete',
    });
  });

  it('surfaces an error frame (a scanned PDF) as an ApiError', async () => {
    mockFetch(
      streamResponse(
        'data: {"error":{"code":"invalid_request","message":"That PDF has no extractable text."}}\n\ndata: [DONE]',
      ),
    );

    await expect(uploadDocument(asset)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
      message: 'That PDF has no extractable text.',
    });
  });

  it('maps 413 to the server message', async () => {
    mockFetch(jsonResponse({ error: { code: 'payload_too_large', message: 'Too large.' } }, 413));

    const error = await uploadDocument(asset).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 413, code: 'payload_too_large' });
  });

  it('sends no JSON content type, so the platform can set the boundary', async () => {
    mockFetch(jsonResponse({ document: createdDocument, duplicate: true }));

    await uploadDocument(asset);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Accept).toBe('text/event-stream');
    expect(init.body).toBeInstanceOf(FormData);
  });
});
