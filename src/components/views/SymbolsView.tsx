import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { SemanticResult } from '@/compiler/semantic'
import type { SymbolEntry } from '@/compiler/symbols'
import { Badge } from '../ui/badge'
import { useSourceLink } from '@/lib/source-link'
import { Section, Stat, td, th } from './common'
import { cn } from '@/lib/utils'

type Key = 'name' | 'kind' | 'declLine' | 'driver' | 'uses'
const KIND_TONE = { input: 'accent', output: 'success', wire: 'kw' } as const

const keyOf = (s: SymbolEntry, k: Key): string | number =>
  k === 'name' ? s.name : k === 'kind' ? s.kind : k === 'declLine' ? s.declLine : k === 'driver' ? (s.driver?.line ?? (s.kind === 'input' ? -1 : 1e9)) : s.usages.length

export default function SymbolsView({ data }: { data: SemanticResult }) {
  const link = useSourceLink()
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'declLine', dir: 1 })
  const rows = useMemo(() => [...data.symbols].sort((a, b) => {
    const x = keyOf(a, sort.key), y = keyOf(b, sort.key)
    return (x < y ? -1 : x > y ? 1 : a.index - b.index) * sort.dir
  }), [data, sort])
  const header = (key: Key, label: string, right = false) => {
    const Icon = sort.key !== key ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
    return (
      <th className={cn(th, right && 'text-right')} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
          {label}<Icon className={cn('size-3', sort.key !== key && 'opacity-40')} />
        </button>
      </th>
    )
  }
  const count = (k: string) => data.symbols.filter((s) => s.kind === k).length

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
        <Stat label="symbols" value={data.symbols.length} />
        <Stat label="inputs" value={count('input')} />
        <Stat label="outputs" value={count('output')} />
        <Stat label="wires" value={count('wire')} />
        <span className="text-[12px] text-muted">One flat scope: the module. Lookup is a hash-map access, O(1).</span>
      </div>
      <Section className="flex min-h-0 flex-1 flex-col" title="Symbol table">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                {header('name', 'Name')}
                {header('kind', 'Kind')}
                {header('declLine', 'Declared')}
                {header('driver', 'Driver')}
                {header('uses', 'Uses', true)}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.name} className="group cursor-pointer transition-colors hover:bg-accent-soft"
                  onMouseEnter={() => link.hover(s.declSpan)} onMouseLeave={() => link.hover(null)} onClick={() => link.select(s.declSpan)}>
                  <td className={cn(td, 'font-mono font-medium')}>{s.name}</td>
                  <td className={td}><Badge tone={KIND_TONE[s.kind]}>{s.kind}</Badge></td>
                  <td className={cn(td, 'tabular font-mono text-[12px] text-muted')}>line {s.declLine}</td>
                  <td className={cn(td, 'max-w-[280px]')}>
                    {s.kind === 'input' ? (
                      <span className="text-[12px] text-faint">external (primary input)</span>
                    ) : s.driver ? (
                      <button className="flex max-w-full items-baseline gap-2 text-left" onClick={(e) => { e.stopPropagation(); link.select(s.driver!.span) }}
                        onMouseEnter={(e) => { e.stopPropagation(); link.hover(s.driver!.span) }}>
                        <span className="tabular shrink-0 font-mono text-[11.5px] text-muted">L{s.driver.line}</span>
                        <span className="truncate font-mono text-[12.5px]">{s.driver.expr}</span>
                        {s.driverCount > 1 && <Badge tone="error">{s.driverCount} drivers</Badge>}
                      </button>
                    ) : (
                      <Badge tone="error">not driven</Badge>
                    )}
                  </td>
                  <td className={cn(td, 'tabular text-right font-mono')}>
                    <span className={cn(s.usages.length === 0 && 'text-warn')}>{s.usages.length}</span>
                    {s.usages.length > 0 && <span className="ml-2 text-[11px] text-faint">L{[...new Set(s.usages.map((u) => u.line))].join(', L')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {Object.keys(data.dependencies).length > 0 && (
        <Section className="shrink-0" title="Dependency graph" aside={<span className="text-[12px] text-muted">searched for cycles with a depth-first search</span>}>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 px-3.5 py-3 font-mono text-[12.5px]">
            {Object.entries(data.dependencies).map(([k, deps]) => (
              <span key={k}><span className="text-fg">{k}</span> <span className="text-faint">←</span> <span className="text-muted">{deps.join(', ') || '∅'}</span></span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
