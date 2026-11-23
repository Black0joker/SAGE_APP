# SAGE — Care modes (doctor / support / emergency)

SAGE can behave like a **doctor**, a **support (therapist-style) listener**, or
an **emergency signpost** — inside hard limits. This document is the reference
for the whole feature: what each mode may and must never do, the deterministic
safety layer, the data model, the API, the web screen, and a **React Native
implementation guide**.

> **Read this first.** SAGE is not a medical device, a clinician, or an
> emergency service. It does not diagnose, prescribe, or dispatch help, and it
> never promises that help is on the way or that it will keep a secret. The modes
> change its *behaviour*, never its authority.

- **One page:** `/care` — modes, region, curated numbers, reported symptoms.
- **Three modes:** `doctor`, `therapist`, `emergency` (the default is ordinary
  `chat`).
- **Four tools:** `suggest_care_mode`, `save_symptom`, `recall_symptoms`,
  `get_care_resources`.
- **Consent kind:** `health_data` (default **off**); the safety path does not
  depend on it.
- Related: [`INSIGHTS.md`](./INSIGHTS.md), [`API.md`](./API.md) §12,
  [`DESIGN.md`](./DESIGN.md) §5.12.

---

## 1. The three limits

| Mode | May do | Must never do |
| --- | --- | --- |
| `doctor` | symptom intake, plain-language explanation, triage urgency, "see a professional" | diagnose, prescribe or give dosages, reassure that an urgent symptom is nothing |
| `therapist` | listen, reflect, non-clinical support, optional coping suggestions | claim to be a therapist, run or invent clinical treatment, diagnose |
| `emergency` | surface real emergency numbers and trusted contacts, de-escalate, stay with the user | promise help is on the way, claim to have contacted anyone, promise secrecy, minimise |

Each mode has its own persona file — `prompts/english-{doctor,therapist,emergency}.md`
and the Arabic equivalents — read fresh on every request like the other prompts.
A missing file falls back to the chat persona. `TH_SYSTEM_PROMPT` still overrides
the persona, but the generated care brief and, in emergency mode, the curated
numbers are always appended.

---

## 2. How a mode is chosen

Three layers, from most explicit to most automatic:

1. **The user picks.** `/chat` shows a mode switcher (`Chat · Doctor · Support ·
   Urgent`) rendered by `static/chat.js`. The choice is stored in `localStorage`
   (`th_care_mode`) and sent as `mode` in the chat request.
2. **The model suggests.** The `suggest_care_mode` tool records a suggestion the
   route forwards as a `care` frame. The client shows it as a *prompt* ("Switch
   to Support?") with **Switch** / **Dismiss** — the mode never changes silently.
3. **The server forces emergency.** `care.detect_crisis(text)` runs on the user's
   own message in both chat routes. On a hit, the route overrides the mode to
   `emergency` **before** building the prompt and records a crisis flag.

The layers are ordered so the automatic one can never be downgraded: a crisis hit
always wins over a model suggestion.

---

## 3. The safety layer

The part that must not depend on the model being right:

- **`care.detect_crisis`** is a small, conservative lexicon of *stated* self-harm
  intent (English word-boundary regexes plus Arabic phrases). It fires on "I want
  to die" and "أريد أن أموت" and deliberately not on "I diet" or "my phone died".
  A hit is a safety net, never a diagnosis.
- **The `care` SSE frame** carries `{mode, trigger: "crisis", resources}` and is
  emitted **before any text**, so it cannot be lost to a mid-stream failure. In
  the non-streaming route it is returned as `body.care`.
- **`#care-notice`** is a dedicated band in the chat shell, separate from
  `#voice-banner`, `#recognition-notice`, and `#place-context`. It is not
  dismissible-by-model: on a crisis it shows the emergency number as a `tel:`
  link plus links to `/care` and `/trusted`.
- **Resources are curated config**, in `care.REGIONS`. The model may only echo
  them through `get_care_resources`; it never invents a hotline. Add a region by
  editing that one dict. Emergency numbers are shown **regardless of consent**.

---

## 4. The data model

`care.SCHEMA_SQL`, all scoped by `user_id`.

### `care_preferences`

One row per user: `region` (default `EG`, validated against `REGIONS`) and
`preferred_mode` (nullable), plus `updated_at`. Storing a region is not
sensitive, so it is not consent-gated.

### `symptom_notes`

`id`, `user_id`, `symptom` (≤ 200), `severity` (1–5, nullable), `duration`,
`note`, `observed_at`, `created_at`. Only symptoms the user reported; gated by
`health_data`.

### `crisis_flags`

`id`, `user_id`, `source` (`lexicon` | `model`), `created_at`, `acknowledged_at`.
It records **that** a signal fired and where it came from — **never the
triggering text**.

---

## 5. The agent tools

Merged in `app.agent_toolset()`. `suggest_care_mode` and `get_care_resources` are
**always** offered (the safety path must not depend on consent);
`save_symptom` / `recall_symptoms` appear only with `health_data`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `suggest_care_mode` | `mode` (required), `reason?` | `{suggested, note}` |
| `save_symptom` | `symptom` (required), `severity?`, `duration?`, `note?`, `observed_at?` | `{symptom}` |
| `recall_symptoms` | `limit?` (1–100, default 20) | `{symptoms, count}` |
| `get_care_resources` | `region?` | the curated resources |

Handlers allowlist their arguments (a model-invented `user_id` is dropped) and
never hold a request-scoped database connection.

`care.prompt_brief()` states the mode limits and these rules; in emergency mode
`app.system_prompt()` also injects the user's region's numbers directly.

---

## 6. The API

| Method | Endpoint | Result |
| --- | --- | --- |
| `GET` | `/api/care` | `200 {preferences, resources, regions, modes, consent}` |
| `PUT` | `/api/care/preferences` | `200 {preferences}`; body `{region?, preferred_mode?}` |
| `GET` | `/api/care/symptoms` | `200 {symptoms}` |
| `POST` | `/api/care/symptoms` | `201 {symptom}`; `403 consent_required` without `health_data` |
| `DELETE` | `/api/care/symptoms/<id>` | `204` / `404` |
| `GET` | `/api/care/resources?region=` | `200 {resources}` (defaults to the saved region) |
| `POST` | `/api/care/escalate` | `200 {resources, contacts, note}` |
| `DELETE` | `/api/care` | `200 {deleted}`; requires `{"confirm": true}` |

`GET /api/care/resources` and `/api/care` never require consent — the safety
information is always available. Only recording symptoms is gated.

`resources` look like:

```jsonc
{
  "region": "EG", "label": "Egypt", "emergency": "123",
  "police": "122", "ambulance": "123", "crisis_lines": [],
  "message": "If you are in immediate danger, call your local emergency number now. …"
}
```

### 6.1 Escalation

`POST /api/care/escalate` acknowledges a crisis flag (`{flag_id}`) and returns the
curated `resources` plus the caller's **accepted** trusted contacts (from
`trusted.list_trusted`). It does **nothing else**: this app has no outbound
messaging, and the response says so in `note`. Reaching out is the user's action.
It never claims help was sent.

