/**
 * Query keys. Every key is scoped to the signed-in account so a sign-out (which
 * clears the whole cache) can never leak one account's data into another's.
 */
export const keys = {
  me: ['me'] as const,
  currentThread: ['conversations', 'current'] as const,
  conversations: (limit?: number) => ['conversations', 'list', limit ?? 'default'] as const,
  conversation: (id: string) => ['conversations', id] as const,
  memory: (includeExpired: boolean) => ['memory', { includeExpired }] as const,
  consents: ['consents'] as const,
  appointments: (options?: unknown) => ['appointments', options ?? 'default'] as const,
  today: (tzOffset: number) => ['appointments', 'today', tzOffset] as const,
  routines: (includeInactive: boolean) => ['routines', { includeInactive }] as const,
  places: ['places'] as const,
  trusted: ['trusted'] as const,
  invitations: ['trusted', 'invitations'] as const,
  watching: ['trusted', 'watching'] as const,
  peek: (contactId: string) => ['trusted', 'peek', contactId] as const,
  documents: ['documents'] as const,
  document: (id: string) => ['documents', id] as const,
  voiceStatus: ['voice', 'status'] as const,
};
