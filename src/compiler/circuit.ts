/**
 * circuit.ts — Phase 6b: the circuit-diagram target.
 *
 * A hand-written layered ("Sugiyama-style") graph layout for the netlist:
 *
 *  1. Layering   — inputs/constants in layer 0, each gate one layer right of
 *                  its deepest input, all outputs in the last layer.
 *  2. Dummies    — a net that skips layers gets one invisible dummy node per
 *                  skipped layer, so every edge joins adjacent layers.
 *  3. Ordering   — alternating down/up sweeps sort each layer by the
 *                  barycentre (mean position) of its neighbours, which
 *                  greatly reduces wire crossings.
 *  4. Placement  — y positions are chosen to line each gate up with the pins
 *                  that feed it, subject to "keep the order, keep a minimum
 *                  gap". That is an isotonic regression, solved exactly by the
 *                  pool-adjacent-violators algorithm.
 *  5. Routing    — every net gets its own vertical track in each channel
 *                  between two layers; wires run horizontal → vertical →
 *                  horizontal (orthogonal), and fan-out points get junction dots.
 *
 * The same layout feeds both the downloadable SVG string (below) and the
 * interactive React view, so what you see is what you export.
 */
import type { NetNode, Netlist, NodeType } from './ir'

export const MAX_DRAWABLE_NODES = 400

export interface Point { x: number; y: number }

export interface PlacedNode {
  id: string
  type: NodeType
  label: string
  names: string[]
  layer: number
  /** Top-left corner. */
  x: number
  y: number
  w: number
  h: number
  inputs: string[]
  inPins: Point[]
  outPin: Point
}

export interface Wire {
  id: string
  /** Id of the node driving this net. */
  net: string
  to: string
  pin: number
  points: Point[]
  srcLayer: number
  dstLayer: number
}

export interface CircuitLayout {
  width: number
  height: number
  layers: number
  nodes: PlacedNode[]
  wires: Wire[]
  junctions: (Point & { net: string })[]
}

const GATE_W = 64
const GATE_H = 44
const PIN_W = 64
const PIN_H = 28
const OUT_W = 72
const CONST_W = 40
const MARGIN = 28
const TRACK = 10
const GAP_BASE = 44

const isGate = (t: NodeType) => t !== 'INPUT' && t !== 'OUTPUT' && t !== 'CONST0' && t !== 'CONST1'

function sizeOf(t: NodeType): { w: number; h: number } {
  if (t === 'INPUT') return { w: PIN_W, h: PIN_H }
  if (t === 'OUTPUT') return { w: OUT_W, h: PIN_H }
  if (t === 'CONST0' || t === 'CONST1') return { w: CONST_W, h: PIN_H }
  return { w: GATE_W, h: GATE_H }
}

/** Input-pin y offsets relative to the node's vertical centre. */
function pinOffsets(t: NodeType, count: number): number[] {
  if (!isGate(t) || count === 1) return [0]
  return [-11, 11]
}

interface LNode {
  id: string
  dummy: boolean
  net: string // for dummies: the net they carry; for real nodes: their own id
  layer: number
  w: number
  h: number
  y: number // centre
  preds: { node: LNode; pin: number }[]
  succs: LNode[]
  real?: NetNode
}

