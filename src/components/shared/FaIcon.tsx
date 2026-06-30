import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type FontAwesomeIconProps = Omit<ComponentProps<typeof FontAwesomeIcon>, 'icon'>;

interface FaIconProps extends FontAwesomeIconProps {
  icon: IconDefinition;
}

export function FaIcon({ icon, className, style, ...props }: FaIconProps) {
  return (
    <FontAwesomeIcon
      icon={icon}
      className={cn('inline-block h-[1em] w-[1em] shrink-0 align-[-0.125em]', className)}
      style={{ width: '1em', height: '1em', ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}
