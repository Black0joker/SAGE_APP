import {
  MAX_UPLOAD_BYTES,
  adoptDocument,
  documentMeta,
  formatBytes,
  isPdf,
  progressPercent,
  rejectionFor,
  safeFileName,
} from '../documents';

describe('formatBytes', () => {
  it('keeps small values in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('uses one decimal below ten and none above', () => {
    expect(formatBytes(2411724)).toBe('2.3 MB');
    expect(formatBytes(128 * 1024 * 1024)).toBe('128 MB');
  });

  it('survives junk input', () => {
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('isPdf', () => {
  it('accepts the PDF mime type', () => {
    expect(isPdf({ mimeType: 'application/pdf', name: 'lease.pdf' })).toBe(true);
  });

  it('accepts a .pdf extension when the mime type is missing', () => {
    expect(isPdf({ mimeType: null, name: 'Lease.PDF' })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isPdf({ mimeType: 'image/png', name: 'scan.png' })).toBe(false);
    expect(isPdf({})).toBe(false);
  });
});

describe('rejectionFor', () => {
  it('rejects a non-PDF before any request', () => {
    expect(rejectionFor({ name: 'notes.txt', mimeType: 'text/plain', size: 10 })).toBe('notPdf');
  });

  it('rejects a PDF over the 20 MB cap', () => {
    expect(rejectionFor({ name: 'big.pdf', size: MAX_UPLOAD_BYTES + 1 })).toBe('tooLarge');
  });

  it('accepts a PDF at exactly the cap', () => {
    expect(rejectionFor({ name: 'edge.pdf', size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it('accepts a PDF whose size the picker did not report', () => {
    expect(rejectionFor({ name: 'lease.pdf', size: null })).toBeNull();
  });
});

describe('progressPercent', () => {
  it('is indeterminate when the total is not known yet', () => {
    // DOCUMENTS.md: `total: 0` means "not counted", never 0%.
    expect(progressPercent(0, 0)).toBeNull();
    expect(progressPercent(12, 0)).toBeNull();
  });

  it('reports a real percentage when the total is known', () => {
    expect(progressPercent(12, 300)).toBe(4);
    expect(progressPercent(300, 300)).toBe(100);
    expect(progressPercent(0, 300)).toBe(0);
  });

  it('clamps hostile values instead of overflowing the bar', () => {
    expect(progressPercent(600, 300)).toBe(100);
    expect(progressPercent(Number.NaN, 300)).toBe(0);
  });
});

describe('documentMeta', () => {
  const labels = { page: 'page', pages: 'pages', passage: 'passage', passages: 'passages' };

  it('joins pages, passages, size and date', () => {
    expect(
      documentMeta({ page_count: 12, chunk_count: 34, size_bytes: 2411724 }, labels, 'Nov 23, 2026'),
    ).toBe('12 pages · 34 passages · 2.3 MB · Nov 23, 2026');
  });

  it('singularises a one-page document', () => {
    expect(documentMeta({ page_count: 1, chunk_count: 1, size_bytes: 900 }, labels, '')).toBe(
      '1 page · 1 passage · 900 B',
    );
  });
});

describe('safeFileName', () => {
  it('strips a path down to the basename', () => {
    expect(safeFileName('/var/tmp/Lease.pdf')).toBe('Lease.pdf');
    expect(safeFileName('C:\\Users\\me\\Lease.pdf')).toBe('Lease.pdf');
  });

  it('falls back when the name is empty', () => {
    expect(safeFileName('')).toBe('document.pdf');
    expect(safeFileName(null)).toBe('document.pdf');
  });

  it('drops control characters and caps the length', () => {
    expect(safeFileName('a\u0000b.pdf')).toBe('ab.pdf');
    expect(safeFileName(`${'x'.repeat(400)}.pdf`)).toHaveLength(200);
  });
});

describe('adoptDocument', () => {
  it('prepends the new document', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(adoptDocument(list, { id: 'c' }).map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('dedupes by id instead of showing the same file twice', () => {
    // A duplicate upload answers 200 with the existing row.
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(adoptDocument(list, { id: 'b' }).map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});
