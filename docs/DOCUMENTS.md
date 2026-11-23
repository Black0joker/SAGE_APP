# SAGE — Uploaded documents (PDF search)

A user uploads a PDF once on `/documents` and then **just asks about it in chat**.
SAGE searches the file and answers with the document name and page number.

This document is the reference for the feature: the user flow, why retrieval works
the way it does, the upload's SSE contract, the agent tools, the storage model,
and the privacy rules. [`API.md`](./API.md) §9 is the terse route reference;
[`DESIGN.md`](./DESIGN.md) §5.10 covers the screen.

- **One page:** `/documents` — upload, list, remove.
- **Three tools:** `list_documents`, `search_documents`, `read_document`.
- **Five routes:** the page, plus `GET`/`POST`/`GET <id>`/`DELETE <id>` under `/api/documents`.

---

## 1. What the user does

1. Open `/documents` and choose a PDF.
2. Watch a progress bar while it is extracted and indexed (the response is SSE,
   §4).
3. Ask in chat: *"what does my lease say about the deposit?"*
4. SAGE answers: *"The deposit is refunded within 30 days (Lease.pdf, p. 4)."*

There is **no search box anywhere**. Searching is the model's job: it decides to
call `search_documents`, gets ranked passages back, and writes the answer. The
`/documents` page exists only to get files in and out, because a model cannot
receive a PDF.

Two consequences of that choice, both deliberate:

- The user never learns a query syntax, and never has to guess which document to
  look in.
- An empty result is reported honestly. The prompt brief tells the model that no
  matches means *the passage is not in the uploaded documents*, so it says so
  rather than inventing content.

---

## 2. Why retrieval is lexical, not embeddings

**The gateway has no embeddings endpoint.** Checked against the live Token Harbor
API:

```http
POST /v1/embeddings
→ 404 {"error":{"code":"unknown_endpoint","message":"Unknown endpoint: POST /v1/embeddings.
   This API serves /v1/chat/completions, /v1/responses, /v1/messages,
   /v1/images/generations and /v1/models."}}
```

So there is no hosted way to embed text, and a vector store would mean bundling a
local embedding model: a large dependency (torch), a model download, and a slow
first boot on Railway.

Retrieval therefore runs entirely in SQLite, which already ships FTS5 here
(verified on the local build, 3.50.4): the extracted text is indexed with FTS5
and ranked with **BM25**. Nothing extra to run, nothing to download, no data
leaves the server, and the test suite stays offline.

**The tradeoff is honest and visible:** lexical search is strong on concrete words
and weak on paraphrase. "How do I get my money back?" may not match a clause that
says "refund". Two mitigations are in place:

- `search_documents` ORs every token, so a multi-word question still matches a
  passage that shares only some words.
- The prompt brief tells the model to search more than once with different
  wording before concluding something is absent.

If semantic recall ever becomes the priority, the seam is
`documents.search_documents()`: the routes, the tools, the page, and the tests do
not know how ranking happens.

---

## 3. How a PDF becomes searchable

```
upload bytes
   ↓ inspect_pdf      magic bytes · readable · not encrypted · ≤ 400 pages
   ↓ extract          one page of text at a time          → "extracting" frames
   ↓ chunk            ~1,200 chars, 150 overlap, never across a page
   ↓ insert           one transaction: document + chunks  → "chunking"/"indexing" frames
   ↓ FTS5 trigger     fills the full-text index
committed · searchable
```

- **A chunk never spans two pages.** A citation is only useful if the page number
  is true, so `_split_page()` works per page and the 150-character overlap only
  ever repeats text from the same page.
- **Nothing is written until extraction and chunking have both succeeded**, and
  the document, its chunks, and its index rows commit together. A client that
  disconnects mid-stream leaves *no* half-indexed document, and a stored document
  is always searchable — there is no `processing` status to recover after a
  restart.
