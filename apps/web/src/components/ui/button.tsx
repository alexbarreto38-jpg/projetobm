import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-wise-yellow text-black hover:bg-wise-yellowDim',
        outline: 'border border-wise-border text-wise-text hover:bg-wise-surface',
        ghost: 'text-wise-muted hover:text-wise-text hover:bg-wise-surface',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
