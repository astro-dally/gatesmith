/**
 * codegen.ts — Phase 6: code generation for the truth-table and Verilog targets.
 * (The circuit-diagram target lives in circuit.ts.)
 *
 * Truth table: the optimised TAC is interpreted for all 2^n input vectors,
 * input 0 being the most significant bit of the row index. The unoptimised
 * TAC is interpreted alongside it, which turns every truth table into an
 * equivalence proof for the optimiser. Above MAX_TABLE_INPUTS the table is not
 * built; equivalence is then checked on a fixed set of pseudo-random vectors.
 */
import { type IRProgram, type Instr, type Operand, compileEvaluator } from './ir'

export const MAX_TABLE_INPUTS = 10
const RANDOM_VECTORS = 4096
const MAX_QM_INPUTS = 8

export interface TruthRow {
  index: number
  inputs: (0 | 1)[]
  outputs: (0 | 1)[]
}

export interface OutputFunction {
  name: string
  minterms: number[]
  /** Σm(1,3,5) */
  sigma: string
  /** Full canonical sum of products (null when too long to be useful). */
  canonical: string | null
  /** Minimal sum of products from Quine–McCluskey (null above MAX_QM_INPUTS). */
  minimal: string | null
}

export interface TruthTable {
  inputs: string[]
  outputs: string[]
  /** Null when there are more than MAX_TABLE_INPUTS inputs. */
  rows: TruthRow[] | null
  functions: OutputFunction[]
  equivalence: {
    equivalent: boolean
    vectorsChecked: number
    exhaustive: boolean
    /** Row indices (or random vectors) where optimised ≠ unoptimised. */
    mismatches: number[]
  }
}

export function buildTruthTable(unoptimized: IRProgram, optimized: IRProgram): TruthTable {
  const { inputs, outputs } = optimized
  const n = inputs.length
  const exhaustive = n <= MAX_TABLE_INPUTS
  const mismatches: number[] = []

  const opt = compileEvaluator(optimized)
  const ref = compileEvaluator(unoptimized)
  const optOut = outputs.map(opt.slotOf)
  const refOut = outputs.map(ref.slotOf)
  const bits = new Uint8Array(n)

  const rows: TruthRow[] = []
  if (exhaustive) {
    for (let r = 0; r < 2 ** n; r++) {
      for (let i = 0; i < n; i++) bits[i] = (r >> (n - 1 - i)) & 1
      const o = opt.run(bits)
      const u = ref.run(bits)
      const outs = optOut.map((s) => o[s] as 0 | 1)
      if (refOut.some((s, k) => u[s] !== outs[k])) mismatches.push(r)
      rows.push({ index: r, inputs: Array.from(bits) as (0 | 1)[], outputs: outs })
    }
  } else {
    // Deterministic xorshift PRNG so results are reproducible.
    let seed = 0x9e3779b9
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >>> 17
      seed ^= seed << 5; seed >>>= 0
      return seed
    }
    for (let t = 0; t < RANDOM_VECTORS; t++) {
      for (let i = 0; i < n; i++) bits[i] = rand() & 1
      const o = opt.run(bits)
      const u = ref.run(bits)
      if (refOut.some((s, k) => u[s] !== o[optOut[k]])) mismatches.push(t)
    }
  }

  const functions: OutputFunction[] = outputs.map((name, oi) => {
    const minterms = exhaustive ? rows.filter((r) => r.outputs[oi] === 1).map((r) => r.index) : []
    return {
      name,
      minterms,
      sigma: exhaustive ? `Σm(${minterms.join(', ')})` : '',
      canonical: exhaustive && minterms.length <= 32 ? canonicalSOP(inputs, minterms) : null,
      minimal: exhaustive && n <= MAX_QM_INPUTS ? minimizeSOP(inputs, minterms) : null,
    }
  })

  return {
    inputs,
    outputs,
    rows: exhaustive ? rows : null,
    functions,
    equivalence: {
      equivalent: mismatches.length === 0,
      vectorsChecked: exhaustive ? 2 ** n : RANDOM_VECTORS,
      exhaustive,
      mismatches,
    },
  }
}

