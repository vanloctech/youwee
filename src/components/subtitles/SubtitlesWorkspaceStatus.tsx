import { CheckCircle2, CircleDot, FileText, Rows3, Tag, TextCursorInput } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface SubtitlesWorkspaceStatusProps {
  fileName: string | null;
  isDirty: boolean;
  entryCount: number;
  selectedCount: number;
  format: string;
}

function Chip({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs bg-muted/60 text-muted-foreground',
        className,
      )}
      title={`${label}: ${value}`}
    >
      {icon}
      <span className="font-medium">{label}:</span>
      <span className="text-foreground truncate max-w-[220px]">{value}</span>
    </span>
  );
}

export function SubtitlesWorkspaceStatus({
  fileName,
  isDirty,
  entryCount,
  selectedCount,
  format,
}: SubtitlesWorkspaceStatusProps) {
  const { t } = useTranslation('subtitles');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip
        icon={<FileText className="w-3.5 h-3.5" />}
        label={t('workspace.file')}
        value={fileName || t('workspace.newFile')}
      />
      <Chip
        icon={<Rows3 className="w-3.5 h-3.5" />}
        label={t('workspace.entries')}
        value={String(entryCount)}
      />
      {selectedCount > 0 && (
        <Chip
          icon={<TextCursorInput className="w-3.5 h-3.5" />}
          label={t('workspace.selected')}
          value={String(selectedCount)}
          className="bg-primary/10 text-primary dark:text-primary"
        />
      )}
      <Chip
        icon={<Tag className="w-3.5 h-3.5" />}
        label={t('workspace.format')}
        value={format.toUpperCase()}
      />
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
          isDirty
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        )}
      >
        {isDirty ? <CircleDot className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        {isDirty ? t('workspace.unsaved') : t('workspace.saved')}
      </span>
    </div>
  );
}
