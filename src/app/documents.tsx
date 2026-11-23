import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { documents as documentsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { keys } from '@/api/queryKeys';
import { uploadDocument, type UploadAsset } from '@/api/upload';
import type { Document, UploadProgress } from '@/api/types';
import { useT } from '@/i18n/useT';
import { confirmDestructive } from '@/lib/confirm';
import {
  adoptDocument,
  documentMeta,
  formatBytes,
  progressPercent,
  rejectionFor,
} from '@/lib/documents';
import { formatDate } from '@/lib/time';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListRow, SectionCard } from '@/ui/Card';
import { ProgressBar } from '@/ui/ProgressBar';

type Notice = { tone: 'error' | 'success'; message: string } | null;

/**
 * `/documents` (DESIGN §5.10, DOCUMENTS.md).
 *
 * Upload a PDF once, then ask about it in chat. There is deliberately **no
 * search field**: searching is the model's job through the document tools, and
 * this screen exists only to get files in and out.
 */
export default function DocumentsScreen() {
  const { t, locale } = useT();
  const theme = useAppTheme();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<Notice>(null);
  const [picked, setPicked] = useState<UploadAsset | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const listQuery = useQuery({
    queryKey: keys.documents,
    queryFn: () => documentsApi.list(),
  });

  const documents = listQuery.data?.documents ?? [];

  const handlePick = useCallback(async () => {
    setNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // `copyToCacheDirectory` is on by default, which is what lets
        // expo-file-system read the picked file immediately (picker docs).
        type: 'application/pdf',
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const rejection = rejectionFor(asset);
      if (rejection) {
        setPicked(null);
        setNotice({
          tone: 'error',
          message: rejection === 'tooLarge' ? t('tooLarge') : t('notPdf'),
        });
        return;
      }

      setPicked({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        file: asset.file,
      });
    } catch (error) {
      setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) });
    }
  }, [t]);

  const upload = useMutation({
    mutationFn: (asset: UploadAsset) =>
      uploadDocument(asset, { onProgress: (next) => setProgress(next) }),
    onSuccess: (outcome) => {
      // Adopt `done.document` rather than refetching the list (DOCUMENTS.md §4.3).
      queryClient.setQueryData<{ documents: Document[] }>(keys.documents, (previous) => ({
        documents: adoptDocument(previous?.documents ?? [], outcome.document),
      }));
      setPicked(null);
      setProgress(null);
      setNotice({
        tone: 'success',
        message: outcome.kind === 'duplicate' ? t('duplicate') : t('uploaded'),
      });
    },
    onError: (error) => {
      setProgress(null);
      setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) });
    },
  });

  const remove = useCallback(
    (document: Document) => {
      confirmDestructive({
        title: t('confirmDeleteDoc'),
        message: t('confirmDeleteDocMessage'),
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void documentsApi
            .remove(document.id)
            .then(() => {
              setNotice({ tone: 'success', message: t('removedDoc') });
              void queryClient.invalidateQueries({ queryKey: keys.documents });
            })
            .catch((error) =>
              setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
            );
        },
      });
    },
    [queryClient, t],
  );

  const stageLabel = progress
    ? progress.stage === 'extracting'
      ? t('stageExtracting')
      : progress.stage === 'chunking'
        ? t('stageChunking')
        : t('stageIndexing')
    : null;

  return (
    <AppShell showBack badge={t('navDocs')}>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        {notice ? <InlineAlert tone={notice.tone} message={notice.message} /> : null}

        <SectionCard title={t('addPdfTitle')} hint={t('documentsHint')}>
          <View style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
              <Button
                variant="secondary"
                label={t('pickFile')}
                icon="upload-file"
                onPress={() => void handlePick()}
                disabled={upload.isPending}
                testID="documents-pick"
              />
              {picked ? (
                <AppText variant="meta" color={theme.textMeta} style={{ flex: 1 }}>
                  {`${picked.name} · ${formatBytes(picked.size)}`}
                </AppText>
              ) : null}
            </View>

            {picked ? (
              <Button
                label={upload.isPending ? t('uploading') : t('upload')}
                icon="cloud-upload"
                onPress={() => {
                  setNotice(null);
                  setProgress(null);
                  upload.mutate(picked);
                }}
                busy={upload.isPending}
                testID="documents-upload"
              />
            ) : null}

            {progress && stageLabel ? (
              <ProgressBar
                label={stageLabel}
                percent={progressPercent(progress.done, progress.total)}
                detail={progress.total > 0 ? `${progress.done} / ${progress.total}` : undefined}
                testID="documents-progress"
              />
            ) : null}
          </View>
        </SectionCard>

        <SectionCard title={t('documentsTitle')}>
          {listQuery.isError ? (
            <InlineAlert
              tone="error"
              message={errorMessage(listQuery.error, t('loadFailedDocs'))}
            />
          ) : null}

          {documents.length === 0 && !listQuery.isError ? (
            <EmptyState message={t('emptyDocs')} />
          ) : (
            documents.map((document) => (
              <ListRow
                key={document.id}
                title={document.name}
                meta={documentMeta(
                  document,
                  {
                    page: t('page'),
                    pages: t('pages'),
                    passage: t('passage'),
                    passages: t('passages'),
                  },
                  formatDate(document.created_at, locale),
                )}
                action={
                  <Button variant="text" label={t('remove')} onPress={() => remove(document)} />
                }
              />
            ))
          )}
        </SectionCard>
      </ScrollView>
    </AppShell>
  );
}
