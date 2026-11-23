# SAGE — Insights (feelings & communication preferences)

SAGE adapts to **how** someone likes to be spoken to, and it can remember a
feeling the user actually voiced. This document is the reference for the
feature: the user flow, the ethics that bound it, the data model, the agent
tools, the API, the web screen, and a **React Native implementation guide**.

- **One page:** `/insights` — "How SAGE adapts to you".
- **Three tools:** `save_preferences`, `record_mood`, `recall_moods`.
- **Consent kind:** `insights` (default **off**).
- Related: [`CARE.md`](./CARE.md) (doctor / support / emergency modes),
  [`API.md`](./API.md) §11, [`DESIGN.md`](./DESIGN.md) §5.11.

---

## 1. What the user does

1. Chats normally. When the user says "keep it short" or "call me Sam", SAGE
   saves that as a preference through `save_preferences`.
2. When the user says how they feel ("I'm exhausted"), SAGE may record it with
   `record_mood` — a time-bound note, in the user's own words.
3. Opening `/insights` shows what was saved, with a **Remove** on every row, an
   **Export**, **Forget everything**, and the `insights` permission switch.

Nothing is stored until the user grants the `insights` consent. With it off, the
model is not even offered the insight tools.

---

## 2. What SAGE records — and must never record

This is the whole point of the feature, so it is stated in three places: the
persona files (`prompts/*.md` §4/§9), `insights.prompt_brief()`, and the schema.

**Recorded:** a preference the user stated or agreed to, and a feeling the user
**expressed**.

**Never recorded:**

- A feeling SAGE merely *suspects* from wording, tone, timing, or metadata.
- A diagnosis, or the name of any medical or mental-health condition. SAGE never
  labels the person ("you seem depressed").
- A "current mood" presented as fact. A stored feeling is a **past, reported
  observation** with an expiry; it is not the present truth.

The persona already forbids inferring emotional states; the carve-out is narrow
and explicit: *what the user states* may be recorded, what SAGE guesses may not.

---

## 3. The two stores

Both live in the same SQLite database, scoped by `user_id`, in
`insights.SCHEMA_SQL`.

### `user_preferences` — durable settings

| Column | Notes |
| --- | --- |
| `id` | UUID text |
| `user_id` | FK `users(id)`, cascade delete |
| `key` | one of the fixed vocabulary below; unique per `(user_id, key)` |
| `category` | `identity` / `style` / `interest` / `support` / `boundary` |
| `value` | JSON text (string, number, boolean, array, object) |
| `confidence`, `source` | provenance |
| `created_at`, `updated_at` | ISO-8601 UTC |

A preference is **single-valued**: re-saving a key updates the row in place
(`created_at` kept, `updated_at` bumped). The valid keys are
`preferred_name`, `tone`, `response_length`, `detail_level`, `language`,
`format`, `emoji`, `humour`, `topics_of_interest`, `support_style`, `avoid`.
An unknown key is a `400`, so the page and the prompt block stay coherent.

### `mood_observations` — time-bound feelings

| Column | Notes |
| --- | --- |
| `id` | UUID text |
| `user_id` | FK `users(id)` |
| `mood` | one of 13 fixed labels: `happy`, `excited`, `grateful`, `hopeful`, `calm`, `neutral`, `tired`, `unwell`, `stressed`, `anxious`, `frustrated`, `sad`, `angry` |
| `valence` | −1..1, a presentation hint; derived from the mood when omitted |
| `confidence` | 0..1 |
| `note` | short, user-visible, in the user's words (≤ 500 chars) |
| `source` | `user_stated` |
| `observed_at`, `expires_at`, `created_at` | ISO-8601 UTC |

`expires_at` defaults to `observed_at + 7 days`. Expired rows are hidden from
every list and from the model unless `include_expired=true`. This is deliberate:
an old feeling must not colour every later reply.

---

## 4. The agent tools

Registered in `app.agent_toolset()` alongside the memory, schedule, and document
tools — but **only when the `insights` consent is granted**. Handlers filter
their arguments through an allowlist, so a model-invented `user_id` is dropped.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `save_preferences` | `preferences: [{key, value, confidence?}]` (1–25) | `{preferences, count}` |
| `record_mood` | `mood` (required), `note?`, `valence?`, `confidence?`, `observed_at?` | `{mood}` |
| `recall_moods` | `include_expired?`, `limit?` (1–100, default 20) | `{moods, count}` |

Preferences have **no recall tool**: the server injects the active set into every
system prompt as a Personalization block (see below), so the model honours them
without a round trip.

### 4.1 The Personalization block

