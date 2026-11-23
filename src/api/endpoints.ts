import { apiRequestArrayBuffer, http, apiRequest } from './client';
import type {
  Appointment,
  AppointmentStatus,
  AuthPayload,
  CareMode,
  CareResources,
  CareState,
  ChatRequest,
  ChatResponse,
  Consent,
  ConsentKind,
  ConsentsResponse,
  Contact,
  Conversation,
  CurrentThread,
  Document,
  DocumentWithPages,
  ForgotCounts,
  InsightsState,
  Language,
  LocationContext,
  MemoryExport,
  MemorySnapshot,
  Peek,
  Place,
  PublicUser,
  Routine,
  Symptom,
  VoiceStatus,
  WatchEntry,
} from './types';

/**
 * Every route in API.md §2–§9, typed.
 *
 * Nothing here ever sends a `user_id`/`owner_id`; the server binds the caller
 * from the JWT (API.md §12.1).
 */

export const auth = {
  register: (payload: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    confirm_password: string;
  }) => http.post<AuthPayload>('/api/auth/register', payload, { anonymous: true }),

  login: (payload: { email: string; password: string }) =>
    http.post<AuthPayload>('/api/auth/login', payload, { anonymous: true }),

  me: () => http.get<{ user: PublicUser }>('/api/auth/me'),

  logout: () => http.post<void>('/api/auth/logout'),

  /** Returns a NEW token: the name and email live in the claims. */
  updateProfile: (payload: {
    first_name: string;
    last_name: string;
    email: string;
    current_password?: string;
  }) => http.patch<AuthPayload>('/api/auth/profile', payload),

  changePassword: (payload: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) => http.post<void>('/api/auth/password', payload),
};

export const chat = {
  send: (body: ChatRequest, signal?: AbortSignal) =>
    http.post<ChatResponse>('/api/chat', body, { signal }),

  /** The id is the `X-Stream-ID` header from the streaming response. */
  stop: (id: string) => http.post<{ stopped: boolean }>('/api/chat/stop', { id }),
};

export const conversations = {
  current: () => http.get<CurrentThread>('/api/conversations/current'),

  list: (limit?: number) =>
    http.get<{ conversations: Conversation[] }>('/api/conversations', {
      query: { limit },
    }),

  get: (conversationId: string) =>
    http.get<CurrentThread>(`/api/conversations/${encodeURIComponent(conversationId)}`),

  /** Clears EVERY thread for the account — the `Clear` button. */
  clearAll: () => http.delete<void>('/api/conversations'),

  remove: (conversationId: string) =>
    http.delete<void>(`/api/conversations/${encodeURIComponent(conversationId)}`),

  /** Deleting a user turn also deletes the assistant turn that followed it. */
  deleteTurn: (conversationId: string, turnId: string) =>
    http.delete<void>(
      `/api/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}`,
    ),
};

export const memory = {
  list: (options: { includeExpired?: boolean; limit?: number } = {}) =>
    http.get<MemorySnapshot>('/api/memory', {
      query: {
        include_expired: options.includeExpired ? 1 : undefined,
        limit: options.limit,
      },
    }),

  exportAll: () => http.get<MemoryExport>('/api/memory/export'),

  deleteFact: (factId: string) =>
    http.delete<void>(`/api/memory/fact/${encodeURIComponent(factId)}`),

  deleteEntity: (entityId: string) =>
    http.delete<void>(`/api/memory/entity/${encodeURIComponent(entityId)}`),

  deleteRelationship: (relationshipId: string) =>
    http.delete<void>(`/api/memory/relationship/${encodeURIComponent(relationshipId)}`),
};

/**
 * `DELETE /api/memory` needs a JSON body, which our `http.delete` helper does not
 * carry. This wraps the shared request path so the confirm guard is always sent.
 */
export async function forgetEverythingConfirmed(): Promise<{ deleted: ForgotCounts }> {
  return apiRequest<{ deleted: ForgotCounts }>('/api/memory', {
    method: 'DELETE',
    body: { confirm: true },
  });
}