// ─────────────────────── Sum-of-products ───────────────────────

/** An implicant: `bits` are fixed literal values; `mask` marks don't-care positions. */
interface Implicant {
  bits: number
  mask: number
  covers: number[]
}

function termToString(vars: string[], t: { bits: number; mask: number }): string {
  const n = vars.length
  const lits: string[] = []
  for (let i = 0; i < n; i++) {
    const bit = 1 << (n - 1 - i)
    if (t.mask & bit) continue
    lits.push(t.bits & bit ? vars[i] : `NOT ${vars[i]}`)
  }
  return lits.length ? lits.join(' AND ') : '1'
}

function joinTerms(terms: string[]): string {
  if (terms.length === 0) return '0'
  if (terms.length === 1) return terms[0]
  return terms.map((t) => (t.includes(' AND ') ? `(${t})` : t)).join(' OR ')
}

export function canonicalSOP(vars: string[], minterms: number[]): string {
  if (vars.length === 0) return minterms.length ? '1' : '0'
  return joinTerms(minterms.map((m) => termToString(vars, { bits: m, mask: 0 })))
}

/**
 * Quine–McCluskey minimisation.
 *  1. Start with one implicant per minterm.
 *  2. Repeatedly merge pairs with the same mask that differ in exactly one
 *     fixed bit; anything never merged is a prime implicant.
 *  3. Pick essential primes (sole cover of some minterm), then cover the rest
 *     greedily by most new minterms, fewest literals as a tie-break.
 * Greedy covering is not guaranteed minimal in every case (Petrick's method
 * would be), but it is exact for every example shipped with the app.
 */
export function minimizeSOP(vars: string[], minterms: number[]): string {
  const n = vars.length
  const full = 2 ** n
  if (minterms.length === 0) return '0'
  if (minterms.length === full) return '1'

  let current: Implicant[] = minterms.map((m) => ({ bits: m, mask: 0, covers: [m] }))
  const primes: Implicant[] = []
  while (current.length) {
    const used = new Set<number>()
    const next = new Map<string, Implicant>()
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i], b = current[j]
        if (a.mask !== b.mask) continue
        const diff = a.bits ^ b.bits
        if (diff === 0 || (diff & (diff - 1)) !== 0) continue // must differ in exactly one bit
        used.add(i)
        used.add(j)
        const mask = a.mask | diff
        const bits = a.bits & ~diff
        const key = `${bits}/${mask}`
        if (!next.has(key)) next.set(key, { bits, mask, covers: [...new Set([...a.covers, ...b.covers])] })
      }
    }
    current.forEach((imp, i) => { if (!used.has(i)) primes.push(imp) })
    current = [...next.values()]
  }

  const uncovered = new Set(minterms)
  const chosen: Implicant[] = []
  const literals = (p: Implicant) => n - popcount(p.mask)
  // Essential prime implicants.
  for (const m of minterms) {
    const coverers = primes.filter((p) => p.covers.includes(m))
    if (coverers.length === 1 && !chosen.includes(coverers[0])) {
      chosen.push(coverers[0])
      coverers[0].covers.forEach((c) => uncovered.delete(c))
    }
  }
  // Greedy cover for the rest.
  while (uncovered.size) {
    let best: Implicant | null = null
    let bestGain = -1
    for (const p of primes) {
      const gain = p.covers.filter((c) => uncovered.has(c)).length
      if (gain > bestGain || (gain === bestGain && best && literals(p) < literals(best))) {
        best = p
        bestGain = gain
      }
    }
    if (!best || bestGain <= 0) break
    chosen.push(best)
    best.covers.forEach((c) => uncovered.delete(c))
  }

  const terms = chosen
    .sort((a, b) => literals(a) - literals(b) || b.bits - a.bits)
    .map((p) => termToString(vars, p))
  return joinTerms(terms)
}

