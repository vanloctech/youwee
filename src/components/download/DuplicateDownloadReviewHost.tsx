import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { useDownload } from '@/contexts/download-context';
import { DuplicateDownloadDialog } from './DuplicateDownloadDialog';

export function DuplicateDownloadReviewHost() {
  const { t } = useTranslation('download');
  const toast = useToast();
  const {
    duplicateReview,
    duplicateSkipNotice,
    resolveDuplicateReview,
    dismissDuplicateSkipNotice,
  } = useDownload();

  useEffect(() => {
    if (!duplicateSkipNotice) return;
    toast.info({
      title: t('duplicates.skippedToastTitle'),
      message: t('duplicates.skippedToastMessage', { count: duplicateSkipNotice.count }),
    });
    dismissDuplicateSkipNotice();
  }, [dismissDuplicateSkipNotice, duplicateSkipNotice, t, toast]);

  return <DuplicateDownloadDialog review={duplicateReview} onResolve={resolveDuplicateReview} />;
}
