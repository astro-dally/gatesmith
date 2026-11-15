import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, GraduationCap, X } from 'lucide-react'
import type { CompileResult } from '@/compiler/pipeline'
import type { PhaseName } from '@/compiler/errors'
import { explainPhase } from '@/lib/explain'
import { PHASE_META, phaseIndex } from '@/lib/phases'
import { Button } from './ui/button'
import { Tip } from './ui/tooltip'
import { cn } from '@/lib/utils'

interface Props {
  result: CompileResult
  phase: PhaseName
  onPhase: (p: PhaseName) => void
  onClose: () => void
}

/** Viva-demo mode: walk the pipeline one phase at a time with a plain-English narration. */
export function StepThrough({ result, phase, onPhase, onClose }: Props) {
  const i = phaseIndex(phase)
  const meta = PHASE_META[i]
  const ex = explainPhase(phase, result)
  const status = result[phase].status
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      className="panel relative border-accent/40 bg-accent-soft/40 px-4 py-3" role="region" aria-label="Step-through explanation" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <GraduationCap className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[12px] font-medium text-accent">Step {i + 1} of {PHASE_META.length} · {meta.title}</span>
            <span className={cn('text-[14px] font-semibold', status === 'error' ? 'text-err' : status === 'skipped' ? 'text-muted' : 'text-fg')}>{ex.headline}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={phase} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <p className="mt-1 max-w-[78ch] text-[13px] leading-relaxed text-fg/90">{ex.body}</p>
              <p className="mt-1.5 text-[12.5px] text-muted">{ex.concept}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tip label="Previous phase" shortcut="Alt+←">
            <Button size="sm" variant="secondary" disabled={i === 0} onClick={() => onPhase(PHASE_META[i - 1].id)}><ChevronLeft />Prev</Button>
          </Tip>
          <Tip label="Next phase" shortcut="Alt+→">
            <Button size="sm" variant="primary" disabled={i === PHASE_META.length - 1} onClick={() => onPhase(PHASE_META[i + 1].id)}>Next<ChevronRight /></Button>
          </Tip>
          <Tip label="Exit step-through">
            <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Exit step-through"><X /></Button>
          </Tip>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {PHASE_META.map((m, j) => (
          <span key={m.id} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', j <= i ? 'bg-accent' : 'bg-panel-3')} />
        ))}
      </div>
    </motion.div>
  )
}
