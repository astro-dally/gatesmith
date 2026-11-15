import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, CircleCheck, CircleX, Lightbulb } from 'lucide-react'
import type { Diagnostic } from '@/compiler/errors'
import { CODES } from '@/compiler/errors'
import { PHASE_META } from '@/lib/phases'
import { cn } from '@/lib/utils'

interface Props {
  diagnostics: Diagnostic[]
  open: boolean
  onToggle: () => void
  onJump: (d: Diagnostic) => void
  onHover: (d: Diagnostic | null) => void
}

export function ProblemsPanel({ diagnostics, open, onToggle, onJump, onHover }: Props) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  return (
    <section className="panel flex min-h-0 flex-col" aria-label="Problems" data-errors={errors} data-warnings={warnings}>
      <button onClick={onToggle} aria-expanded={open}
        className="flex h-10 shrink-0 items-center gap-3 px-3.5 text-left">
        <span className="text-[13px] font-semibold">Problems</span>
        <span className={cn('flex items-center gap-1 text-[12.5px]', errors ? 'text-err' : 'text-faint')}><CircleX className="size-3.5" />{errors}</span>
        <span className={cn('flex items-center gap-1 text-[12.5px]', warnings ? 'text-warn' : 'text-faint')}><AlertTriangle className="size-3.5" />{warnings}</span>
        {diagnostics.length > 0 && !open && (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
            <span className="font-mono">{diagnostics[0].code}</span> {diagnostics[0].message}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-faint">
          <kbd className="hidden rounded border border-line px-1 font-mono sm:inline">Alt+P</kbd>
          <ChevronDown className={cn('size-4 transition-transform', !open && 'rotate-180')} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.18 }}
            className="min-h-0 overflow-hidden border-t border-line">
            <div className="max-h-[min(30vh,240px)] overflow-auto">
              {diagnostics.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted">
                  <CircleCheck className="size-4 text-high" /> No problems. Every phase finished cleanly.
                </div>
              ) : (
                <ul role="list">
                  {diagnostics.map((d, i) => (
                    <li key={i}>
                      <button
                        onClick={() => onJump(d)}
                        onMouseEnter={() => onHover(d)}
                        onMouseLeave={() => onHover(null)}
                        className="grid w-full grid-cols-[18px_52px_1fr_auto] items-start gap-x-2.5 border-b border-line/60 px-3.5 py-2 text-left transition-colors hover:bg-panel-2"
                      >
                        {d.severity === 'error'
                          ? <CircleX className="mt-0.5 size-4 text-err" aria-label="Error" />
                          : <AlertTriangle className="mt-0.5 size-4 text-warn" aria-label="Warning" />}
                        <span className={cn('mt-px font-mono text-[12px] font-medium', d.severity === 'error' ? 'text-err' : 'text-warn')} title={CODES[d.code as keyof typeof CODES]}>{d.code}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px]">{d.message}</span>
                          {d.suggestion && (
                            <span className="mt-0.5 flex items-start gap-1.5 text-[12.5px] text-muted">
                              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent" />{d.suggestion}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="tabular font-mono text-[12px] text-muted">{d.span.line}:{d.span.col}</span>
                          <span className="text-[11px] text-faint">{PHASE_META.find((m) => m.id === d.phase)?.title}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