export const consents = {
  list: () => http.get<ConsentsResponse>('/api/consents'),
  set: (kind: ConsentKind, granted: boolean) =>
    http.put<Consent>(`/api/consents/${encodeURIComponent(kind)}`, { granted }),
};

export const appointments = {
  list: (options: { start?: string; end?: string; includeDone?: boolean; limit?: number } = {}) =>
    http.get<{ appointments: Appointment[] }>('/api/appointments', {
      query: {
        start: options.start,
        end: options.end,
        include_done: options.includeDone ? 1 : undefined,
        limit: options.limit,
      },
    }),

  today: (tzOffsetMinutes: number) =>
    http.get<{ from: string; to: string; appointments: Appointment[] }>('/api/appointments/today', {
      query: { tz_offset: tzOffsetMinutes },
    }),

  create: (payload: {
    title: string;
    starts_at: string;
    ends_at?: string;
    place?: string;
    notes?: string;
  }) => http.post<Appointment>('/api/appointments', payload),

  updateStatus: (appointmentId: string, status: AppointmentStatus) =>
    http.patch<Appointment>(`/api/appointments/${encodeURIComponent(appointmentId)}`, { status }),

  remove: (appointmentId: string) =>
    http.delete<void>(`/api/appointments/${encodeURIComponent(appointmentId)}`),
};

export const routines = {
  list: (includeInactive = false) =>
    http.get<{ routines: Routine[] }>('/api/routines', {
      query: { include_inactive: includeInactive ? 1 : undefined },
    }),

  create: (payload: { label: string; cadence: string; window: string }) =>
    http.post<Routine>('/api/routines', payload),

  remove: (routineId: string) =>
    http.delete<void>(`/api/routines/${encodeURIComponent(routineId)}`),
};

export const places = {
  list: (limit?: number) => http.get<{ places: Place[] }>('/api/places', { query: { limit } }),

  create: (payload: {
    name: string;
    latitude: number;
    longitude: number;
    radius_m?: number;
    notes?: string;
  }) => http.post<Place>('/api/places', payload),

  remove: (placeId: string) => http.delete<void>(`/api/places/${encodeURIComponent(placeId)}`),
};

export const location = {
  /**
   * The periodic ping. `200` means stored AND matched a familiar place; `204`
   * means stored with no match (normal, not an error).
   */
  ping: (latitude: number, longitude: number, signal?: AbortSignal) =>
    apiRequest<{ context: LocationContext } | undefined>('/api/location', {
      method: 'POST',
      body: { latitude, longitude },
      signal,
    }),

  /** One-shot lookup that does not store the position. */
  context: (latitude: number, longitude: number, signal?: AbortSignal) =>
    http.get<{ context: LocationContext | null }>('/api/location/context', {
      query: { latitude, longitude },
      signal,
    }),
};

export const trusted = {
  /** Invitations I sent. */
  list: () => http.get<{ trusted: Contact[] }>('/api/trusted'),

  /** `201` even when no account exists for the address — by design (§8.2). */
  invite: (payload: { email: string; can_see_location?: boolean; can_see_last_seen?: boolean }) =>
    http.post<Contact>('/api/trusted', payload),

  revoke: (contactId: string) =>
    http.delete<void>(`/api/trusted/${encodeURIComponent(contactId)}`),

  invitations: () => http.get<{ invitations: Contact[] }>('/api/trusted/invitations'),

  acceptInvitation: (contactId: string) =>
    http.post<void>(`/api/trusted/invitations/${encodeURIComponent(contactId)}/accept`),

  declineInvitation: (contactId: string) =>
    http.post<void>(`/api/trusted/invitations/${encodeURIComponent(contactId)}/decline`),

  /** People who trust me. Includes entries whose owner has sharing off. */
  watching: () => http.get<{ watching: WatchEntry[] }>('/api/trusted/watching'),

  /** `403` must surface as an error, never as an empty card (§8.8). */
  peek: (contactId: string) =>
    http.get<Peek>(`/api/trusted/people/${encodeURIComponent(contactId)}`),
};

