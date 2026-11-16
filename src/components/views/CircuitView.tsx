import { useMemo, useState } from 'react'
import { type CircuitLayout, gateGeometry } from '@/compiler/circuit'
import { type Netlist, evaluateNetlist } from '@/compiler/ir'
import { useSourceLink } from '@/lib/source-link'
import { PanZoom } from '../PanZoom'

const STEP_MS = 110 // propagation delay per layer, purely visual

interface Props {
  layout: CircuitLayout
  netlist: Netlist
  inputs: Record<string, 0 | 1>
  onToggle: (name: string) => void
  wireNames: Set<string>
  fitKey: string
}

/**
 * The live circuit. Input pads are buttons; clicking one re-evaluates the
 * netlist and the new values ripple left to right, one layer at a time,
 * green for 1 and grey for 0.
 */
export function CircuitView({ layout, netlist, inputs, onToggle, wireNames, fitKey }: Props) {
  const link = useSourceLink()
  const values = useMemo(() => evaluateNetlist(netlist, inputs), [netlist, inputs])
  const lineOf = useMemo(() => new Map(netlist.nodes.map((n) => [n.id, n.line])), [netlist])
  const labelOf = useMemo(() => new Map(netlist.nodes.map((n) => [n.id, n])), [netlist])

  // Track which nets changed value, to fire a pulse along them. This is React's
  // "adjust state while rendering" pattern, which is safe under StrictMode.
  const [track, setTrack] = useState({ values, key: fitKey, changed: new Set<string>(), wave: 0 })
  if (track.values !== values) {
    const changedNow = new Set<string>()
    if (track.key === fitKey) for (const id of Object.keys(values)) if (track.values[id] !== values[id]) changedNow.add(id)
    setTrack({ values, key: fitKey, changed: changedNow, wave: track.wave + 1 })
  }
  const { changed, wave } = track

  const color = (id: string) => (values[id] === 1 ? 'var(--high)' : 'var(--low)')
  const delay = (layer: number) => `${layer * STEP_MS}ms`
  const hoverGate = (id: string | null) => {
    const line = id ? lineOf.get(id) : undefined
    link.hover(line ? link.spanForLine(line) : null)
  }

  return (
    <PanZoom width={layout.width} height={layout.height} fitKey={fitKey} label="Circuit diagram. Input pads are toggle buttons.">
      {/* Wires */}
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {layout.wires.map((w) => {
          const pts = w.points.map((p) => `${p.x},${p.y}`).join(' ')
          return (
            <g key={w.id}>
              <polyline points={pts} strokeWidth={2.2} stroke={color(w.net)}
                style={{ transition: `stroke 180ms ease ${delay(w.srcLayer)}` }} />
              {changed.has(w.net) && (
                <polyline key={`p${wave}`} points={pts} strokeWidth={3.2} className="wire-pulse"
                  stroke={values[w.net] === 1 ? 'var(--high)' : 'var(--muted)'}
                  style={{ animationDelay: delay(w.srcLayer) }} />
              )}
            </g>
          )
        })}
      </g>
      {layout.junctions.map((j, i) => (
        <circle key={i} cx={j.x} cy={j.y} r={3.4} fill={color(j.net)} style={{ transition: `fill 180ms ease ${delay(0)}` }} />
      ))}

      {/* Nodes */}
      {layout.nodes.map((n) => {
        const v = values[n.id]
        const hi = v === 1
        const d = delay(n.layer)
        if (n.type === 'INPUT') {
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} data-interactive role="button" tabIndex={0}
              aria-label={`Input ${n.label} is ${v}. Press to toggle.`} aria-pressed={hi}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--accent)] [&:focus-visible>rect]:[stroke-width:2.5]"
              onClick={() => onToggle(n.label)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(n.label) } }}>
              <rect width={n.w} height={n.h} rx={n.h / 2} fill={hi ? 'var(--high-soft)' : 'var(--panel)'}
                stroke={hi ? 'var(--high)' : 'var(--border-strong)'} strokeWidth={1.6} style={{ transition: 'all 150ms ease' }} />
              <text x={12} y={n.h / 2 + 4} fontSize={12.5} fontWeight={500} fill="var(--fg)" fontFamily="var(--font-mono)">{n.label}</text>
              <rect x={n.w - 25} y={5} width={19} height={n.h - 10} rx={4} fill={hi ? 'var(--high)' : 'var(--panel-3)'} style={{ transition: 'fill 150ms ease' }} />
              <text x={n.w - 15.5} y={n.h / 2 + 4} textAnchor="middle" fontSize={11.5} fontWeight={600}
                fill={hi ? 'var(--accent-fg)' : 'var(--muted)'} fontFamily="var(--font-mono)">{v}</text>
            </g>
          )
        }
        if (n.type === 'OUTPUT') {
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect width={n.w} height={n.h} rx={6} fill={hi ? 'var(--high-soft)' : 'var(--panel)'}
                stroke={hi ? 'var(--high)' : 'var(--border-strong)'} strokeWidth={1.6} style={{ transition: `all 180ms ease ${d}` }} />
              <text x={10} y={n.h / 2 + 4} fontSize={12.5} fontWeight={500} fill="var(--fg)" fontFamily="var(--font-mono)">{n.label}</text>
              <text x={n.w - 12} y={n.h / 2 + 4.5} textAnchor="end" fontSize={13} fontWeight={700}
                fill={hi ? 'var(--high)' : 'var(--faint)'} fontFamily="var(--font-mono)" style={{ transition: `fill 180ms ease ${d}` }}>{v}</text>
            </g>
          )
        }
        if (n.type === 'CONST0' || n.type === 'CONST1') {
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect width={n.w} height={n.h} rx={5} fill="var(--panel-2)" stroke="var(--border-strong)" strokeDasharray="3 3" />
              <text x={n.w / 2} y={n.h / 2 + 4} textAnchor="middle" fontSize={12} fill={hi ? 'var(--high)' : 'var(--muted)'} fontFamily="var(--font-mono)">{n.label}</text>
            </g>
          )
        }
        const g = gateGeometry(n.type)
        const stroke = hi ? 'var(--high)' : 'var(--fg)'
        const node = labelOf.get(n.id)
        const userNames = n.names.filter((x) => wireNames.has(x))
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} data-interactive
            onMouseEnter={() => hoverGate(n.id)} onMouseLeave={() => hoverGate(null)} className="cursor-default">
            <title>{`${node?.names.join(' = ')} = ${n.type}${node?.line ? ` (line ${node.line})` : ''}, output ${v}`}</title>
            <g stroke={stroke} strokeWidth={1.8} style={{ transition: `stroke 180ms ease ${d}` }}>
              {g.leads.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
              <path d={g.body} fill={hi ? 'var(--high-soft)' : 'var(--panel)'} style={{ transition: `fill 180ms ease ${d}` }} />
              {g.back && <path d={g.back} fill="none" />}
              {g.bubble && <circle cx={g.bubble.cx} cy={g.bubble.cy} r={g.bubble.r} fill="var(--panel)" />}
            </g>
            <text x={n.type === 'NOT' ? 25 : n.type.includes('XOR') || n.type.includes('XNOR') ? 33 : n.type.endsWith('OR') ? 29 : 27} y={25.5} textAnchor="middle" fontSize={8.5} fontWeight={600}
              fill="var(--muted)" fontFamily="var(--font-mono)" pointerEvents="none">{n.type}</text>
            {userNames.length > 0 && (
              <text x={n.w + 4} y={n.h / 2 - 6} fontSize={10.5} fill="var(--syn-kw)" fontFamily="var(--font-mono)">{userNames.join(', ')}</text>
            )}
          </g>
        )
      })}
    </PanZoom>
  )
}
