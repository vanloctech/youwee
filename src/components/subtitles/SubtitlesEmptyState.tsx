import { Subtitles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SubtitlesQuickActions } from './SubtitlesQuickActions';

interface SubtitlesEmptyStateProps {
  onOpenFile: () => void;
  onDownloadFromUrl: () => void;
  onCreateNew: () => void;
  onGenerateWithWhisper: () => void;
}

export function SubtitlesEmptyState({
  onOpenFile,
  onDownloadFromUrl,
  onCreateNew,
  onGenerateWithWhisper,
}: SubtitlesEmptyStateProps) {
  const { t } = useTranslation('subtitles');

  return (
    <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6 overflow-auto">
      <div className="h-full p-2 sm:p-3">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Subtitles className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold">{t('emptyState.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('emptyState.description')}</p>
            <p className="text-xs text-muted-foreground">{t('emptyState.hint')}</p>
          </div>

          <SubtitlesQuickActions
            variant="grid"
            onOpenFile={onOpenFile}
            onDownloadFromUrl={onDownloadFromUrl}
            onCreateNew={onCreateNew}
            onGenerateWithWhisper={onGenerateWithWhisper}
          />
        </div>
      </div>
    </div>
  );
}
