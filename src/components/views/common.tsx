import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('panel overflow-hidden', className)}>
      {(title || aside) && (
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {aside && <div className="flex items-center gap-2">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'high' | 'accent' | 'warn' | 'err' }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('tabular text-[15px] font-semibold', tone && `text-${tone}`)}>{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl border border-line bg-panel-2 text-muted [&_svg]:size-5">{icon}</div>
      <div className="text-[14px] font-medium">{title}</div>
      {children && <div className="max-w-md text-[13px] text-muted">{children}</div>}
    </div>
  )
}

export const th = 'sticky top-0 z-[1] bg-panel-2/95 backdrop-blur px-3 py-2 text-left text-[11.5px] font-medium text-muted border-b border-line'
export const td = 'px-3 py-1.5 border-b border-line/60'