export function layoutCircuit(net: Netlist): CircuitLayout | null {
  if (net.nodes.length === 0 || net.nodes.length > MAX_DRAWABLE_NODES) return null

  // ── 1. Layering ──────────────────────────────────────────────
  const layerOf = new Map<string, number>()
  let maxGate = 0
  for (const n of net.nodes) {
    if (n.type === 'OUTPUT') continue
    const l = isGate(n.type) ? 1 + Math.max(0, ...n.inputs.map((i) => layerOf.get(i) ?? 0)) : 0
    layerOf.set(n.id, l)
    if (isGate(n.type)) maxGate = Math.max(maxGate, l)
  }
  const outLayer = maxGate + 1
  for (const n of net.nodes) if (n.type === 'OUTPUT') layerOf.set(n.id, outLayer)

  // ── 2. Build layered graph with dummy nodes ─────────────────
  const lnodes = new Map<string, LNode>()
  const layers: LNode[][] = Array.from({ length: outLayer + 1 }, () => [])
  const addL = (n: LNode) => { lnodes.set(n.id, n); layers[n.layer].push(n); return n }

  // Layer 0 order: inputs in declaration order, then constants.
  const realOrder = [...net.nodes].sort((a, b) => (layerOf.get(a.id)! - layerOf.get(b.id)!) ||
    (a.type === 'INPUT' ? 0 : 1) - (b.type === 'INPUT' ? 0 : 1))
  for (const n of realOrder) {
    const { w, h } = sizeOf(n.type)
    addL({ id: n.id, dummy: false, net: n.id, layer: layerOf.get(n.id)!, w, h, y: 0, preds: [], succs: [], real: n })
  }
  const dummyFor = (src: string, layer: number): LNode => {
    const id = `dummy:${src}:${layer}`
    const existing = lnodes.get(id)
    if (existing) return existing
    const prev = layer - 1 === layerOf.get(src) ? lnodes.get(src)! : dummyFor(src, layer - 1)
    const d = addL({ id, dummy: true, net: src, layer, w: 0, h: 6, y: 0, preds: [{ node: prev, pin: 0 }], succs: [] })
    prev.succs.push(d)
    return d
  }
  for (const n of net.nodes) {
    const t = lnodes.get(n.id)!
    n.inputs.forEach((src, pin) => {
      const sl = layerOf.get(src)!
      const prev = t.layer - sl > 1 ? dummyFor(src, t.layer - 1) : lnodes.get(src)!
      t.preds.push({ node: prev, pin })
      prev.succs.push(t)
    })
  }

  // ── 3. Crossing reduction by barycentre sweeps ──────────────
  const indexIn = () => {
    const m = new Map<LNode, number>()
    for (const layer of layers) layer.forEach((n, i) => m.set(n, i))
    return m
  }
  for (let iter = 0; iter < 6; iter++) {
    const down = iter % 2 === 0
    const order = down ? range(1, outLayer + 1) : range(outLayer - 1, 0, -1)
    for (const l of order) {
      const pos = indexIn()
      const bary = new Map<LNode, number>()
      for (const n of layers[l]) {
        const nbrs = down ? n.preds.map((p) => p.node) : n.succs
        bary.set(n, nbrs.length ? mean(nbrs.map((x) => pos.get(x)!)) : pos.get(n)!)
      }
      layers[l].sort((a, b) => bary.get(a)! - bary.get(b)! || pos.get(a)! - pos.get(b)!)
    }
  }

  // ── 4. Vertical placement (isotonic regression via PAV) ─────
  const sep = (a: LNode, b: LNode) => (a.h + b.h) / 2 + (a.dummy || b.dummy ? 10 : 18)
  const place = (layer: LNode[], desired: number[]) => {
    const offs: number[] = []
    layer.forEach((n, i) => offs.push(i === 0 ? 0 : offs[i - 1] + sep(layer[i - 1], n)))
    const w = pav(desired.map((d, i) => d - offs[i]))
    layer.forEach((n, i) => { n.y = offs[i] + w[i] })
  }
  // Initial: stack layer 0.
  place(layers[0], layers[0].map(() => 0))
  const fromPreds = (n: LNode) => {
    if (!n.preds.length) return n.y
    const offs = pinOffsets(n.real?.type ?? 'OUTPUT', n.preds.length)
    return mean(n.preds.map((p) => p.node.y - (n.dummy ? 0 : offs[p.pin] ?? 0)))
  }
  const fromSuccs = (n: LNode) => {
    if (!n.succs.length) return n.y
    return mean(n.succs.map((s) => {
      const k = s.preds.findIndex((p) => p.node === n)
      const offs = pinOffsets(s.real?.type ?? 'OUTPUT', s.preds.length)
      return s.y + (s.dummy ? 0 : offs[s.preds[k]?.pin ?? 0] ?? 0)
    }))
  }
  for (let l = 1; l <= outLayer; l++) place(layers[l], layers[l].map(fromPreds))
  for (let iter = 0; iter < 2; iter++) {
    for (let l = outLayer - 1; l >= 0; l--) place(layers[l], layers[l].map((n) => (fromSuccs(n) + n.y) / 2))
    for (let l = 1; l <= outLayer; l++) place(layers[l], layers[l].map((n) => (l === outLayer ? fromPreds(n) : (fromPreds(n) + n.y) / 2)))
  }
  const minTop = Math.min(...[...lnodes.values()].map((n) => n.y - n.h / 2))
  for (const n of lnodes.values()) n.y = Math.round(n.y - minTop + MARGIN + 8)

  // ── 5. Horizontal placement and channel tracks ──────────────
  const outPinY = (n: LNode) => n.y
  const inPinY = (n: LNode, pin: number) =>
    n.dummy ? n.y : n.y + (pinOffsets(n.real!.type, n.real!.inputs.length)[pin] ?? 0)

  const tracks: Map<string, number>[] = layers.map(() => new Map())
  for (let l = 0; l < outLayer; l++) {
    const jogging = layers[l]
      .filter((n) => n.succs.some((s) => s.preds.some((p) => p.node === n && Math.abs(inPinY(s, p.pin) - outPinY(n)) > 0.5)))
      .sort((a, b) => a.y - b.y)
    jogging.forEach((n, i) => tracks[l].set(n.net, i))
  }
  const colW = layers.map((ns) => Math.max(0, ...ns.map((n) => n.w)))
  const colX: number[] = []
  layers.forEach((_, l) => {
    colX.push(l === 0 ? MARGIN : colX[l - 1] + colW[l - 1] + GAP_BASE + tracks[l - 1].size * TRACK)
  })
  const xOf = (n: LNode) => (n.dummy ? colX[n.layer] + colW[n.layer] / 2 : n.layer === 0 ? colX[0] + colW[0] - n.w : colX[n.layer])
  const outX = (n: LNode) => (n.dummy ? xOf(n) : xOf(n) + n.w)
  const trackX = (l: number, netId: string) => {
    const count = tracks[l].size
    const idx = tracks[l].get(netId) ?? 0
    const left = colX[l] + colW[l]
    const right = colX[l + 1]
    const usable = right - left
    return Math.round(left + (usable - (count - 1) * TRACK) / 2 + idx * TRACK)
  }

  // ── 6. Route wires ──────────────────────────────────────────
  const wires: Wire[] = []
  const junctionKeys = new Set<string>()
  const junctions: (Point & { net: string })[] = []
  const addJunction = (x: number, y: number, netId: string) => {
    const key = `${x},${y}`
    if (!junctionKeys.has(key)) { junctionKeys.add(key); junctions.push({ x, y, net: netId }) }
  }
  const segment = (u: LNode, v: LNode, pin: number): Point[] => {
    const sx = outX(u), sy = outPinY(u)
    const ex = v.dummy ? xOf(v) : xOf(v), ey = inPinY(v, pin)
    if (Math.abs(sy - ey) < 0.5) return [{ x: sx, y: sy }, { x: ex, y: sy }]
    const tx = trackX(u.layer, u.net)
    return [{ x: sx, y: sy }, { x: tx, y: sy }, { x: tx, y: ey }, { x: ex, y: ey }]
  }
  for (const n of net.nodes) {
    const t = lnodes.get(n.id)!
    t.preds.forEach(({ node: prev, pin }) => {
      const chain: { u: LNode; v: LNode; pin: number }[] = [{ u: prev, v: t, pin }]
      let cur = prev
      while (cur.dummy) {
        const p = cur.preds[0].node
        chain.unshift({ u: p, v: cur, pin: 0 })
        cur = p
      }
      const pts: Point[] = []
      for (const s of chain) for (const p of segment(s.u, s.v, s.pin)) {
        const last = pts[pts.length - 1]
        if (!last || last.x !== p.x || last.y !== p.y) pts.push(p)
      }
      wires.push({ id: `${n.id}#${pin}`, net: cur.id, to: n.id, pin, points: simplifyPath(pts), srcLayer: cur.layer, dstLayer: t.layer })
    })
  }
  // Junction dots where three or more wire segments of one net meet.
  for (let l = 0; l < outLayer; l++) {
    for (const u of layers[l]) {
      if (!tracks[l].has(u.net)) continue
      const sy = outPinY(u)
      const tx = trackX(l, u.net)
      const ends = u.succs.flatMap((s) => s.preds.filter((p) => p.node === u).map((p) => inPinY(s, p.pin)))
      const jogs = ends.filter((y) => Math.abs(y - sy) > 0.5)
      const straight = ends.length > jogs.length
      const lo = Math.min(sy, ...jogs), hi = Math.max(sy, ...jogs)
      if (straight || (lo < sy && sy < hi)) addJunction(tx, sy, u.net)
      for (const y of jogs) if (lo < y && y < hi) addJunction(tx, y, u.net)
    }
  }

  // ── 7. Emit placed nodes ────────────────────────────────────
  const nodes: PlacedNode[] = []
  for (const n of net.nodes) {
    const ln = lnodes.get(n.id)!
    const x = xOf(ln)
    const top = ln.y - ln.h / 2
    nodes.push({
      id: n.id, type: n.type, label: n.label, names: n.names, layer: ln.layer,
      x, y: top, w: ln.w, h: ln.h, inputs: n.inputs,
      inPins: n.inputs.map((_, pin) => ({ x, y: inPinY(ln, pin) })),
      outPin: { x: x + ln.w, y: ln.y },
    })
  }
  const width = Math.max(...nodes.map((n) => n.x + n.w)) + MARGIN
  const height = Math.max(...[...lnodes.values()].map((n) => n.y + n.h / 2)) + MARGIN + 8
  return { width, height, layers: outLayer + 1, nodes, wires, junctions }
}