function popcount(x: number): number {
  let c = 0
  while (x) { x &= x - 1; c++ }
  return c
}

// ─────────────────────────── Verilog ───────────────────────────

const VERILOG_RESERVED = new Set([
  'always', 'and', 'assign', 'begin', 'buf', 'case', 'default', 'else', 'end', 'endcase', 'endmodule',
  'for', 'function', 'if', 'initial', 'inout', 'input', 'integer', 'module', 'nand', 'negedge', 'nor',
  'not', 'or', 'output', 'parameter', 'posedge', 'reg', 'supply0', 'supply1', 'task', 'tri', 'wire',
  'xnor', 'xor', 'logic', 'bit', 'byte', 'int', 'signed', 'unsigned', 'generate', 'genvar',
])

/** Escapes names that collide with Verilog keywords using Verilog escaped identifiers. */
function vname(name: string): string {
  return VERILOG_RESERVED.has(name) ? `\\${name} ` : name
}

/**
 * Emits a synthesisable Verilog module with continuous assignments.
 * Temporaries used once are inlined back into expressions; anything used more
 * than once (a shared gate) becomes an internal `wire`.
 */
export function generateVerilog(p: IRProgram, moduleName = 'circuit'): string {
  const uses = new Map<string, number>()
  for (const i of p.instrs) for (const a of i.args) if (a.kind === 'var') uses.set(a.name, (uses.get(a.name) ?? 0) + 1)
  const outputs = new Set(p.outputs)
  const defs = new Map(p.instrs.map((i) => [i.dest, i]))
  const named = p.instrs.filter((i) => !outputs.has(i.dest) && ((uses.get(i.dest) ?? 0) > 1 || p.wires.includes(i.dest)))
  const namedSet = new Set(named.map((i) => i.dest))

  const operand = (o: Operand, nested: boolean): string => {
    if (o.kind === 'const') return o.value ? "1'b1" : "1'b0"
    const def = defs.get(o.name)
    if (def && !outputs.has(o.name) && !namedSet.has(o.name)) return expr(def, nested)
    return vname(o.name)
  }
  const expr = (i: Instr, nested: boolean): string => {
    const [a, b] = i.args
    let s: string
    switch (i.op) {
      case 'COPY': return operand(a, nested)
      case 'NOT': return `~${operand(a, true)}`
      case 'AND': s = `${operand(a, true)} & ${operand(b, true)}`; break
      case 'OR': s = `${operand(a, true)} | ${operand(b, true)}`; break
      case 'XOR': s = `${operand(a, true)} ^ ${operand(b, true)}`; break
      case 'NAND': return `~(${operand(a, true)} & ${operand(b, true)})`
      case 'NOR': return `~(${operand(a, true)} | ${operand(b, true)})`
      case 'XNOR': return `~(${operand(a, true)} ^ ${operand(b, true)})`
    }
    return nested ? `(${s})` : s
  }

  const ports = [
    ...p.inputs.map((n) => `  input  wire ${vname(n)}`),
    ...p.outputs.map((n) => `  output wire ${vname(n)}`),
  ]
  const lines: string[] = [
    '// Generated by Gatesmith, a logic gate description compiler.',
    '// Combinational logic only: every output is a continuous assignment.',
    `module ${moduleName} (`,
    ports.join(',\n'),
    ');',
  ]
  if (named.length) {
    lines.push('', ...named.map((i) => `  wire ${vname(i.dest)};`))
  }
  lines.push('')
  for (const i of p.instrs) {
    if (outputs.has(i.dest) || namedSet.has(i.dest)) lines.push(`  assign ${vname(i.dest)} = ${expr(i, false)};`)
  }
  lines.push('', 'endmodule', '')
  return lines.join('\n')
}
