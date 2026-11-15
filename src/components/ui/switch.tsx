import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-line-strong transition-colors',
      'data-[state=checked]:bg-accent data-[state=checked]:border-transparent data-[state=unchecked]:bg-panel-3',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-[1px]" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
