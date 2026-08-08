import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-wise-border text-wise-muted',
        success: 'bg-green-500/15 text-green-400',
        warning: 'bg-wise-yellow/15 text-wise-yellow',
        danger: 'bg-red-500/15 text-red-400',
        info: 'bg-blue-500/15 text-blue-400',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Mapeia estados de status para o tom do badge. */
export function statusTone(status: string): NonNullable<BadgeProps['tone']> {
  const s = status.toUpperCase();
  if (['APPROVED', 'CONNECTED', 'SENT', 'DELIVERED', 'READ', 'COMPLETED', 'ACTIVE'].includes(s))
    return 'success';
  if (['PENDING', 'QUEUED', 'SUBMITTED', 'RUNNING', 'PROCESSING', 'SCHEDULED', 'WARNING'].includes(s))
    return 'warning';
  if (['REJECTED', 'ERROR', 'FAILED', 'EXPIRED', 'REVOKED', 'BLOCKED', 'DISABLED'].includes(s))
    return 'danger';
  return 'neutral';
}
