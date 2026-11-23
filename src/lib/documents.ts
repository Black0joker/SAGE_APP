/**
 * Upload helpers for the documents feature (DOCUMENTS.md §8).
 *
 * Everything here is pure so the size/type guards and the progress maths can be
 * tested without a device, a picker, or a server.
 */

/** The server's `MAX_BYTES` — also Flask's `MAX_CONTENT_LENGTH`. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Mirrors the web file input's `accept="application/pdf,.pdf"`. */
export function isPdf(asset: { name?: string | null; mimeType?: string | null }): boolean {
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return true;
  return /\.pdf$/i.test(asset.name ?? '');
}

/** Why a picked file cannot be sent, or `null` when it can. */
export type UploadRejection = 'notPdf' | 'tooLarge';

/**
 * Client-side pre-flight. Rejecting here costs no request and gives the user a
 * message the moment they pick the file; the server still validates.
 */
export function rejectionFor(asset: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
}): UploadRejection | null {
  if (!isPdf(asset)) return 'notPdf';
  if (typeof asset.size === 'number' && asset.size > MAX_UPLOAD_BYTES) return 'tooLarge';
  return null;
}

/** `2411724` → `"2.3 MB"`. Used in the row meta and next to the picked file. */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 ("2.3 MB"), none above ("128 MB").
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/**
 * Percentage for the progress bar, or `null` when it is indeterminate.
 *
 * A `total` of 0 means the server has not counted the work yet — DESIGN §4.12
 * forbids inventing a percentage from that.
 */
export function progressPercent(done: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(done) || done <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/** Plural-aware `1 page` / `12 pages`, without an i18n dependency. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The row meta from DESIGN §5.10: `pages · passages · size · date`.
 *
 * The date arrives preformatted because formatting is locale-aware and belongs
 * with the screen's `locale`.
 */
export function documentMeta(
  document: { page_count: number; chunk_count: number; size_bytes: number },
  labels: { page: string; pages: string; passage: string; passages: string },
  date: string,
): string {
  return [
    count(document.page_count, labels.page, labels.pages),
    count(document.chunk_count, labels.passage, labels.passages),
    formatBytes(document.size_bytes),
    date,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The name we send for the multipart part.
 *
 * The server reduces it to a basename anyway, but sending a path-shaped name is
 * pointless and the docs call the handling defensive (§7), so match that.
 */
export function safeFileName(name: string | null | undefined, fallback = 'document.pdf'): string {
  const base = (name ?? '').split(/[\\/]/).pop()?.trim() ?? '';
  if (!base) return fallback;
  // Keep it to something a filesystem and a header can both carry.
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || fallback;
}

/** Prepends an uploaded document and drops any duplicate id (DOCUMENTS.md §4.3). */
export function adoptDocument<T extends { id: string }>(list: T[], incoming: T): T[] {
  return [incoming, ...list.filter((entry) => entry.id !== incoming.id)];
}
