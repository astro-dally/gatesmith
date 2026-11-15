import { motion } from 'framer-motion'
import { AlertTriangle, Check, MinusCircle, X } from 'lucide-react'
import type { CompileResult, PhaseStatus } from '@/compiler/pipeline'
import type { PhaseName } from '@/compiler/errors'
import { PHASE_META } from '@/lib/phases'
import { cn, formatMs } from '@/lib/utils'
import { Tip } from './ui/tooltip'

const STATUS: Record<PhaseStatus, { label: string; ring: string; text: string; icon: typeof Check }> = {
  success: { label: 'Success', ring: 'border-high text-high bg-high-soft', text: 'text-high', icon: Check },
  warning: { label: 'Warnings', ring: 'border-warn text-warn bg-warn-soft', text: 'text-warn', icon: AlertTriangle },
  error: { label: 'Errors', ring: 'border-err text-err bg-err-soft', text: 'text-err', icon: X },
  skipped: { label: 'Skipped', ring: 'border-line-strong text-faint bg-panel-2', text: 'text-faint', icon: MinusCircle },
}

interface Props {
  result: CompileResult
  selected: PhaseName
  onSelect: (p: PhaseName) => void
  pending: boolean
}

export function PipelineStepper({ result, selected, onSelect, pending }: Props) {
  return (
    <nav aria-label="Compiler phases" className="relative">
      <ol className="grid grid-cols-6 gap-0">
        {PHASE_META.map((m, i) => {
          const phase = result[m.id]
          const s = STATUS[phase.status]
          const Icon = s.icon
          const active = selected === m.id
          const n = phase.diagnostics.length
          const nextStatus = i < PHASE_META.length - 1 ? result[PHASE_META[i + 1].id].status : null
          return (
            <li key={m.id} className="relative flex min-w-0 flex-col items-center">
              {/* Trace line to the next phase: lit when data flowed through. */}
              {nextStatus && (
                <span
                  aria-hidden
                  className={cn('absolute left-[calc(50%+17px)] right-[calc(-50%+17px)] top-[17px] h-[2px] rounded-full transition-colors duration-300',
                    nextStatus === 'skipped' ? 'bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_4px,transparent_4px_8px)]'
                      : 'bg-high/70')}
                />
              )}
              <Tip label={`${m.title}: ${m.blurb}. ${s.label}${n ? `, ${n} problem${n > 1 ? 's' : ''}` : ''}.`} shortcut={`Alt+${i + 1}`}>
                <button
                  onClick={() => onSelect(m.id)}
                  data-phase={m.id}
                  data-status={phase.status}
                  aria-current={active ? 'step' : undefined}
                  className="group relative flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-1 pb-1.5 pt-0 outline-none"
                >
                  <span className={cn('relative z-10 flex size-[34px] items-center justify-center rounded-full border-[1.5px] text-[13px] font-semibold transition-all duration-300',
                    s.ring, active && 'ring-4 ring-accent/25', pending && 'animate-pulse')}>
                    {phase.status === 'success' ? <span className="tabular">{i + 1}</span> : <Icon className="size-4" strokeWidth={2.5} />}
                  </span>
                  <span className={cn('max-w-full truncate text-[11px] font-medium transition-colors sm:text-[12.5px]', active ? 'text-fg' : 'text-muted group-hover:text-fg')}>
                    {m.title}
                  </span>
                  <span className={cn('tabular h-4 max-w-full truncate font-mono text-[9.5px] sm:text-[10.5px]', s.text)}>
                    {phase.status === 'skipped' ? 'skipped' : n ? `${n} · ${formatMs(phase.timeMs)}` : formatMs(phase.timeMs)}
                  </span>
                  {active && (
                    <motion.span layoutId="phase-underline" className="absolute -bottom-[9px] h-[2px] w-10 rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                  )}
                </button>
              </Tip>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
