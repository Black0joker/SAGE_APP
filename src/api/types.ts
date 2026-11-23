/**
 * Wire types — API.md §11.1 plus the responses the sample client omits.
 * These mirror the server payloads exactly; do not "improve" them.
 */

export type PublicUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  full_name: string;
};

export type AuthPayload = {
  token: string;
  expires_at: string;
  user: PublicUser;
};

export type ErrorEnvelope = {
  error: { code: string; message: string; status?: number };
};

export type TurnOutcome = 'ok' | 'stopped' | 'error';

export type ToolCall = { name: string; ok: boolean | null };

export type Turn = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  finish_reason: string | null;
  model: string | null;
  strategy_id: string | null;
  latency_ms: number | null;
  outcome: TurnOutcome | null;
  tool_calls: ToolCall[] | null;
};

export type Conversation = {
  id: string;
  mode: string;
  language: string;
  started_at: string;
  ended_at: string | null;
};

export type CurrentThread = { conversation: Conversation; turns: Turn[] };

export type MemoryEntity = { id: string; name: string; entity_type: string; created_at: string };

export type MemoryRelationship = {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  created_at: string;
};

export type MemoryFact = {
  id: string;
  entity: string;
  entity_type: string;
  predicate: string;
  value: unknown;
  confidence: number | null;
  source: string | null;
  created_at: string;
  observed_at: string;
  valid_until: string | null;
};

export type MemorySnapshot = {
  entities: MemoryEntity[];
  relationships: MemoryRelationship[];
  facts: MemoryFact[];
};

export type ConsentKind =
  | 'location'
  | 'trusted_sharing'
  | 'voice'
  | 'memory_sharing'
  | 'familiar_voice'
  /** Gates storing communication preferences and expressed feelings. */
  | 'insights'
  /** Gates recording reported symptoms. */
  | 'health_data';

export type Consent = {
  kind: ConsentKind;
  granted: boolean;
  default?: boolean;
  granted_at: string | null;
  revoked_at: string | null;
};

export type ConsentsResponse = { consents: Partial<Record<ConsentKind, Consent>> };

export type MemoryExport = MemorySnapshot & {
  exported_at: string;
  consents: Partial<Record<ConsentKind, Consent>>;
};

export type ForgotCounts = { entities: number; relationships: number; facts: number };

export type AppointmentStatus = 'pending' | 'done' | 'cancelled';

export type Appointment = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  place: string | null;
  notes: string | null;
  status: AppointmentStatus;
  created_at: string;
};

export type Routine = {
  id: string;
  label: string;
  cadence: string;
  window: string;
  active: boolean;
  created_at: string;
};

export type Place = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  notes: string | null;
  created_at: string;
};

/** A place as returned by the location-context payload — coordinates stripped. */
export type ContextPlace = Omit<Place, 'latitude' | 'longitude'> & {
  distance_m: number | null;
};

export type LocationContext = {
  place: ContextPlace;
  memories: MemoryFact[];
  appointment: Appointment | null;
};

export type ContactStatus = 'pending' | 'accepted' | 'revoked';

