import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  id?: string;
  title: string;
  description?: string;
  icon: ReactNode;
  iconClassName?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  id,
  title,
  description,
  icon,
  iconClassName,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section id={id} className={cn('space-y-4', className)}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'p-2 rounded-xl shadow-lg',
            iconClassName || 'bg-gradient-to-br from-gray-500 to-gray-600 shadow-gray-500/20',
          )}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface SettingsCardProps {
  id?: string;
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}

export function SettingsCard({ id, children, className, highlight }: SettingsCardProps) {
  return (
    <div
      id={id}
      className={cn(
        'p-4 rounded-xl bg-muted/30 transition-all duration-500',
        highlight && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SettingsRowProps {
  id?: string;
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
  highlight?: boolean;
  controlClassName?: string;
}

export function SettingsRow({
  id,
  label,
  description,
  children,
  className,
  highlight,
  controlClassName,
}: SettingsRowProps) {
  return (
    <div
      id={id}
      className={cn(
        'flex flex-col items-start gap-3 py-2 transition-all duration-500 rounded-lg px-2 -mx-2 md:flex-row md:items-center md:justify-between',
        highlight && 'bg-primary/10 ring-1 ring-primary/30',
        className,
      )}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className={cn('w-full md:w-auto md:shrink-0', controlClassName)}>{children}</div>
    </div>
  );
}

interface SettingsDividerProps {
  className?: string;
}

export function SettingsDivider({ className }: SettingsDividerProps) {
  return (
    <div
      className={cn('h-px bg-gradient-to-r from-transparent via-border to-transparent', className)}
    />
  );
}