/** Pool-adjacent-violators: the non-decreasing sequence closest (L2) to `z`. */
export function pav(z: number[]): number[] {
  const blocks: { sum: number; count: number }[] = []
  for (const value of z) {
    blocks.push({ sum: value, count: 1 })
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2]
      if (a.sum / a.count <= b.sum / b.count) break
      blocks.pop()
      a.sum += b.sum
      a.count += b.count
    }
  }
  return blocks.flatMap((b) => Array(b.count).fill(b.sum / b.count))
}

/** Removes collinear middle points. */
function simplifyPath(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1]
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)
      if (!collinear) break
      out.pop()
    }
    out.push(p)
  }
  return out
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}
function range(from: number, to: number, step = 1): number[] {
  const r: number[] = []
  for (let i = from; step > 0 ? i < to : i > to; i += step) r.push(i)
  return r
}

// ───────────────────────── gate shapes ─────────────────────────

export interface GateGeometry {
  /** Filled body outline. */
  body: string
  /** Extra stroked curve (XOR/XNOR back line). */
  back?: string
  bubble?: { cx: number; cy: number; r: number }
  /** Short pin leads [x1, y1, x2, y2] in node-local coordinates. */
  leads: [number, number, number, number][]
}

/** ANSI/IEEE distinctive-shape symbols in a 64×44 local frame. */
export function gateGeometry(type: NodeType): GateGeometry {
  const two: [number, number][] = [[0, 11], [0, 33]]
  switch (type) {
    case 'AND':
    case 'NAND': {
      const bubble = type === 'NAND'
      return {
        body: 'M8 0 H30 A22 22 0 0 1 30 44 H8 Z',
        bubble: bubble ? { cx: 56, cy: 22, r: 4 } : undefined,
        leads: [...two.map(([x, y]) => [x, y, 8, y] as [number, number, number, number]), [bubble ? 60 : 52, 22, 64, 22]],
      }
    }
    case 'OR':
    case 'NOR': {
      const bubble = type === 'NOR'
      return {
        body: 'M8 0 Q32 0 54 22 Q32 44 8 44 Q20 22 8 0 Z',
        bubble: bubble ? { cx: 58, cy: 22, r: 4 } : undefined,
        leads: [...two.map(([x, y]) => [x, y, 12.5, y] as [number, number, number, number]), [bubble ? 62 : 54, 22, 64, 22]],
      }
    }
    case 'XOR':
    case 'XNOR': {
      const bubble = type === 'XNOR'
      return {
        body: 'M12 0 Q35 0 56 22 Q35 44 12 44 Q24 22 12 0 Z',
        back: 'M5 0 Q17 22 5 44',
        bubble: bubble ? { cx: 60, cy: 22, r: 4 } : undefined,
        leads: [...two.map(([x, y]) => [x, y, 9.5, y] as [number, number, number, number]), ...(bubble ? [] : [[56, 22, 64, 22] as [number, number, number, number]])],
      }
    }
    case 'NOT':
      return {
        body: 'M10 8 L50 22 L10 36 Z',
        bubble: { cx: 54, cy: 22, r: 4 },
        leads: [[0, 22, 10, 22], [58, 22, 64, 22]],
      }
    default:
      return { body: '', leads: [] }
  }
}

