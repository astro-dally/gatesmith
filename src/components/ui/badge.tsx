import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-panel-2 text-muted border border-line',
        accent: 'bg-accent-soft text-accent',
        success: 'bg-high-soft text-high',
        warning: 'bg-warn-soft text-warn',
        error: 'bg-err-soft text-err',
        kw: 'bg-[color-mix(in_srgb,var(--syn-kw)_14%,transparent)] text-syn-kw',
        const: 'bg-[color-mix(in_srgb,var(--syn-const)_14%,transparent)] text-syn-const',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
