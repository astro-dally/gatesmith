import { useMemo } from 'react'
import type { CircuitLayout } from '@/compiler/circuit'
import type { Netlist } from '@/compiler/ir'
import { useSourceLink } from '@/lib/source-link'
import { PanZoom } from '../PanZoom'

const isGate = (t: string) => t !== 'INPUT' && t !== 'OUTPUT' && t !== 'CONST0' && t !== 'CONST1'

/** The netlist drawn as a plain DAG of boxes: a structural view, not a schematic. */
export function NetlistGraph({ layout, netlist, fitKey }: { layout: CircuitLayout; netlist: Netlist; fitKey: string }) {
  const link = useSourceLink()
  const lineOf = useMemo(() => new Map(netlist.nodes.map((n) => [n.id, n.line])), [netlist])
  const hover = (id: string | null) => {
    const line = id ? lineOf.get(id) : undefined
    link.hover(line ? link.spanForLine(line) : null)
  }
  return (
    <PanZoom width={layout.width} height={layout.height} fitKey={fitKey} label="Netlist graph">
      <g fill="none" strokeWidth={1.5} stroke="var(--border-strong)">
        {layout.wires.map((w) => (
          <polyline key={w.id} points={w.points.map((p) => `${p.x},${p.y}`).join(' ')} strokeLinejoin="round" />
        ))}
      </g>
      {layout.junctions.map((j, i) => <circle key={i} cx={j.x} cy={j.y} r={2.5} fill="var(--border-strong)" />)}
      {layout.nodes.map((n) => {
        const gate = isGate(n.type)
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} data-interactive
            onMouseEnter={() => hover(n.id)} onMouseLeave={() => hover(null)}>
            <title>{gate ? `${n.names.join(', ')} = ${n.type}` : `${n.type.toLowerCase()} ${n.label}`}</title>
            <rect width={n.w} height={n.h} rx={gate ? 8 : n.h / 2}
              fill={gate ? 'var(--panel-2)' : 'var(--panel)'}
              stroke={gate ? 'var(--accent)' : n.type === 'OUTPUT' ? 'var(--high)' : 'var(--border-strong)'} strokeWidth={1.4} />
            {gate ? (
              <>
                <text x={n.w / 2} y={n.h / 2 - 3} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--accent)" fontFamily="var(--font-mono)">{n.type}</text>
                <text x={n.w / 2} y={n.h / 2 + 11} textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="var(--font-mono)">{n.names[0]}</text>
              </>
            ) : (
              <text x={n.w / 2} y={n.h / 2 + 4} textAnchor="middle" fontSize={11.5} fill="var(--fg)" fontFamily="var(--font-mono)">{n.label}</text>
            )}
          </g>
        )
      })}
    </PanZoom>
  )
}
