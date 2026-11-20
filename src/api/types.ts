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
  | 'familiar_voice';

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
  | { done: true; finish_reason?: string | null; usage?: unknown }
  | { stopped: true }
  | { saved: { conversation_id: string; user_turn_id: string; assistant_turn_id: string } }
  | { error: { code: string; message: string; status?: number } };
