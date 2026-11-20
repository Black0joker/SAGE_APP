import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Writes a JSON payload to a file and hands it to the share sheet. This replaces
 * the browser `Content-Disposition: attachment` download on native (DESIGN §5.6).
 *
 * On web `expo-file-system` is not supported at all, so the export falls back to
 * a Blob download — the closest native equivalent of the web app's behaviour.
 */
export async function saveJsonToFile(filename: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  if (Platform.OS === 'web') {
    downloadBlob(filename, json);
    return;
  }

  const file = new File(Paths.cache, filename);

  if (file.exists) file.delete();
  file.create();
  await file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: filename,
      UTI: 'public.json',
    });
    return;
  }

  // No share sheet (rare): fall back to the platform preview.
  await File.preview(file);
}

function downloadBlob(filename: string, contents: string): void {
  if (typeof document === 'undefined') {
    throw new Error('File export is not available in this environment.');
  }
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
