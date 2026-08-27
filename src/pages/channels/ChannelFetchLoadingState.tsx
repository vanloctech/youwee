import { Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { cn } from '@/lib/utils';

type ChannelFetchProgress = {
  fetched: number;
  limit?: number | null;
};

type ChannelFetchLoadingStateProps = {
  progress?: ChannelFetchProgress | null;
};

export function ChannelFetchLoadingState({ progress }: ChannelFetchLoadingStateProps) {
  const { t } = useTranslation('channels');
  const progressText = progress
    ? progress.limit
      ? `${progress.fetched}/${progress.limit}`
      : String(progress.fetched)
    : null;

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <EmptyStateIllustration className="mb-5" icon={Tv} size="sm" isActive />
      <div className="mt-1 w-full max-w-sm rounded-xl border border-primary/15 bg-primary/5 p-3 text-start shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t('fetching')}
          </div>
          {progressText && (
            <span className="rounded bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {progressText}
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
              <span
                className={cn(
                  'h-2 rounded-full bg-[linear-gradient(90deg,hsl(var(--muted)),hsl(var(--primary)/0.28),hsl(var(--muted)))] bg-[length:200%_100%] animate-shimmer',
                  index === 0 && 'w-11/12',
                  index === 1 && 'w-8/12',
                  index === 2 && 'w-10/12',
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