- **The same bytes twice is a no-op.** Identity is `(user_id, sha256)`; a repeat
  upload answers `200` with the existing row instead of duplicating the index.
  That also means two accounts may each index the same file independently.
- **A PDF with no text is refused.** A scan produces a valid PDF with zero
  extractable text; SAGE reports that clearly instead of storing an empty
  document that looks like a bug. OCR is not supported.

---

## 4. The upload streams its progress

Indexing a 300-page PDF takes seconds, so `POST /api/documents` answers
`text/event-stream` and reports the work as it happens. This is one request: there
is no job queue, no `202 Accepted` polling, and no in-memory job registry to
reconcile after a restart.

```text
data: {"progress":{"stage":"extracting","done":0,"total":300}}

data: {"progress":{"stage":"extracting","done":12,"total":300}}

data: {"progress":{"stage":"chunking","done":640,"total":640}}

data: {"progress":{"stage":"indexing","done":200,"total":640}}

data: {"done":{"document":{"id":"…","name":"Lease.pdf","page_count":300,
                           "chunk_count":640,"size_bytes":2411724,
                           "created_at":"2026-11-23T20:09:14Z"},
               "created":true}}

data: [DONE]
```

| Frame | Meaning |
| --- | --- |
| `progress.stage` | `extracting`, `chunking`, or `indexing` |
| `progress.done` / `total` | counts for the current stage; `total: 0` means the length is not known yet |
| `done.document` | the created document, identical to what `GET /api/documents` returns per row |
| `done.created` | `false` when the same bytes were already indexed (only possible across a race, §6) |
| `error` | `{"error":{"code","message"}}` — see the rule below |
| `[DONE]` | the terminator, always last |

`extracting` reports every page, so the client can show a determinate bar.
`indexing` reports every 100 chunks (`INDEX_BATCH`).

### 4.1 What answers with a status, and what arrives as a frame

Predictable failures are decided **before** the stream starts, so they answer with
an ordinary HTTP status the client already knows how to show:

| Failure | Answer |
| --- | --- |
| no file, not `%PDF-`, empty, damaged, encrypted, over 400 pages | `400 invalid_request` |
| body over 20 MB | `413 payload_too_large` |
| the same bytes already uploaded | `200 {document, duplicate: true}` — no stream, nothing to do |
| **no extractable text (a scan)** | `201` stream, then an `error` frame |

The rule: **if it is knowable without reading the page text, it is a pre-flight
status; if it is only knowable after reading every page, it is a frame.** Only the
scan is in the second category. Once the response has started the status has
already been sent, so nothing predictable belongs in the stream.

### 4.2 The routes

| Method | Endpoint | Result |
| --- | --- | --- |
| `GET` | `/documents` | public, data-free HTML shell |
| `GET` | `/api/documents` | `200 {documents: [{id, name, page_count, chunk_count, size_bytes, created_at}]}` |
| `POST` | `/api/documents` | multipart `file` → `201` SSE progress stream, `200` if duplicate |
| `GET` | `/api/documents/<document_id>` | `200 {document: {…, pages: [{page, preview}]}}` or `404` |
| `DELETE` | `/api/documents/<document_id>` | `204`, or `404` |

Every route is scoped to the signed-in user. An id belonging to another account
answers `404`, never `403`, so a document id is not a way to learn whether someone
else's file exists.

### 4.3 Client rules

- **`201` means stream, anything else means JSON.** A duplicate is `200` with a
  body, because there is nothing to process and an SSE reply with one frame would
  be noise.
- Use the existing bearer-token fetch wrapper (`Session.authFetch`); it keeps the
  `401 → /login` behaviour. The response body is read with the same small SSE
  reader as the chat and call pages.
- **Adopt the `done` frame** instead of refetching the list — prepend the
  document, dedupe by `id`, hide the empty state. A successful upload costs one
  request, not two.
