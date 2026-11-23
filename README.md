# SAGE — React Native client

A native client for the SAGE personal-assistant API. The contract lives in
[`docs/API.md`](./docs/API.md) and the design source of truth in
[`docs/DESIGN.md`](./docs/DESIGN.md); this app implements both.

- **Expo SDK 58** (React Native 0.88, new architecture) + **Expo Router**
- **TanStack Query** for server state, **Zustand** for session/theme/stream UI state
- TypeScript strict, Jest + React Native Testing Library

---

## Quick start

```bash
npm install
cp .env.example .env      # already present with a local default
npx expo start            # then press a / i, or scan with a dev build
```

### Pointing at the API

`.env` holds one variable:

```
EXPO_PUBLIC_API_URL=http://192.168.1.22:5000
```

| Where the app runs | What to use |
| --- | --- |
| **Physical phone (Expo Go)** | **`http://<your-computer-LAN-ip>:5000`** — `127.0.0.1` means the phone itself |
| iOS simulator, web | `http://127.0.0.1:5000` |
| Android emulator | leave `127.0.0.1` — the app rewrites it to `10.0.2.2` automatically |

The phone and the computer must be on the same Wi-Fi, and the Flask server must
listen on all interfaces (`0.0.0.0`), not just `127.0.0.1`. Find your address with
`ipconfig` (Windows) or `ipconfig getifaddr en0` (macOS). A loopback value is only
rewritten on the Android emulator; an explicit LAN IP is never touched. See
[`src/api/config.ts`](./src/api/config.ts).

Changing `.env` requires restarting the dev server — Expo inlines
`EXPO_PUBLIC_*` at bundle time.

### Scripts

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # jest
npm run doctor      # expo-doctor
```

---

## Voice call mode needs a development build

`expo-speech-recognition` has native code, so **speech input** does not run in Expo
Go. Everything else — including the Call screen and its typed fallback — works.

```bash
npx eas-cli build --profile development --platform android
# or locally
npx expo run:android
```

Availability is decided by `requireOptionalNativeModule('ExpoSpeechRecognition')`,
not by requiring the library: the library's entry module calls
`requireNativeModule` at import time, so a plain `try { require(...) }` still
surfaces a red screen. With the probe in place, Expo Go shows *"Voice input needs a
development build. You can keep typing."* and the composer stays usable.

---

## Architecture

```
src/
  app/                  Expo Router routes (file = screen)
    _layout.tsx         boot gate: fonts, prefs, direction, session → Stack.Protected
    login.tsx  register.tsx
    index.tsx           Chat (home)
    call.tsx  memory.tsx  schedule.tsx  trusted.tsx  documents.tsx  settings.tsx
  api/
    client.ts           request(), 204/401/envelope handling, redacting dev log
    endpoints.ts        every route in API.md §2–§9, typed
    stream.ts           SSE transport, parseFrame, stopChatStream
    upload.ts           multipart PDF upload + indexing SSE (DOCUMENTS.md §4)
    authBridge.ts       leaf module owning the token + unauthorised callback
  state/
    session.ts          token in SecureStore, sign-out clears the query cache
    prefs.ts            theme + language (AsyncStorage)
    chatStream.ts       live bubbles, tool line, stream id
  hooks/                thread, today, location ping, chat controller, reduced motion
  i18n/                 typed en/ar dictionary + useT
  lib/                  time, storage, rtl, location, speech, export, confirm, documents
  theme/                tokens (DESIGN §2.4) + theme resolution
  ui/                   AppShell, AppText, Button, Field, Card, Pill, ChatBubble, Composer, ProgressBar
