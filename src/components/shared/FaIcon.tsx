import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type FontAwesomeIconProps = Omit<ComponentProps<typeof FontAwesomeIcon>, 'icon'>;

interface FaIconProps extends FontAwesomeIconProps {
  icon: IconDefinition;
}

export function FaIcon({ icon, className, ...props }: FaIconProps) {
  return (
    <FontAwesomeIcon
      icon={icon}
      className={cn('inline-block align-[-0.125em]', className)}
      aria-hidden="true"
      {...props}
    />
  );
}
