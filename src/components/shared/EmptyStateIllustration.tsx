import { type LucideIcon, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateIllustrationProps {
  icon?: LucideIcon;
  className?: string;
  isActive?: boolean;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: {
    frame: 'h-24 w-36',
    backCard: 'h-16 w-24',
    frontCard: 'h-16 w-28',
    badge: 'h-8 w-8',
    icon: 'h-3.5 w-3.5',
  },
  md: {
    frame: 'h-28 w-40',
    backCard: 'h-20 w-28',
    frontCard: 'h-20 w-32',
    badge: 'h-9 w-9',
    icon: 'h-4 w-4',
  },
};

export function EmptyStateIllustration({
  icon: Icon = Search,
  className,
  isActive = false,
  size = 'md',
}: EmptyStateIllustrationProps) {
  const classes = sizeClasses[size];

  return (
    <div className={cn('relative', classes.frame, className)}>
      <div
        className={cn(
          'absolute left-2 top-5 -rotate-6 rounded-2xl border border-border/60 bg-background/70 shadow-sm backdrop-blur-sm',
          classes.backCard,
        )}
      >
        <div className="absolute left-4 top-4 h-2.5 w-14 rounded-full bg-muted-foreground/10" />
        <div className="absolute left-4 top-9 h-2 w-20 rounded-full bg-muted-foreground/10" />
        <div className="absolute bottom-3 left-4 h-2 w-10 rounded-full bg-muted-foreground/10" />
      </div>

      <div
        className={cn(
          'absolute right-2 top-2 rotate-3 rounded-2xl border border-primary/20 bg-primary/10 shadow-lg shadow-primary/10 backdrop-blur-sm',
          classes.frontCard,
        )}
      >
        <div className="absolute inset-x-3 top-3 aspect-video rounded-xl bg-background/70 shadow-inner" />
        <div
          className={cn(
            'absolute right-4 top-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25',
            classes.badge,
          )}
        >
          {isActive && (
            <span className="absolute inset-0 rounded-full border border-primary-foreground/40 animate-ping" />
          )}
          <Icon className={classes.icon} />
        </div>
        <div className="absolute bottom-4 left-4 h-2 w-16 rounded-full bg-primary/20" />
        <div className="absolute bottom-8 left-4 h-2 w-10 rounded-full bg-primary/15" />
      </div>

      <div className="absolute bottom-1 left-1/2 h-3 w-24 -translate-x-1/2 rounded-full bg-primary/10 blur-md" />
    </div>
  );
}
