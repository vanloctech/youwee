import { FilePlus, FileUp, Globe, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type QuickActionsVariant = 'compact' | 'grid';

interface SubtitlesQuickActionsProps {
  variant?: QuickActionsVariant;
  onOpenFile: () => void;
  onDownloadFromUrl: () => void;
  onCreateNew: () => void;
  onGenerateWithWhisper: () => void;
}

interface QuickActionItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent?: 'primary' | 'ai';
}

export function SubtitlesQuickActions({
  variant = 'compact',
  onOpenFile,
  onDownloadFromUrl,
  onCreateNew,
  onGenerateWithWhisper,
}: SubtitlesQuickActionsProps) {
  const { t } = useTranslation('subtitles');

  const items: QuickActionItem[] = [
    {
      id: 'open-file',
      label: t('emptyState.openFile'),
      hint: t('quickActions.openHint'),
      icon: <FileUp className="w-4 h-4" />,
      onClick: onOpenFile,
      accent: 'primary',
    },
    {
      id: 'download-url',
      label: t('emptyState.downloadFromUrl'),
      hint: t('quickActions.downloadHint'),
      icon: <Globe className="w-4 h-4" />,
      onClick: onDownloadFromUrl,
    },
    {
      id: 'create-new',
      label: t('emptyState.createNew'),
      hint: t('quickActions.createHint'),
      icon: <FilePlus className="w-4 h-4" />,
      onClick: onCreateNew,
    },
    {
      id: 'whisper',
      label: t('toolbar.whisper'),
      hint: t('quickActions.whisperHint'),
      icon: <Mic className="w-4 h-4" />,
      onClick: onGenerateWithWhisper,
      accent: 'ai',
    },
  ];

  if (variant === 'grid') {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">{t('quickActions.title')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('quickActions.description')}</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                'rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors',
                'hover:bg-accent/40',
                item.accent === 'primary' &&
                  'border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary',
                item.accent === 'ai' &&
                  'border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400',
                !item.accent && 'border-border/70 text-foreground',
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{item.hint}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-background to-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('quickActions.title')}</p>
          <p className="text-xs text-muted-foreground">{t('quickActions.description')}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium transition-colors',
              'hover:bg-accent/40',
              item.accent === 'primary' &&
                'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10',
              item.accent === 'ai' &&
                'border-purple-500/40 bg-purple-500/5 text-purple-600 hover:bg-purple-500/10 dark:text-purple-400',
              !item.accent && 'border-border/70 text-muted-foreground hover:text-foreground',
            )}
            title={item.hint}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