---

## 7. The web page (`/care`)

A public shell (`templates/care.html` + `static/care-page.js`):

1. **Disclaimer band** — states plainly that SAGE is not a doctor/therapist/
   emergency service (mirrors the server rule).
2. **Care modes** — a region `<select>`, a mode picker (`Chat · Doctor · Support
   · Urgent`), and **Save** (`PUT /api/care/preferences`). The curated numbers
   for the selected region render below and update when the region changes.
3. **Symptoms you have reported** — a list with **Remove**, plus an add form
   (`POST /api/care/symptoms`, `403` surfaced as an error when consent is off).
4. **Permission** — the `health_data` switch.

The chat screen carries the mode switcher (`#care-modes`) and the crisis band
(`#care-notice`).

---

## 8. Privacy and consent

- Every read/write is scoped to the signed-in user id.
- **Symptom text and notes are personal data.** `care.py` uses
  `_execute_private` (statement-only logs, ignores `LOG_SQL_PARAMS=1`).
  `tests/test_care.py` asserts this with the flag on.
- **`health_data` gates recording** symptoms; it does not gate the emergency
  numbers, which must always be reachable.
- The crisis log stores no content — only that a signal fired, its source, and
  when.
- Deleting the account cascades to all three tables.

---

## 9. Limits and constants

In `care.py`.

| Constant | Value | Meaning |
| --- | --- | --- |
| `CARE_MODES` | `doctor`, `therapist`, `emergency` | the modes |
| `REGIONS` | curated dict | emergency numbers; add regions here |
| `DEFAULT_REGION` | `EG` | fallback region |
| `MAX_SYMPTOM` / `MAX_NOTE` | 200 / 1000 | field caps |
| `SEVERITY_MIN` / `SEVERITY_MAX` | 1 / 5 | severity range |
| `DEFAULT_LIMIT` / `MAX_LIMIT` | 20 / 100 | list sizes |

**The region list is safety-critical and curated.** Review it before shipping a
new region; never let the model author one.

---

## 10. React Native implementation guide

### 10.1 Navigation & the mode switcher

Put a **Care** entry beside Insights. Inside the chat screen, add a compact mode
switcher (`Chat · Doctor · Support · Urgent`). Persist the choice with
`SecureStore`/`AsyncStorage` under `th_care_mode` and send it as `mode` on every
chat request, exactly like the web app.

### 10.2 Types

```ts
export type CareMode = "doctor" | "therapist" | "emergency";

export interface CareResources {
  region: string;
  label: string;
  emergency: string | null;
  police?: string | null;
  ambulance?: string | null;
  crisis_lines: { name: string; number: string }[];
  message: string;
}

export interface CareState {
  preferences: { region: string; preferred_mode: CareMode | null };
  resources: CareResources;
  regions: { region: string; label: string }[];
  modes: { mode: CareMode; label: string; hint: string }[];
  consent: { kind: "health_data"; granted: boolean };
}

export interface Symptom {
  id: string;
  symptom: string;
  severity: number | null;
  duration: string | null;
  note: string | null;
  observed_at: string;
  created_at: string;
}
```

### 10.3 Client methods

