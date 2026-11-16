import { useMemo, useState } from 'react'
import { CheckCircle2, TableProperties, XCircle } from 'lucide-react'
import type { TruthTable } from '@/compiler/codegen'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { Badge } from '../ui/badge'
import { Section, Empty, th, td } from './common'
import { cn } from '@/lib/utils'

interface Props {
  table: TruthTable
  activeRow: number
  onHoverRow: (index: number | null) => void
  onPickRow: (index: number) => void
}

export function EquivalenceBadge({ table }: { table: TruthTable }) {
  const e = table.equivalence
  return e.equivalent ? (
    <Badge tone="success" className="py-1"><CheckCircle2 className="size-3.5" />
      Optimised ≡ original on {e.exhaustive ? `all ${e.vectorsChecked}` : `${e.vectorsChecked} random`} input{e.vectorsChecked === 1 ? '' : 's'}
    </Badge>
  ) : (
    <Badge tone="error" className="py-1"><XCircle className="size-3.5" />Differs on {e.mismatches.length} inputs</Badge>
  )
}

export default function TruthTableView({ table, activeRow, onHoverRow, onPickRow }: Props) {
  const [focus, setFocus] = useState(0)
  const [filter, setFilter] = useState<'all' | '1' | '0'>('all')
  const fi = Math.min(focus, Math.max(0, table.outputs.length - 1))

  const rows = useMemo(() => {
    if (!table.rows) return []
    if (filter === 'all' || !table.outputs.length) return table.rows
    return table.rows.filter((r) => String(r.outputs[fi]) === filter)
  }, [table, filter, fi])

  if (!table.rows) {
    return (
      <Section title="Truth table">
        <Empty icon={<TableProperties />} title={`${table.inputs.length} inputs is too many rows to list`}>
          A full table would have {(2 ** table.inputs.length).toLocaleString('en-US')} rows, so it is shown only up to 10 inputs (1,024 rows).
          The circuit, Verilog and the equivalence check below still work: equivalence was verified on {table.equivalence.vectorsChecked.toLocaleString('en-US')} random input vectors.
          <div className="mt-3 flex justify-center"><EquivalenceBadge table={table} /></div>
        </Empty>
      </Section>
    )
  }

  const ones = table.rows.filter((r) => r.outputs[fi] === 1).length
  return (
    <Section
      title={<span className="flex items-center gap-2">Truth table <span className="font-normal text-muted">{table.rows.length} rows</span></span>}
      aside={
        <>
          <EquivalenceBadge table={table} />
          {table.outputs.length > 1 && (
            <Tabs value={String(fi)} onValueChange={(v) => setFocus(Number(v))}>
              <TabsList aria-label="Output to highlight">
                {table.outputs.map((o, i) => <TabsTrigger key={o} value={String(i)} className="font-mono">{o}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          )}
          {table.outputs.length > 0 && (
            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | '1' | '0')}>
              <TabsList aria-label="Filter rows">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="1" className="font-mono">{table.outputs[fi]}=1 <span className="text-faint">{ones}</span></TabsTrigger>
                <TabsTrigger value="0" className="font-mono">{table.outputs[fi]}=0</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </>
      }
    >
      <div className="max-h-[420px] overflow-auto" onMouseLeave={() => onHoverRow(null)}>
        <table className="w-full border-separate border-spacing-0 font-mono text-[13px]">
          <thead>
            <tr>
              <th className={cn(th, 'w-14 text-right font-sans')}>row</th>
              {table.inputs.map((n) => <th key={n} className={cn(th, 'text-center font-mono')}>{n}</th>)}
              {table.outputs.map((n, i) => (
                <th key={n} className={cn(th, 'text-center font-mono', i === 0 && 'border-l-2 border-l-line-strong', i === fi ? 'text-high' : 'text-fg')}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const minterm = r.outputs[fi] === 1
              const active = r.index === activeRow
              return (
                <tr key={r.index}
                  onMouseEnter={() => onHoverRow(r.index)}
                  onClick={() => onPickRow(r.index)}
                  className={cn('cursor-pointer transition-colors', minterm && 'bg-high-soft', active ? 'outline outline-1 -outline-offset-1 outline-accent' : 'hover:bg-accent-soft')}
                  aria-selected={active}
                >
                  <td className={cn(td, 'tabular text-right text-[11.5px] text-faint')}>{minterm ? `m${r.index}` : r.index}</td>
                  {r.inputs.map((b, i) => <td key={i} className={cn(td, 'text-center', b ? 'text-fg' : 'text-faint')}>{b}</td>)}
                  {r.outputs.map((b, i) => (
                    <td key={i} className={cn(td, 'text-center font-semibold', i === 0 && 'border-l-2 border-l-line-strong', b ? 'text-high' : 'text-faint')}>{b}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-5 text-center font-sans text-[13px] text-muted">No rows where {table.outputs[fi]} = {filter}.</div>}
      </div>
      <footer className="border-t border-line px-3.5 py-2 text-[12px] text-muted">
        Hover a row to preview it on the circuit; click to set the inputs. Green rows are minterms of <span className="font-mono">{table.outputs[fi]}</span>.
      </footer>
    </Section>
  )
}

export function FunctionsView({ table }: { table: TruthTable }) {
  if (!table.rows || table.functions.length === 0) return null
  return (
    <Section title="Boolean functions">
      <div className="divide-y divide-line">
        {table.functions.map((f) => (
          <div key={f.name} className="grid gap-1.5 px-3.5 py-3 text-[13px] sm:grid-cols-[120px_1fr]">
            <div className="font-mono font-semibold">{f.name}</div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted">Minterms</dt><dd className="font-mono">{f.sigma}</dd>
              <dt className="text-muted">Minimal SOP</dt><dd className="font-mono text-high">{f.minimal ?? <span className="text-faint">(more than 8 inputs)</span>}</dd>
              <dt className="text-muted">Canonical SOP</dt>
              <dd className="break-words font-mono text-muted">{f.canonical ?? <span className="text-faint">({f.minterms.length} terms, too long to list)</span>}</dd>
            </dl>
          </div>
        ))}
      </div>
      <footer className="border-t border-line px-3.5 py-2 text-[12px] text-muted">The minimal sum of products comes from the Quine–McCluskey algorithm.</footer>
    </Section>
  )
}
