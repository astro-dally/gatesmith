import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
        secondary: 'bg-panel-2 text-fg border border-line hover:bg-panel-3',
        ghost: 'text-muted hover:text-fg hover:bg-panel-2',
        outline: 'border border-line text-fg hover:bg-panel-2',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'