export type Contact = {
  id: string;
  email: string;
  can_see_location: boolean;
  can_see_last_seen: boolean;
  status: ContactStatus;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type WatchEntry = {
  id: string;
  owner_id: number;
  name: string;
  can_see_location: boolean;
  can_see_last_seen: boolean;
  accepted_at: string | null;
  sharing: boolean;
};

export type PeekStatus = 'unknown' | 'stale' | 'active';

export type Peek = {
  contact_id: string;
  owner: { id: number; name: string };
  last_seen: string | null;
  location: { latitude: number; longitude: number; at: string | null } | null;
  warning: boolean;
  warning_hours: number;
  status: PeekStatus;
};

/**
 * Uploaded PDFs (API.md §9, DOCUMENTS.md).
 *
 * `sha256` is deliberately absent: the server never returns it.
 */
export type Document = {
  id: string;
  name: string;
  page_count: number;
  chunk_count: number;
  size_bytes: number;
  created_at: string;
};

export type DocumentPage = { page: number; preview: string };

export type DocumentWithPages = Document & { pages: DocumentPage[] };

/** The three stages the indexing stream reports (DOCUMENTS.md §4). */
export type UploadStage = 'extracting' | 'chunking' | 'indexing';

/**
 * One `progress` frame. `total: 0` means the length is not known yet, so the
 * bar must stay indeterminate rather than invent a percentage (DESIGN §4.12).
 */
export type UploadProgress = { stage: UploadStage; done: number; total: number };

export type UploadFrame =
  | { progress: UploadProgress }
  | { done: { document: Document; created: boolean } }
  | { error: { code: string; message: string; status?: number } };

/**
 * A settled upload. A duplicate is an ordinary `200` with a body — there is no
 * stream to read because there is nothing to index (§4.3).
 */
export type UploadOutcome =
  | { kind: 'created'; document: Document }
  | { kind: 'duplicate'; document: Document };

/**
 * Insights — communication preferences and feelings the user **expressed**
 * (API.md §11, INSIGHTS.md). Both stores are consent-gated by `insights`.
 */
export type PreferenceCategory = 'identity' | 'style' | 'interest' | 'support' | 'boundary';

/** The fixed vocabulary; an unknown key is a `400` server-side. */
export type PreferenceKey =
  | 'preferred_name'
  | 'tone'
  | 'response_length'
  | 'detail_level'
  | 'language'
  | 'format'
  | 'emoji'
  | 'humour'
  | 'topics_of_interest'
  | 'support_style'
  | 'avoid';

/** The 13 fixed mood labels. The client localises them, never the server. */
export type Mood =
  | 'happy'
  | 'excited'
  | 'grateful'
  | 'hopeful'
  | 'calm'
  | 'neutral'
  | 'tired'
  | 'unwell'
  | 'stressed'
  | 'anxious'
  | 'frustrated'
  | 'sad'
  | 'angry';

export type Preference = {
  id: string;
  key: PreferenceKey;
  category: PreferenceCategory;
  /** Server-provided, already human-readable: "What to call you". */
  label: string;
  /** JSON-decoded by the server: string, number, boolean, array or object. */
  value: unknown;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type MoodObservation = {
  id: string;
  mood: Mood;
  /** −1..1 presentation hint; the server derives it from the mood. */
  valence: number | null;
  confidence: number | null;
  /** In the user's own words, ≤ 500 chars. */
  note: string | null;
  source: string | null;
  observed_at: string;
  /** A feeling stops being current here; expired rows are hidden by default. */
  expires_at: string;
  created_at: string;
};

export type InsightsState = {
  preferences: Preference[];
  moods: MoodObservation[];
  consent: { kind: 'insights'; granted: boolean };
};

/**
 * Care modes (API.md §12, CARE.md). SAGE is not a clinician or an emergency
 * service: the modes change behaviour, never authority.
 */
export type CareMode = 'doctor' | 'therapist' | 'emergency';

export type CareResources = {
  region: string;
  label: string;
  /** The emergency number to dial. Rendered from the server, never hard-coded. */
  emergency: string | null;
  police?: string | null;
  ambulance?: string | null;
  crisis_lines: { name: string; number: string }[];
  message: string;
};

export type CareRegion = { region: string; label: string };

export type CareModeInfo = { mode: CareMode; label: string; hint: string };

export type Symptom = {
  id: string;
  symptom: string;
  severity: number | null;
  duration: string | null;
  note: string | null;
  observed_at: string;
  created_at: string;
};

export type CareState = {
  preferences: { region: string; preferred_mode: CareMode | null };
  resources: CareResources;
  regions: CareRegion[];
  modes: CareModeInfo[];
  consent: { kind: 'health_data'; granted: boolean };
};

/** The `care` frame, emitted before any text on the chat stream (API.md §12.8). */
export type CareFrame = {
  mode: CareMode;
  trigger: 'crisis' | 'suggested';
  resources: CareResources;
  reason?: string | null;
};

export type VoiceStatus = {
  configured: boolean;
  available: boolean;
  expired: boolean;
  expires_at?: string | null;
  reason?: string;
  refresh_configured?: boolean;
  voices?: string[];
  default_voice?: string;
  model?: string;
};

export type ChatMode = 'chat' | 'call';

/** Reply language accepted by the chat and voice endpoints. */
export type Language = 'en' | 'ar';

export type ChatRequest = {
  /** Preferred. The server appends it to the caller's thread and reloads it. */
  message?: string;
  /** Legacy array, used by the call page. Max 50 items. */
  messages?: { role: 'user' | 'assistant'; content: string }[];
  language: 'en' | 'ar';
  mode?: ChatMode;
  greeting?: boolean;
  conversation_id?: string;
};

export type ChatResponse = { reply: string; conversation_id: string };

export type StreamEvent =
  | { delta: string }
  | { reasoning: string }
  | { tool: { name: string; status: 'start' | 'end'; ok?: boolean } }
  /** Emitted before any text. A `crisis` trigger must never be hidden. */
  | { care: CareFrame }
  | { done: true; finish_reason?: string | null; usage?: unknown }
  | { stopped: true }
  | { saved: { conversation_id: string; user_turn_id: string; assistant_turn_id: string } }
  | { error: { code: string; message: string; status?: number } };
