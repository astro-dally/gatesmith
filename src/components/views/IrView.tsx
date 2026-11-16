import type { IRResult } from '@/compiler/pipeline'
import { formatInstr } from '@/compiler/ir'
import { useSourceLink } from '@/lib/source-link'
import { Section, Stat } from './common'
import { NetlistGraph } from './NetlistGraph'

export function TacLine({ text, line, index, className = '' }: { text: string; line: number; index: number; className?: string }) {
  const link = useSourceLink()
  const [dest, rest] = text.split(' = ')
  const [op, ...args] = (rest ?? '').split(' ')
  const isOp = /^(AND|OR|NOT|XOR|NAND|NOR|XNOR)$/.test(op)
  return (
    <div
      className={`group flex cursor-pointer items-baseline gap-3 rounded px-2 py-[3px] font-mono text-[13px] hover:bg-accent-soft ${className}`}
      onMouseEnter={() => link.hover(link.spanForLine(line))}
      onMouseLeave={() => link.hover(null)}
      onClick={() => { const s = link.spanForLine(line); if (s) link.select(s) }}
    >
      <span className="tabular w-5 shrink-0 text-right text-[11px] text-faint">{index + 1}</span>
      <span>
        <span className={/^t\d+$/.test(dest) ? 'text-muted' : 'font-medium text-fg'}>{dest}</span>
        <span className="text-faint"> = </span>
        {isOp ? (
          <><span className="text-syn-op">{op}</span> {args.map((a, i) => <span key={i} className={/^[01]$/.test(a) ? 'text-syn-const' : ''}>{a}{i < args.length - 1 ? ' ' : ''}</span>)}</>
        ) : (
          <span className={/^[01]$/.test(op) ? 'text-syn-const' : ''}>{op}</span>
        )}
      </span>
      <span className="ml-auto text-[11px] text-faint opacity-0 group-hover:opacity-100">L{line}</span>
    </div>
  )
}

export default function IrView({ data, fitKey }: { data: IRResult; fitKey: string }) {
  const temps = new Set(data.program.instrs.map((i) => i.dest).filter((d) => /^t\d+$/.test(d))).size
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
        <Stat label="instructions" value={data.program.instrs.length} />
        <Stat label="temporaries" value={temps} />
        <Stat label="gates in netlist" value={data.netlist.gateCount} />
        <span className="text-[12px] text-muted">Each name is assigned once, so this code is in SSA form.</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,2fr)_3fr]">
        <Section className="flex min-h-[200px] flex-col" title="Three-address code" aside={<span className="text-[12px] text-muted">dest = OP arg1 arg2</span>}>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {data.program.instrs.length === 0
              ? <div className="p-4 text-[13px] text-muted">No assignments, so no instructions.</div>
              : data.program.instrs.map((i, n) => <TacLine key={n} index={n} text={formatInstr(i)} line={i.line} />)}
          </div>
        </Section>
        <Section className="flex min-h-[280px] flex-col" title="Gate-level netlist" aside={<span className="text-[12px] text-muted">a directed acyclic graph</span>}>
          <div className="relative min-h-0 flex-1">
            {data.layout
              ? <NetlistGraph layout={data.layout} netlist={data.netlist} fitKey={fitKey} />
              : <div className="p-4 text-[13px] text-muted">The netlist is too large to draw.</div>}
          </div>
        </Section>
      </div>
    </div>
  )
}