// ───────────────────────── SVG export ─────────────────────────

export interface SvgOptions {
  values?: Record<string, 0 | 1>
  dark?: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Serialises a layout to a standalone SVG document string. */
export function circuitToSVG(layout: CircuitLayout, opts: SvgOptions = {}): string {
  const c = opts.dark
    ? { bg: '#0d1219', fg: '#e6edf5', muted: '#8b98a9', body: '#18212d', stroke: '#9fb0c4', wire: '#56637a', high: '#34d399', pad: '#131a24' }
    : { bg: '#ffffff', fg: '#0f1722', muted: '#5a6677', body: '#f4f7fb', stroke: '#334155', wire: '#64748b', high: '#059669', pad: '#ffffff' }
  const val = (id: string) => opts.values?.[id]
  const wireColor = (net: string) => (val(net) === 1 ? c.high : c.wire)
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" font-family="JetBrains Mono, ui-monospace, monospace">`)
  out.push(`<rect width="100%" height="100%" fill="${c.bg}"/>`)
  out.push('<g fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">')
  for (const w of layout.wires) {
    out.push(`<polyline points="${w.points.map((p) => `${p.x},${p.y}`).join(' ')}" stroke="${wireColor(w.net)}"/>`)
  }
  out.push('</g>')
  for (const j of layout.junctions) out.push(`<circle cx="${j.x}" cy="${j.y}" r="3.2" fill="${wireColor(j.net)}"/>`)
  for (const n of layout.nodes) {
    const v = val(n.id)
    if (n.type === 'INPUT' || n.type === 'OUTPUT' || n.type === 'CONST0' || n.type === 'CONST1') {
      const hi = v === 1 || n.type === 'CONST1'
      out.push(`<g transform="translate(${n.x},${n.y})">`)
      out.push(`<rect width="${n.w}" height="${n.h}" rx="${n.h / 2}" fill="${c.pad}" stroke="${hi && opts.values ? c.high : c.stroke}" stroke-width="1.6"/>`)
      out.push(`<text x="${n.w / 2}" y="${n.h / 2 + 4}" text-anchor="middle" font-size="12" fill="${c.fg}">${esc(n.label)}${opts.values && v !== undefined && n.type !== 'CONST0' && n.type !== 'CONST1' ? ` = ${v}` : ''}</text>`)
      out.push('</g>')
      continue
    }
    const g = gateGeometry(n.type)
    out.push(`<g transform="translate(${n.x},${n.y})" stroke="${c.stroke}" stroke-width="1.8">`)
    for (const [x1, y1, x2, y2] of g.leads) out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    out.push(`<path d="${g.body}" fill="${c.body}"/>`)
    if (g.back) out.push(`<path d="${g.back}" fill="none"/>`)
    if (g.bubble) out.push(`<circle cx="${g.bubble.cx}" cy="${g.bubble.cy}" r="${g.bubble.r}" fill="${c.body}"/>`)
    out.push(`<text x="${n.type === 'NOT' ? 25 : n.type.includes('XOR') ? 33 : n.type.endsWith('OR') ? 29 : 27}" y="26" text-anchor="middle" font-size="9" fill="${c.muted}" stroke="none">${n.type}</text>`)
    out.push('</g>')
  }
  out.push('</svg>')
  return out.join('\n')
}