`app.system_prompt(language, mode, user_id)` appends
`insights.preferences_block(user_id)` — a short "How this user likes to be spoken
to" list, capped at 20 entries. It is present even under `TH_SYSTEM_PROMPT`.

```
### How this user likes to be spoken to (apply unless they ask otherwise right now)
- Reply length (response_length): short
- What to call you (preferred_name): Sam
```

The brief is guidance, not a boundary: the real boundary is that no tool schema
exposes `user_id` and `memory.toolset()` / `insights.toolset()` bind it from the
JWT.

---

## 5. The API

Scoped to the signed-in user; a foreign id answers `404`, never `403`.

| Method | Endpoint | Result |
| --- | --- | --- |
| `GET` | `/api/insights` | `200 {preferences, moods, consent}` |
| `GET` | `/api/insights/export` | `200` JSON download (`sage-insights-export.json`) |
| `DELETE` | `/api/insights/preference/<id>` | `204` / `404` |
| `DELETE` | `/api/insights/mood/<id>` | `204` / `404` |
| `DELETE` | `/api/insights` | `200 {deleted}`; requires `{"confirm": true}` or `400` |

Query: `include_expired=1|true|yes`, `limit` (default 20, max 100).

`GET /api/insights` never requires the consent — a user must always be able to
see and delete what was stored, even after turning the feature off.

```jsonc
{
  "preferences": [
    { "id": "…", "key": "preferred_name", "category": "identity",
      "label": "What to call you", "value": "Sam", "confidence": 1.0,
      "source": "user_stated", "created_at": "…", "updated_at": "…" }
  ],
  "moods": [
    { "id": "…", "mood": "anxious", "valence": -0.6, "confidence": 1.0,
      "note": "before the exam", "source": "user_stated",
      "observed_at": "…", "expires_at": "…", "created_at": "…" }
  ],
  "consent": { "kind": "insights", "granted": false }
}
```

---

## 6. The web page (`/insights`)

A public, data-free shell (`templates/insights.html` + `static/insights-page.js`)
that renders from the bearer token. Three sections:

1. **How SAGE adapts to you** — one row per preference (`label: value`,
   category as meta), with **Remove**; plus **Export** and **Forget everything**.
2. **Feelings you have shared** — a timeline: localized mood label, local time,
   the note; **Remove** per row. The empty state explains the feature only
   records expressed feelings.
3. **Permission** — the `insights` switch.

Deletion and "forget everything" go through `THUI.confirm`; the page shows
skeletons while loading and adopts the response instead of refetching.

---

## 7. Privacy and consent

- **Every read and write is scoped to the signed-in user id**, including the
  tool handlers.
- **Value and note text are personal data.** `insights.py` uses
  `_execute_private`, which logs the statement text only and ignores
  `LOG_SQL_PARAMS=1`. `tests/test_insights.py` asserts this with the flag on.
- **The `insights` consent gates storage and the tools**, not visibility.
  Turning it off stops new recording and hides the tools; the user can still see
  and delete existing rows.
- Deleting the account cascades to both tables.

---

## 8. Limits and constants

Defined at the top of `insights.py`.

| Constant | Value | Meaning |
| --- | --- | --- |
| `MAX_VALUE_BYTES` | 2000 | per preference value |
| `MAX_NOTE` | 500 | mood note |
| `MAX_PREFERENCES_PER_CALL` | 25 | entries per `save_preferences` |
| `MOOD_TTL_DAYS` | 7 | how long a feeling stays current |
| `DEFAULT_LIMIT` / `MAX_LIMIT` | 20 / 100 | list sizes |

---

## 9. React Native implementation guide

The server is the source of truth; the app renders what the API returns and
never keeps its own copy of insights.

### 9.1 Navigation

Add an **Insights** entry (reached from the chat header or a settings list). It
opens a screen with two lists and a permission switch. A secondary entry to
`/care` belongs in the same area (see `CARE.md`).

### 9.2 Types

```ts
export type PreferenceCategory =
  | "identity" | "style" | "interest" | "support" | "boundary";

export type PreferenceKey =
  | "preferred_name" | "tone" | "response_length" | "detail_level"
  | "language" | "format" | "emoji" | "humour" | "topics_of_interest"
  | "support_style" | "avoid";

export type Mood =
  | "happy" | "excited" | "grateful" | "hopeful" | "calm" | "neutral"
  | "tired" | "unwell" | "stressed" | "anxious" | "frustrated"
  | "sad" | "angry";

export interface Preference {
  id: string;
  key: PreferenceKey;
  category: PreferenceCategory;
  label: string;
  value: unknown;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface MoodObservation {
  id: string;
  mood: Mood;
  valence: number | null;
  confidence: number | null;
  note: string | null;
  source: string | null;
  observed_at: string;
  expires_at: string;
  created_at: string;
}

export interface InsightsState {
  preferences: Preference[];
  moods: MoodObservation[];
  consent: { kind: "insights"; granted: boolean };
}
```