export const voice = {
  status: () => http.get<VoiceStatus>('/api/voice/status'),

  /** Returns `audio/mpeg` bytes. Send one segment at a time. */
  speak: (payload: { text: string; language: Language; voice?: string }) =>
    apiRequestArrayBuffer('/api/voice/speak', {
      method: 'POST',
      body: payload,
      headers: { Accept: 'audio/mpeg' },
    }),
};

/**
 * Uploaded PDFs (API.md §9). The model searches these itself through the
 * `search_documents` / `read_document` tools — there is no search endpoint for
 * the UI to call.
 *
 * `upload()` lives in `./upload` because it needs multipart + SSE, which the
 * JSON helpers here cannot carry.
 */
export const documents = {
  list: () => http.get<{ documents: Document[] }>('/api/documents'),

  /** One document with per-page previews. `404` for another account's id. */
  get: (documentId: string) =>
    http.get<{ document: DocumentWithPages }>(`/api/documents/${encodeURIComponent(documentId)}`),

  /** Hard delete: the row, its chunks, and its index entries. */
  remove: (documentId: string) =>
    http.delete<void>(`/api/documents/${encodeURIComponent(documentId)}`),
};

/**
 * Insights (API.md §11). `GET` never requires the consent: a user must always be
 * able to see and delete what was stored, even after turning the feature off.
 */
export const insights = {
  list: (options: { includeExpired?: boolean; limit?: number } = {}) =>
    http.get<InsightsState>('/api/insights', {
      query: {
        include_expired: options.includeExpired ? 1 : undefined,
        limit: options.limit,
      },
    }),

  exportAll: () => http.get<unknown>('/api/insights/export'),

  deletePreference: (preferenceId: string) =>
    http.delete<void>(`/api/insights/preference/${encodeURIComponent(preferenceId)}`),

  deleteMood: (moodId: string) =>
    http.delete<void>(`/api/insights/mood/${encodeURIComponent(moodId)}`),
};

/** `DELETE /api/insights` needs a JSON body, which `http.delete` cannot carry. */
export async function forgetInsightsConfirmed(): Promise<{
  deleted: { preferences: number; moods: number };
}> {
  return apiRequest('/api/insights', { method: 'DELETE', body: { confirm: true } });
}

/**
 * Care modes (API.md §12). The safety information — resources and numbers — is
 * always readable; only recording symptoms is gated by `health_data`.
 */
export const care = {
  get: () => http.get<CareState>('/api/care'),

  savePreferences: (payload: { region?: string; preferred_mode?: CareMode | null }) =>
    http.put<{ preferences: CareState['preferences'] }>('/api/care/preferences', payload),

  listSymptoms: () => http.get<{ symptoms: Symptom[] }>('/api/care/symptoms'),

  addSymptom: (payload: {
    symptom: string;
    severity?: number;
    duration?: string;
    note?: string;
    observed_at?: string;
  }) => http.post<{ symptom: Symptom }>('/api/care/symptoms', payload),

  deleteSymptom: (symptomId: string) =>
    http.delete<void>(`/api/care/symptoms/${encodeURIComponent(symptomId)}`),

  /** Omitting `region` uses the caller's saved region. */
  resources: (region?: string) =>
    http.get<{ resources: CareResources }>('/api/care/resources', {
      query: { region },
    }),

  /** Returns numbers and contacts. It sends nothing — reaching out is the user's choice. */
  escalate: (flagId?: string) =>
    http.post<{
      resources: CareResources;
      contacts: { id: string; email: string; status: string }[];
      note: string;
    }>('/api/care/escalate', { flag_id: flagId }),
};

/** `DELETE /api/care` requires `{"confirm": true}` and resets the preferences. */
export async function forgetCareConfirmed(): Promise<{
  deleted: { symptoms: number; crisis_flags: number };
}> {
  return apiRequest('/api/care', { method: 'DELETE', body: { confirm: true } });
}