```ts
getCare() {
  return this.request<CareState>("/api/care");
}

saveCarePreferences(input: { region?: string; preferred_mode?: CareMode | null }) {
  return this.request<{ preferences: CareState["preferences"] }>(
    "/api/care/preferences",
    { method: "PUT", body: JSON.stringify(input) },
  );
}

listSymptoms() {
  return this.request<{ symptoms: Symptom[] }>("/api/care/symptoms");
}

addSymptom(input: { symptom: string; severity?: number; duration?: string }) {
  return this.request<{ symptom: Symptom }>("/api/care/symptoms", {
    method: "POST", body: JSON.stringify(input),
  });
}

deleteSymptom(id: string) {
  return this.request<void>(`/api/care/symptoms/${encodeURIComponent(id)}`,
    { method: "DELETE" });
}

getCareResources(region?: string) {
  const suffix = region ? `?region=${encodeURIComponent(region)}` : "";
  return this.request<{ resources: CareResources }>(
    `/api/care/resources${suffix}`,
  );
}

escalate(flagId?: string) {
  return this.request<{ resources: CareResources;
    contacts: { id: string; email: string; status: string }[]; note: string }>(
    "/api/care/escalate",
    { method: "POST", body: JSON.stringify({ flag_id: flagId }) },
  );
}

grantHealthData(granted: boolean) {
  return this.request("/api/consents/health_data",
    { method: "PUT", body: JSON.stringify({ granted }) });
}
```

### 10.4 Handling the `care` frame (required)

The chat SSE stream can emit a `care` frame. The app **must** handle it:

```ts
type CareFrame = {
  mode: CareMode;
  trigger: "crisis" | "suggested";
  resources: CareResources;
  reason?: string | null;
};

function onCareFrame(care: CareFrame) {
  if (care.trigger === "crisis") {
    // Persistent, uncircumventable band. Deep-link the number.
    showCrisisBanner({
      title: "It sounds like you might be in danger.",
      body: `If you are in immediate danger, call ${care.resources.emergency} now.`,
      callNumber: care.resources.emergency,
      actions: [
        { label: "Emergency details", href: "/care" },
        { label: "People you trust", href: "/trusted" },
      ],
    });
    return;
  }
  // A suggestion is only a prompt — never switch silently.
  showSuggestionBanner(care.mode, care.reason, {
    onAccept: () => setCareMode(care.mode),
    onDismiss: hideSuggestionBanner,
  });
}
```

**Client rules the app must not break:**

- **Never hide the crisis band.** It is server-driven and must survive the rest
  of the UI (its own view, above other banners). Do not auto-dismiss it.
- **Never switch modes silently.** A model suggestion is always a confirm.
- **Numbers come from `resources`.** Never hard-code or guess an emergency
  number; render what the server returns (and refresh it when the region
  changes).
- **Calling uses the OS dialer:** `Linking.openURL("tel:" + emergency)`.
- **Do not claim help was sent.** After `escalate`, show the returned contacts
  and let the *user* choose to call or message; the response's `note` says the
  app does not send anything.

### 10.5 Screens

- **Care screen** — a disclaimer header, a region picker, the mode picker, the
  curated numbers card, a symptoms list with add/remove, and the `health_data`
  switch.
- **Add-symptom form** — `symptom` (required) and an optional 1–5 severity; a
  `403` from the API means the permission is off: show the switch prompt, not a
  generic error.
- **Confirmation** — every Remove and "Forget everything" through
  `Alert.alert`; "Forget everything" sends `{confirm: true}` or the API returns
  `400`.

### 10.6 Storage, offline, accessibility

- Token and `th_care_mode` in secure storage; never persist symptom text.
- Cache `CareState`/symptoms in memory; on failure show the last list with
  retry.
- The `health_data` switch is an accessible switch with `accessibilityRole`
  and `accessibilityState={{ checked }}`.

---

## 11. Known limitations

- **No OCR/diagnostics, by design.** The modes inform and signpost; they do not
  measure or diagnose.
- **The crisis lexicon is small.** It catches explicit statements, not all
  distress. It is a net, not a screener; the prompt handles subtler cases.
- **No outbound messaging.** Escalation surfaces contacts and numbers only;
  there is no email/SMS/push in this app.
- **Emergency numbers are curated and finite.** `REGIONS` covers a handful of
  regions today; others fall back to `EG`.
- **Single process**, like the rest of the app.

---

## 12. Tests

`tests/test_care.py` (module) and `tests/test_app.py::TestCareApi` (routes),
offline. Notable assertions:

- `detect_crisis` fires on stated intent and **not** on "I diet" / "my phone
  died";
- resources are curated per region and an unknown region falls back to the
  default;
- symptoms round-trip, severity is validated, and rows are scoped to the owner;
- a crisis flag records its source and never stores content, and is scoped to
  the owner;
- the `health_data` consent gates `POST /api/care/symptoms` and the
  `save_symptom` / `recall_symptoms` tools, while the safety tools are always
  offered;
- a crisis message returns the emergency band and forces the emergency persona;
- symptom text never reaches the logs, even with `LOG_SQL_PARAMS=1`.
