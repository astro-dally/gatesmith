import { useMemo, useState } from 'react'
import { ChevronRight, ArrowRight } from 'lucide-react'
import type { OptimizerResult } from '@/compiler/pipeline'
import { formatInstr } from '@/compiler/ir'
import { RULE_DOCS, type RuleName } from '@/compiler/optimizer'
import { Badge } from '../ui/badge'
import { Section } from './common'
import { TacLine } from './IrView'
import { cn } from '@/lib/utils'

type Mark = 'kept' | 'removed' | 'rewritten' | 'new'
const MARK_STYLE: Record<Mark, { sign: string; row: string; text: string }> = {
  kept: { sign: ' ', row: '', text: '' },
  removed: { sign: '−', row: 'bg-err-soft', text: 'line-through decoration-err/60 opacity-75' },
  rewritten: { sign: '~', row: 'bg-warn-soft', text: '' },
  new: { sign: '+', row: 'bg-high-soft', text: '' },
}

export default function OptimizerView({ data }: { data: OptimizerResult }) {
  const [openRule, setOpenRule] = useState<string | null>(null)

  const diff = useMemo(() => {
    const afterBy = new Map(data.after.instrs.map((i) => [i.dest, formatInstr(i)]))
    const beforeBy = new Map(data.before.instrs.map((i) => [i.dest, formatInstr(i)]))
    const before = data.before.instrs.map((i) => {
      const text = formatInstr(i)
      const a = afterBy.get(i.dest)
      return { i, text, mark: (a === undefined ? 'removed' : a === text ? 'kept' : 'rewritten') as Mark }
    })
    const after = data.after.instrs.map((i) => {
      const text = formatInstr(i)
      const b = beforeBy.get(i.dest)
      return { i, text, mark: (b === undefined ? 'new' : b === text ? 'kept' : 'rewritten') as Mark }
    })
    return { before, after }
  }, [data])

  const groups = useMemo(() => {
    const m = new Map<RuleName, typeof data.applied>()
    for (const a of data.applied) m.set(a.rule, [...(m.get(a.rule) ?? []), a])
    return [...m.entries()]
  }, [data])

  const saved = data.gatesBefore - data.gatesAfter
  const pct = data.gatesBefore ? Math.round((saved / data.gatesBefore) * 100) : 0
  const removed = diff.before.filter((d) => d.mark === 'removed').length
  const rewritten = diff.after.filter((d) => d.mark === 'rewritten').length

  return (
    <div className="h-full min-h-0 space-y-3 overflow-auto pr-0.5">
      <Section>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="text-[28px] font-semibold leading-none tabular">{data.gatesBefore}</div>
            <ArrowRight className="size-5 text-faint" />
            <div className={cn('text-[28px] font-semibold leading-none tabular', saved > 0 ? 'text-high' : 'text-fg')}>{data.gatesAfter}</div>
            <div className="text-[12.5px] leading-tight text-muted">gates<br />{saved > 0 ? `${pct}% fewer` : 'no change'}</div>
          </div>
          <div className="min-w-[160px] flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-panel-3">
              <div className="h-full rounded-full bg-high transition-[width] duration-500" style={{ width: `${data.gatesBefore ? (data.gatesAfter / data.gatesBefore) * 100 : 100}%` }} />
            </div>
            <div className="mt-1.5 text-[12px] text-muted">
              {data.applied.length} rewrites in {data.passes} {data.passes === 1 ? 'pass' : 'passes'} · {removed} instructions removed · {rewritten} rewritten
            </div>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="Before" aside={<span className="font-mono text-[12px] text-muted">{data.before.instrs.length} instr</span>}>
          <div className="p-2">
            {diff.before.map((d, n) => (
              <div key={n} className={cn('flex items-center rounded', MARK_STYLE[d.mark].row)}>
                <span className={cn('w-4 shrink-0 text-center font-mono text-[12px]', d.mark === 'removed' ? 'text-err' : 'text-warn')}>{MARK_STYLE[d.mark].sign}</span>
                <TacLine text={d.text} line={d.i.line} index={n} className={cn('flex-1', MARK_STYLE[d.mark].text)} />
              </div>
            ))}
          </div>
        </Section>
        <Section title="After" aside={<span className="font-mono text-[12px] text-muted">{data.after.instrs.length} instr</span>}>
          <div className="p-2">
            {diff.after.length === 0 && <div className="p-3 text-[13px] text-muted">Nothing left: no outputs need logic.</div>}
            {diff.after.map((d, n) => (
              <div key={n} className={cn('flex items-center rounded', MARK_STYLE[d.mark].row)}>
                <span className={cn('w-4 shrink-0 text-center font-mono text-[12px]', d.mark === 'new' ? 'text-high' : 'text-warn')}>{MARK_STYLE[d.mark].sign}</span>
                <TacLine text={d.text} line={d.i.line} index={n} className="flex-1" />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Applied rules" aside={<span className="text-[12px] text-muted">in the order they fired</span>}>
        {groups.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-muted">No rule applied. There are no constants, repeated subexpressions, double negations or dead instructions to remove.</div>
        ) : (
          <ul className="divide-y divide-line">
            {groups.map(([rule, list]) => {
              const open = openRule === rule
              return (
                <li key={rule}>
                  <button className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-panel-2" onClick={() => setOpenRule(open ? null : rule)} aria-expanded={open}>
                    <ChevronRight className={cn('size-3.5 shrink-0 text-faint transition-transform', open && 'rotate-90')} />
                    <span className="text-[13px] font-medium">{rule}</span>
                    <Badge tone="accent">{list.length}×</Badge>
                    <span className="hidden min-w-0 flex-1 truncate text-[12px] text-muted md:block">{RULE_DOCS[rule]}</span>
                  </button>
                  {open && (
                    <div className="space-y-1 px-10 pb-3">
                      <div className="pb-1 text-[12px] text-muted md:hidden">{RULE_DOCS[rule]}</div>
                      {list.map((a, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 font-mono text-[12.5px]">
                          <span className="text-muted">{a.before}</span>
                          <ArrowRight className="size-3.5 text-faint" />
                          <span className={a.after === '(removed)' ? 'text-err' : 'text-fg'}>{a.after}</span>
                          <span className="text-[10.5px] text-faint">pass {a.pass}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