### 9.3 Client methods (add to the existing typed client)

```ts
getInsights(params?: { includeExpired?: boolean; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.includeExpired) q.set("include_expired", "1");
  if (params?.limit) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q}` : "";
  return this.request<InsightsState>(`/api/insights${suffix}`);
}

deletePreference(id: string) {
  return this.request<void>(`/api/insights/preference/${encodeURIComponent(id)}`,
    { method: "DELETE" });
}

deleteMood(id: string) {
  return this.request<void>(`/api/insights/mood/${encodeURIComponent(id)}`,
    { method: "DELETE" });
}

forgetInsights() {
  return this.request<{ deleted: { preferences: number; moods: number } }>(
    "/api/insights",
    { method: "DELETE", body: JSON.stringify({ confirm: true }) },
  );
}

// consent
grantInsights(granted: boolean) {
  return this.request(`/api/consents/insights`,
    { method: "PUT", body: JSON.stringify({ granted }) });
}
```

`request` is the app's bearer-token fetch wrapper. On a `401`, clear the token
and route to sign-in, exactly as the web `Session.authFetch` does.

### 9.4 Screens

- **Insights screen** — a `SectionList` (Preferences, Feelings) or two sections
  in a `ScrollView`. Preference rows show `label: value`; mood rows show the
  localized mood, `new Date(observed_at).toLocaleString()`, and the note.
- **Permission switch** — a RN `Switch` (`accessibilityRole="switch"`) bound to
  `consent.granted`, calling `grantInsights(next)`. Label it in words as well as
  position ("On"/"Off"), matching the web rule that the motion is the
  affordance and the text is the contract.
- **Destructive actions** — every Remove and the "Forget everything" button go
  through a confirmation `Alert.alert` (the RN equivalent of `THUI.confirm`).
  "Forget everything" calls `forgetInsights()`; the API answers `400` without
  `{confirm:true}`, which the app must always send.
- **Export** — `GET /api/insights/export` returns JSON. On RN, use
  `expo-file-system` (or `Share`) to save/share the download; do not try to
  "download" to a web cache.

### 9.5 Client rules the app must not break

- **Numbers shown to the user are never invented.** If the app ever displays a
  mood or preference, it comes from the API.
- **The permission default is off.** Do not pre-toggle it or record anything
  before the user opts in — the server refuses anyway (no tools offered), but
  the UI must not imply otherwise.
- **Expired feelings are hidden by default.** Pass `include_expired=1` only when
  the user explicitly asks for history.
- **Never send a `user_id`.** Identity is the bearer token.
- **Localised mood labels** are a client concern (the server returns the stable
  `mood` key); keep an `en`/`ar` label map in the app rather than translating on
  the server.

### 9.6 Storage & offline

- The token belongs in `expo-secure-store` (or `react-native-keychain`), never
  `AsyncStorage`; there is no `localStorage` in RN.
- Cache `InsightsState` in memory only. If a request fails, show the previous
  list with a retry — do not persist personal insights to disk.
- Optimistic delete: remove the row, call the API, and restore it with an error
  toast if the request fails.

### 9.7 Accessibility

- Mood rows read their full meaning via `accessibilityLabel` (label + time +
  note), not just the mood word.
- The permission switch exposes `accessibilityState={{ checked }}`.

---

## 10. Known limitations

- **A feeling is never inferred.** There is no sentiment analysis; a mood exists
  only because the user said something. This is a product decision, not a gap.
- **The preference vocabulary is fixed.** A genuinely new kind of preference
  needs a new key in `PREFERENCE_KEYS`, the brief text, and the page labels.
- **No editing in place.** The web page removes rows; changing a preference is
  done by telling SAGE. (The API only exposes delete.)
- **Single process.** Like the rest of the app, it assumes one worker and one
  SQLite file.

---

## 11. Tests

`tests/test_insights.py` (module) and `tests/test_app.py::TestInsightsApi`
(routes). Both offline. Notable assertions:

- preference upsert updates in place, and unknown keys / oversized values are
  rejected;
- a mood's valence is derived from its label, and an unknown mood is rejected;
- expired moods are hidden unless `include_expired`;
- cross-user isolation on every read and write, including a spoofed `user_id`;
- the insight tools are absent until the `insights` consent is granted;
- `DELETE /api/insights` requires `{"confirm": true}`;
- preference values and mood notes never reach the logs, even with
  `LOG_SQL_PARAMS=1`.
