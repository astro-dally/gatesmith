import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

/** Convenience wrapper: <Tip label="..."><button/></Tip> */
export function Tip({ label, children, side = 'bottom', shortcut }: {
  label: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  shortcut?: string
}) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn('z-50 rounded-md border border-line-strong bg-panel px-2 py-1 text-xs text-fg shadow-soft',
            'data-[state=delayed-open]:animate-in flex items-center gap-2')}
        >
          {label}
          {shortcut && <kbd className="rounded border border-line bg-panel-2 px-1 font-mono text-[10px] text-muted">{shortcut}</kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