```

### The pieces that carry real risk

| Area | Where | Why it is delicate |
| --- | --- | --- |
| SSE + `X-Stream-ID` | `api/stream.ts` | the header is the **only** way to stop a generation, and it must be read before the body is consumed |
| Optimistic turns | `hooks/useChatController.ts` | bubbles exist before the server knows them; `saved` attaches the real ids so we never refetch |
| Stop semantics | `api/stream.ts`, `useChatController` | POST stop **then** abort; a stopped turn is deleted server-side, so both bubbles roll back |
| RTL | `lib/rtl.ts` | mirrored **manually** via `isRtl`; `I18nManager.forceRTL` is deliberately not used (see below) |
| Location ping | `hooks/useLocationPing.ts` | 5 s cadence, skip in-flight, pause in background, stop permanently on denial or `403` |
| Call speech | `lib/speech.ts`, `app/call.tsx` | speak **one segment per tool boundary**, never per delta (see below) |
| PDF upload | `api/upload.ts` | `201` is a stream, `200` is a JSON duplicate; a stream without `done` is a **failure** |

### How call mode records

Call mode is **push-to-talk**, not ambient listening:

1. Tap **Record** — the microphone opens and everything you say accumulates
2. Tap **Stop & send** — the recogniser finalises, then **one** message is sent
3. Nothing is sent before that tap, and an empty recording sends nothing

The recogniser reports results *after* `stop()` is called, so the send waits for
the engine's `end` event rather than firing in the tap handler. A 1.5 s safety
timer sends whatever was captured if the platform never signals the end (some
Android recognisers do not). Continuous mode can emit several finals for one
utterance, so `onFinal` only accumulates — sending there would split a sentence.

The Record button is disabled while SAGE is speaking, so the microphone never
hears its own voice. Hanging up discards an in-progress recording.

### How call-mode speech is segmented

`POST /api/voice/speak` is called with a **whole segment**, not a sentence:

- the assistant text between tool calls, flushed when a tool starts;
- the remaining reply, flushed on `done`;
- the partial reply on a dropped connection (but never after a hang-up, since the
  server deletes a stopped turn).

The call screen tracks a single index into its streamed buffer (`flushedLengthRef`)
and speaks `buffer.slice(flushedLength)`. It deliberately keeps **no**
"how much have I spoken" string: the previous version compared character counts
against a trimmed `spoken` value that was not a prefix of the buffer, so
`rest.slice(already.length)` silently dropped the tail of every segment at a tool
boundary.

`splitForSpeech` only intervenes when a segment exceeds the endpoint's limit,
packing whole sentences up to 3500 characters and hard-splitting an oversized
single sentence.

### Why language switching is instant

Every component mirrors itself from `isRtl` (`flexDirection`, `textAlign`, the
Arabic font, line height, and explicit left/right insets). That makes a language
switch a pure re-render.

`I18nManager.forceRTL` was tried first and removed: it only takes effect after a
genuine native restart, so switching at runtime left the app waiting for a reload
that Expo Go never completed — which presented as a **blank white page**. Since the
layout is already mirrored by hand, forcing native RTL bought nothing.

`resetNativeDirection()` runs once at boot to clear the flag left behind by builds
that did call `forceRTL(true)`.

**Known cosmetic cost:** the native scroll indicator and iOS swipe-back direction
stay LTR in Arabic, because they follow the native flag. Everything inside the
screen mirrors correctly.

---

## Rules the client must not break

Pulled from API.md §12 and enforced in code, not just in comments:

1. Chat sends **only** `{ conversation_id, message, language }` — never a client-built history.
2. No `user_id` / `owner_id` is ever sent; the server binds the caller from the JWT.
3. Coordinates are never logged and never persisted on the device.
4. `403` from `GET /api/trusted/people/<id>` renders as an **error**, never an empty card.
5. `POST /api/trusted` answers `201` for unknown addresses by design — copy stays neutral.
6. `DELETE /api/memory` always goes through a confirmation and sends `{"confirm": true}`.
7. Memory deletes are hard deletes with no client-side "undo".
8. The device holds no secret except the SAGE JWT.
9. A profile email change returns a **new** token, which replaces the stored one.
10. Only `location` and `trusted_sharing` are enforced server-side; the other consents are stored switches.
11. Uploaded PDFs are personal data: the upload's progress frames carry `stage`/`done`/`total` only, never text or a filename, and a document id is never logged.

---

## Testing

```bash
npm test          # 150 unit tests
```

Covered: SSE frame parsing and buffering, `ApiError` mapping (204 / error envelope /
401 sign-out / expiry pre-emption / network failure / abort passthrough /
`X-Request-ID`), the timezone and formatting helpers the API contract depends on,
the stream store's optimistic → saved → stopped transitions, call-mode sentence
segmentation, the document upload contract (frame parsing, the `200` duplicate body,
`413`, and a stream that ends without `done` being an error), the PDF size/type
guards and progress maths, the i18n key inventory (both languages, no missing keys),
and regressions for bugs found during live web QA.

### What was verified against the running API

The web target was driven end to end in a browser against a live SAGE server:

- register → auto sign-in → chat, and login with a wrong password showing the
  server's exact `Incorrect email or password.` copy
- streaming chat: deltas, tool activity, `saved` id adoption, Stop removing both
  bubbles **and** the server deleting the turn pair
- turn deletion, appointment create / mark done (local → UTC conversion verified:
  picker 8:00 PM → `18:00Z` → renders 8:00 PM at UTC+2), consent toggles,
  trusted invite with an unknown address (neutral copy, no existence leak)
- memory export (real file download), profile email change returning and storing a
  **new** token, logout clearing the token, and a planted invalid token forcing a
  clean sign-out to `/login`
- Arabic: full copy switch, `dir="rtl"` applied, and an Arabic reply in Egyptian
  colloquial
- both themes, verified by screenshot

### Bugs this found and fixed

| Bug | Fix |
| --- | --- |
| Enter did not send on web (`onSubmitEditing` never fires in a `<textarea>`) | handle Enter in `onKeyPress`, Shift+Enter still newlines |
| Stopped text never returned to the composer | send resets the draft override to `null`, not `''` |
| Back button no-opped when a screen was opened directly | `router.canGoBack()` fallback to `/` |
| Memory export failed on web (`expo-file-system` unsupported) | Blob download on web, file + share sheet on native |
| Call transcript clipped the assistant bubble | removed `alignItems: 'center'` from the scroll content |
| Call orb clipped at the top | centred the orb in its own wrapper |
| `useNativeDriver` warning spam on web | `USE_NATIVE_DRIVER` platform constant |

Not yet automated: on-device flows. Maestro/Detox coverage of login → send → stop,
memory deletion, and forced token expiry is still outstanding.

### A note on running web against the API

The SAGE Flask API sends no CORS headers, which is fine for the native app but
blocks a browser on a different origin. To run the web target you need a proxy
that forwards `/api/*` to the Flask server and adds `Access-Control-*` headers,
then point `EXPO_PUBLIC_API_URL` at the proxy. This was used during QA and is not
committed; the native app talks to the API directly.