- **If the stream ends without `done` and without `error`,** the indexing never
  finished: show the generic error rather than a phantom success.

---

## 5. The agent tools

Registered in `app.agent_toolset()` alongside the memory and schedule tools, so
they are offered on `POST /api/chat`, `POST /api/chat/stream`, and in call mode.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_documents` | `limit` (1–200, default 50) | `{documents: [...], count}` |
| `search_documents` | `query` (required, ≤300 chars), `document_id?`, `limit?` (1–20, default 6) | `{results: [{document_id, document_name, page, text}], count}` |
| `read_document` | `document_id` (required), `start_page?`, `end_page?` | `{document_id, document_name, page_count, start_page, end_page, text}` |

- `read_document` returns at most **20 pages** and **8,000 characters** per call,
  so a follow-up read cannot flood the context.
- Each search result carries at most **900 characters** of the passage.
- The tool schemas are raw OpenAI schemas, and every handler filters its arguments
  through an allowlist: a model that invents `user_id` cannot reach another
  account's data (`tests/test_documents.py` pins this).
- Handlers never hold a database connection. They are called inside the streamed
  generator, after the request context's teardown, so `documents` resolves a live
  connection per call — the same rule as the memory and schedule tools.
- `search_documents` logs `documents.search` with counts and a flag only: never
  the query text, never a passage.

### 5.1 How the model is told to use them

`documents.prompt_brief()` is appended to every system prompt, after the schedule
brief — including when `TH_SYSTEM_PROMPT` replaces the persona. It states that
uploads are user-scoped, that search is keyword-based, that the model should use
the user's own words and search again with different terms, that it must name the
document and page when answering from one, and that an empty result means "not in
the uploaded documents" — **never** guessed at or invented.

The brief is guidance, not a security boundary: the boundary is that no tool
schema exposes `user_id` and the handlers bind it from the JWT.

---

## 6. Storage

Two tables in the same SQLite database as everything else, created by
`documents.init_db()` on startup:

- **`documents`** — `id` (UUID text), `user_id`, `name`, `sha256`, `page_count`,
  `chunk_count`, `size_bytes`, `created_at`. Unique on `(user_id, sha256)`.
- **`document_chunks`** — `id`, `document_id`, `user_id`, `page`, `chunk_index`,
  `content`, `created_at`.
- **`document_chunks_fts`** — an FTS5 index over `document_chunks.content`,
  `tokenize='porter unicode61 remove_diacritics 2'` (English stemming, Arabic
  tokenisation).

Two details worth knowing before touching the schema:

1. **`document_chunks.id` is `INTEGER PRIMARY KEY`** — a rowid alias, the one
   table here that does not key on a TEXT uuid. An FTS5 *external-content* table
   aligns on `rowid`, so `content_rowid='id'` requires it. `AUTOINCREMENT` also
   prevents rowid reuse, so an orphaned index row can never be matched by a new
   chunk.
2. **Triggers keep the index in sync.** SQLite fires `AFTER DELETE` triggers for
   *cascading* deletes too, so deleting a user cleans the index; `delete_document`
   still removes the chunks explicitly rather than relying on that.

A **concurrent** upload of the same bytes (two tabs) can lose the race between the
pre-flight duplicate check and the insert. The unique index turns that into an
`IntegrityError`, which `index_document` catches and answers with the existing row
(`created: false`) instead of a 500.

**Deletion is a hard delete.** `DELETE /api/documents/<id>` removes the document,
its chunks, and its index rows. There is no soft-delete and no retention copy.

---

## 7. Privacy

Uploaded PDFs and their text are personal data. The rules, all test-enforced:

- **Every read and write is scoped to the signed-in user id.** Another account's
  id answers `404` on the routes and is refused by the tool handlers.
- **Document text, document names, and search queries are never logged.**
  `documents` uses `_execute_private`, which logs the statement text only — it
  deliberately ignores `LOG_SQL_PARAMS=1`, which `memory._execute` would honour.
  Logs carry counts, sizes, page counts, and durations.
  `tests/test_documents.py::test_document_text_never_reaches_the_logs` asserts
  this with the flag on.
- **Progress frames carry counts only** — `stage`, `done`, `total`. Adding text,
  a filename, or a query to one would leak personal data into a response the
  browser caches in devtools and proxies may record.
- **Nothing is sent anywhere.** Extraction and search are local; the only outbound
  traffic in the app is the model call and voice.
- **Filename handling is defensive.** The client filename is reduced to its
  basename and truncated; it is never used as a path. The bytes are checked for
  the `%PDF-` magic before any parser sees them.

Deleting the account cascades to documents, chunks, and index rows.

---

## 8. Limits and constants

Defined at the top of `documents.py`; change them there, not at call sites.

| Constant | Value | Meaning |
| --- | --- | --- |
| `MAX_BYTES` | 20 MB | upload cap; also set as Flask's `MAX_CONTENT_LENGTH` |
| `MAX_PAGES` | 400 | pages per document |
| `MAX_CHUNKS` | 4,000 | chunks per document |
| `MAX_NAME` | 200 | document name |
| `CHUNK_CHARS` / `CHUNK_OVERLAP` | 1,200 / 150 | chunk geometry |
| `INDEX_BATCH` | 100 | chunks per `indexing` frame and per insert batch |
| `DEFAULT_LIMIT` / `MAX_LIMIT` | 6 / 20 | `search_documents` results |
| `MAX_EXCERPT` | 900 | characters of a passage returned to the model |
| `MAX_PAGE_SPAN` / `MAX_READ_CHARS` | 20 / 8,000 | `read_document` bounds |
| `MAX_QUERY` | 300 | search query |

An oversized body is rejected by Werkzeug **before** it is buffered, and the app's
`413` handler answers JSON so a fetch call does not receive an HTML error page.

---

## 9. Known limitations

- **No OCR.** Scanned PDFs are rejected with an explicit message. The alternative —
  storing an empty document — silently breaks the feature.
- **Lexical recall.** Paraphrased questions can miss (§2). Mitigated by OR-ed
  tokens, repeated searching, and the model's ability to `read_document` around a
  near-miss.
- **Upload transfer progress is indeterminate.** `fetch` cannot report how much of
  the 20 MB has been sent, so the bar stays indeterminate until the first
  `extracting` frame arrives. Real upload progress needs `XMLHttpRequest` and
  would bypass the shared auth wrapper.
- **No per-user storage quota.** The page caps and the 20 MB limit bound one
  document, not the total, and the database lives on the deployment volume.
- **Extraction is not sandboxed.** `pypdf` is pure Python and a malformed PDF is
  rejected, but a hostile PDF is parsed in-process.
- **Single process.** The streamed upload relies on the same in-process
  assumptions as the rest of the app; do not scale to multiple workers.

---

## 10. Tests

`tests/test_documents.py` (44) covers the module, `TestDocumentsApi` in
`tests/test_app.py` (16) covers the routes. Both are offline; the PDFs are
generated in-process, so no binary fixture is committed.

Notable assertions:

- page-accurate extraction, chunking with overlap, and that a chunk never mixes
  two pages;
- refusal of non-PDF, empty, oversized, encrypted, damaged, and scanned files —
  and that a scan is valid at pre-flight but rejected while indexing;
- FTS query escaping against hostile input (`"`, `*`, `AND`, empty);
- ranking, scoping to one document, and the result-count limit;
- duplicate upload, the page-span cap, and cross-user isolation on every read and
  write, including a spoofed `user_id`;
- the SSE frame contract: stage order, per-page extraction counts, exactly one
  `done` frame, no content in progress frames;
- **an abandoned stream writes nothing** (the atomicity promise in §3);
- document text never reaching the logs, with `LOG_SQL_PARAMS=1`.
