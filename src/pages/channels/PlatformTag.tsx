import { cn } from '@/lib/utils';

type PlatformTagProps = {
  platform: string;
  size?: 'sm' | 'xs';
};

export function PlatformTag({ platform, size = 'sm' }: PlatformTagProps) {
  const config: Record<string, { label: string; className: string }> = {
    youtube: {
      label: 'YouTube',
      className: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
    bilibili: {
      label: 'Bilibili',
      className: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
    },
    youku: {
      label: 'Youku',
      className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    tiktok: {
      label: 'TikTok',
      className: 'bg-foreground/5 text-foreground border-foreground/15',
    },
  };

  const item = config[platform];
  if (!item) return null;

  const sizeClass = size === 'xs' ? 'text-[9px] px-1 py-px' : 'text-[10px] px-1.5 py-0.5';

  return (
    <span
      className={cn(
        'flex-shrink-0 rounded border font-medium leading-none',
        sizeClass,
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}
