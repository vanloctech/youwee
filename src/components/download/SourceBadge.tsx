import { detectSource } from '@/lib/sources';
import { cn } from '@/lib/utils';

interface SourceBadgeProps {
  extractor?: string;
  className?: string;
}

export function SourceBadge({ extractor, className }: SourceBadgeProps) {
  const source = detectSource(extractor);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium',
        'bg-muted/50',
        source.color,
        className,
      )}
    >
      <i className={cn('fa', source.faIcon, 'text-[11px]')} aria-hidden="true" />
      <span>{source.label}</span>
    </span>
  );
}
