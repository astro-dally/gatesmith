import { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, CircleX, FileQuestion, Lightbulb } from 'lucide-react'
import type { CompileResult } from '@/compiler/pipeline'
import type { Diagnostic, PhaseName } from '@/compiler/errors'
import { PHASE_META, phaseIndex } from '@/lib/phases'
import { Skeleton } from './ui/skeleton'
import { Badge } from './ui/badge'
import { Empty } from './views/common'
import { formatMs } from '@/lib/utils'

const TokensView = lazy(() => import('./views/TokensView'))
const AstView = lazy(() => import('./views/AstView'))
const SymbolsView = lazy(() => import('./views/SymbolsView'))
const IrView = lazy(() => import('./views/IrView'))
const OptimizerView = lazy(() => import('./views/OptimizerView'))
const OutputView = lazy(() => import('./views/OutputView'))

function ViewSkeleton() {
  return (
    <div className="space-y-3 p-1" aria-busy="true" aria-label="Loading view">
      <div className="flex gap-4"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-28" /></div>
      <div className="panel space-y-2.5 p-4">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-4" />)}
      </div>
    </div>
  )
}

const STATUS_TONE = { success: 'success', warning: 'warning', error: 'error', skipped: 'neutral' } as const

interface Props {
  result: CompileResult
  phase: PhaseName
  onJump: (d: Diagnostic) => void
  onPhase: (p: PhaseName) => void
  irFitKey: string
  circuitFitKey: string
}

export function PhasePanel({ result, phase, onJump, onPhase, irFitKey, circuitFitKey }: Props) {
  const meta = PHASE_META[phaseIndex(phase)]
  const r = result[phase]
  const errors = r.diagnostics.filter((d) => d.severity === 'error')
  const blocker = PHASE_META.find((m) => result[m.id].status === 'error')
  const Icon = meta.icon

  let body: React.ReactNode
  if (r.status === 'skipped') {
    body = (
      <Empty icon={<Ban />} title={`${meta.title} was skipped`}>
        The {blocker?.title ?? 'previous'} phase reported {result[blocker?.id ?? 'lexer'].diagnostics.filter((d) => d.severity === 'error').length} error(s),
        so this phase did not run. Later phases never see broken input.
        {blocker && (
          <div className="mt-4 flex justify-center gap-2">
            <button className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-[13px] text-fg hover:bg-panel-3" onClick={() => onPhase(blocker.id)}>
              Open {blocker.title}
            </button>
            <button className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:brightness-110"
              onClick={() => { const d = result.diagnostics.find((x) => x.severity === 'error'); if (d) onJump(d) }}>
              Go to first error
            </button>
          </div>
        )}
      </Empty>
    )
  } else if (!r.data) {
    body = <Empty icon={<CircleX />} title="This phase failed">{errors[0]?.message}</Empty>
  } else {
    switch (phase) {
      case 'lexer': body = <TokensView data={result.lexer.data!} />; break
      case 'parser': body = <AstView program={result.parser.data!.program} />; break
      case 'semantic': body = <SymbolsView data={result.semantic.data!} />; break
      case 'ir': body = <IrView data={result.ir.data!} fitKey={irFitKey} />; break
      case 'optimizer': body = <OptimizerView data={result.optimizer.data!} />; break
      case 'codegen':
        body = result.codegen.data!.truthTable.outputs.length === 0
          ? <Empty icon={<FileQuestion />} title="Nothing to generate yet">Declare an output and assign it, for example <code className="font-mono text-fg">output y; y = a AND b;</code>, or load one of the examples.</Empty>
          : <OutputView result={result} fitKey={circuitFitKey} />
        break
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={`${meta.title} phase`}>
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <Icon className="size-4 text-accent" />
        <h2 className="text-[15px] font-semibold">{meta.view}</h2>
        <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
        <span className="text-[12.5px] text-muted">{meta.blurb}</span>
        {r.status !== 'skipped' && <span className="tabular ml-auto font-mono text-[11.5px] text-faint">{formatMs(r.timeMs)}</span>}
      </header>

      {errors.length > 0 && r.status !== 'skipped' && (
        <div className="mb-3 rounded-xl border border-err/30 bg-err-soft px-3.5 py-2.5">
          <div className="text-[13px] font-medium text-err">
            {errors.length} error{errors.length > 1 ? 's' : ''} in this phase. Later phases are skipped until {errors.length > 1 ? 'they are' : 'it is'} fixed.
          </div>
          <ul className="mt-1.5 space-y-1">
            {errors.slice(0, 3).map((d, i) => (
              <li key={i}>
                <button className="flex w-full items-start gap-2 text-left text-[12.5px] hover:underline" onClick={() => onJump(d)}>
                  <span className="tabular shrink-0 font-mono text-muted">{d.span.line}:{d.span.col}</span>
                  <span className="min-w-0">
                    {d.message}
                    {d.suggestion && <span className="ml-1.5 inline-flex items-center gap-1 text-muted"><Lightbulb className="size-3 text-accent" />{d.suggestion}</span>}
                  </span>
                </button>
              </li>
            ))}
            {errors.length > 3 && <li className="text-[12px] text-muted">…and {errors.length - 3} more in the Problems panel.</li>}
          </ul>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={phase} className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.14 }}>
          <Suspense fallback={<ViewSkeleton />}>{body}</Suspense>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
