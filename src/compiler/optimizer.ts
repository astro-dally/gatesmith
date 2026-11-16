/**
 * optimizer.ts — Phase 5: machine-independent optimisation of the TAC.
 *
 * Each pass walks the instructions once, top to bottom:
 *   1. propagate known copies and constants into operands;
 *   2. rewrite the instruction with algebraic laws until none applies;
 *   3. value-number it to find common subexpressions;
 * then a backward liveness sweep removes dead code. Passes repeat until the
 * program stops changing (a fixpoint), because one rewrite often enables
 * another (folding exposes a copy, the copy exposes a double negation, ...).
 *
 * Every rewrite is logged with its rule name and a before → after string so
 * the UI can explain exactly what happened. Correctness is verified by
 * comparing truth tables of the program before and after (see codegen.ts and
 * tests/optimizer.test.ts).
 */
import {
  COMMUTATIVE, type IRProgram, type Instr, type Op, type Operand,
  applyOp, formatInstr, gateCount, k, operandToString, v,
} from './ir'

export type RuleName =
  | 'Constant folding'
  | 'Constant propagation'
  | 'Copy propagation'
  | 'Identity law'
  | 'Annihilator law'
  | 'Inversion law'
  | 'Idempotence'
  | 'Self-cancellation'
  | 'Complement law'
  | 'Double negation'
  | 'Inverter absorption'
  | 'Common subexpression'
  | 'Copy coalescing'
  | 'Dead code'

export interface AppliedRule {
  rule: RuleName
  dest: string
  before: string
  after: string
  pass: number
}

export interface OptimizeResult {
  before: IRProgram
  after: IRProgram
  applied: AppliedRule[]
  gatesBefore: number
  gatesAfter: number
  passes: number
}

const MAX_PASSES = 25

/** One-line description of every rule, shown in the optimizer view and the report. */
export const RULE_DOCS: Record<RuleName, string> = {
  'Constant folding': 'An operator whose operands are all constants is evaluated at compile time: AND 1 0 → 0.',
  'Constant propagation': 'A name known to hold a constant is replaced by that constant where it is used.',
  'Copy propagation': 'After x = y, later uses of x read y directly, so the copy can die.',
  'Identity law': 'x AND 1 = x, x OR 0 = x, x XOR 0 = x, x XNOR 1 = x.',
  'Annihilator law': 'x AND 0 = 0, x OR 1 = 1, x NAND 0 = 1, x NOR 1 = 0.',
  'Inversion law': 'x XOR 1 = NOT x, x XNOR 0 = NOT x, x NAND 1 = NOT x, x NOR 0 = NOT x.',
  'Idempotence': 'x AND x = x, x OR x = x; x NAND x = NOT x, x NOR x = NOT x.',
  'Self-cancellation': 'x XOR x = 0, x XNOR x = 1.',
  'Complement law': 'x AND NOT x = 0, x OR NOT x = 1, x XOR NOT x = 1.',
  'Double negation': 'NOT NOT x = x.',
  'Inverter absorption': 'NOT (a AND b) = a NAND b (and likewise for OR/XOR), saving one gate when the inner gate has no other use.',
  'Common subexpression': 'Two instructions computing the same operator on the same operands share one gate.',
  'Copy coalescing': 'When an output is just a copy of a temporary (y = t1), the temporary is renamed to y and the copy disappears.',
  'Dead code': 'An instruction whose result never reaches an output is removed.',
}

export function optimize(input: IRProgram): OptimizeResult {
  const applied: AppliedRule[] = []
  const outputs = new Set(input.outputs)
  let instrs = input.instrs.map(cloneInstr)
  let passes = 0

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    passes = pass
    const before = instrs.map(formatInstr).join('\n')
    instrs = forwardPass(instrs, outputs, applied, pass)
    instrs = deadCodePass(instrs, outputs, applied, pass)
    instrs = coalescePass(instrs, outputs, new Set(input.inputs), applied, pass)
    if (instrs.map(formatInstr).join('\n') === before) break
  }

  const after: IRProgram = { ...input, instrs }
  return { before: input, after, applied, gatesBefore: gateCount(input), gatesAfter: gateCount(after), passes }
}

function cloneInstr(i: Instr): Instr {
  return { ...i, args: i.args.map((a) => ({ ...a })) }
}

const same = (a: Operand, b: Operand) =>
  a.kind === b.kind && (a.kind === 'var' ? a.name === (b as typeof a).name : a.value === (b as typeof a).value)
const isConst = (o: Operand, value?: 0 | 1) => o.kind === 'const' && (value === undefined || o.value === value)

function forwardPass(instrs: Instr[], outputs: Set<string>, log: AppliedRule[], pass: number): Instr[] {
  const env = new Map<string, Operand>() // name → known replacement (copy or constant)
  const defs = new Map<string, Instr>() // name → its (rewritten) defining instruction
  const table = new Map<string, string>() // value-number key → name holding that value
  const uses = countUses(instrs)
  const out: Instr[] = []
  const record = (rule: RuleName, from: Instr, to: Instr) =>
    log.push({ rule, dest: from.dest, before: formatInstr(from), after: formatInstr(to), pass })

  for (const original of instrs) {
    // 1. Copy / constant propagation.
    let cur = original
    const args = cur.args.map((a) => (a.kind === 'var' && env.has(a.name) ? env.get(a.name)! : a))
    if (args.some((a, i) => !same(a, cur.args[i]))) {
      const next = { ...cur, args }
      const constant = args.some((a, i) => a.kind === 'const' && cur.args[i].kind === 'var')
      record(constant ? 'Constant propagation' : 'Copy propagation', cur, next)
      cur = next
    }

    // 2. Algebraic simplification, repeated until no rule applies.
    for (let guard = 0; guard < 8; guard++) {
      const r = simplify(cur, defs, uses, outputs)
      if (!r) break
      record(r.rule, cur, r.instr)
      cur = r.instr
    }

    // 3. Common-subexpression elimination by value numbering.
    if (cur.op !== 'COPY') {
      const key = valueKey(cur)
      const existing = table.get(key)
      if (existing !== undefined) {
        const next: Instr = { ...cur, op: 'COPY', args: [v(existing)] }
        record('Common subexpression', cur, next)
        cur = next
      } else {
        table.set(key, cur.dest)
      }
    }

    if (cur.op === 'COPY') env.set(cur.dest, cur.args[0])
    defs.set(cur.dest, cur)
    out.push(cur)
  }
  return out
}

/** Canonical key: operator plus operands, sorted for commutative operators. */
function valueKey(i: Instr): string {
  const parts = i.args.map(operandToString)
  if (COMMUTATIVE.has(i.op)) parts.sort()
  return `${i.op}(${parts.join(',')})`
}

function countUses(instrs: Instr[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of instrs) for (const a of i.args) if (a.kind === 'var') m.set(a.name, (m.get(a.name) ?? 0) + 1)
  return m
}

const COMPLEMENT: Partial<Record<Op, Op>> = {
  AND: 'NAND', NAND: 'AND', OR: 'NOR', NOR: 'OR', XOR: 'XNOR', XNOR: 'XOR',
}

/** Returns the first algebraic rewrite that applies to `i`, or null. */
function simplify(
  i: Instr,
  defs: Map<string, Instr>,
  uses: Map<string, number>,
  outputs: Set<string>,
): { rule: RuleName; instr: Instr } | null {
  const to = (rule: RuleName, op: Op, args: Operand[]) => ({ rule, instr: { ...i, op, args } })
  const copy = (rule: RuleName, o: Operand) => to(rule, 'COPY', [o])
  const not = (rule: RuleName, o: Operand) => to(rule, 'NOT', [o])

  if (i.op === 'COPY') return null

  // Constant folding: every operand known.
  if (i.args.every((a) => a.kind === 'const')) {
    const vals = i.args.map((a) => (a as { value: 0 | 1 }).value)
    return copy('Constant folding', k(applyOp(i.op, vals[0], vals[1] ?? 0)))
  }

  if (i.op === 'NOT') {
    const [a] = i.args
    const inner = a.kind === 'var' ? defs.get(a.name) : undefined
    if (inner?.op === 'NOT') return copy('Double negation', inner.args[0])
    const comp = inner ? COMPLEMENT[inner.op] : undefined
    if (inner && comp && a.kind === 'var' && uses.get(a.name) === 1 && !outputs.has(a.name)) {
      return to('Inverter absorption', comp, inner.args)
    }
    return null
  }

  // Binary operators from here on. Normalise so a constant, if any, is on the right.
  let [x, y] = i.args
  if (isConst(x) && !isConst(y)) [x, y] = [y, x]

  if (isConst(y)) {
    const c = (y as { value: 0 | 1 }).value
    switch (i.op) {
      case 'AND': return c ? copy('Identity law', x) : copy('Annihilator law', k(0))
      case 'OR': return c ? copy('Annihilator law', k(1)) : copy('Identity law', x)
      case 'XOR': return c ? not('Inversion law', x) : copy('Identity law', x)
      case 'XNOR': return c ? copy('Identity law', x) : not('Inversion law', x)
      case 'NAND': return c ? not('Inversion law', x) : copy('Annihilator law', k(1))
      case 'NOR': return c ? copy('Annihilator law', k(0)) : not('Inversion law', x)
    }
  }

  if (same(x, y)) {
    switch (i.op) {
      case 'AND': case 'OR': return copy('Idempotence', x)
      case 'NAND': case 'NOR': return not('Idempotence', x)
      case 'XOR': return copy('Self-cancellation', k(0))
      case 'XNOR': return copy('Self-cancellation', k(1))
    }
  }

  // Complement law: one operand is NOT of the other.
  const negates = (p: Operand, q: Operand) => {
    if (p.kind !== 'var') return false
    const d = defs.get(p.name)
    return d?.op === 'NOT' && same(d.args[0], q)
  }
  if (negates(x, y) || negates(y, x)) {
    switch (i.op) {
      case 'AND': case 'NOR': case 'XNOR': return copy('Complement law', k(0))
      case 'OR': case 'NAND': case 'XOR': return copy('Complement law', k(1))
    }
  }
  return null
}

/**
 * Dead-code elimination: a backward liveness sweep. Outputs are live; an
 * instruction is kept only if its destination is live, and then its operands
 * become live too.
 */
function deadCodePass(instrs: Instr[], outputs: Set<string>, log: AppliedRule[], pass: number): Instr[] {
  const live = new Set(outputs)
  const kept: Instr[] = []
  for (let n = instrs.length - 1; n >= 0; n--) {
    const i = instrs[n]
    if (live.has(i.dest)) {
      kept.push(i)
      for (const a of i.args) if (a.kind === 'var') live.add(a.name)
    } else {
      log.push({ rule: 'Dead code', dest: i.dest, before: formatInstr(i), after: '(removed)', pass })
    }
  }
  return kept.reverse()
}

/**
 * Copy coalescing: for `y = t` where y is an output and t is an internal name
 * computed by a gate, rename t to y everywhere and drop the copy. Because every
 * name is assigned exactly once (SSA), the rename cannot change any value.
 */
function coalescePass(instrs: Instr[], outputs: Set<string>, inputs: Set<string>, log: AppliedRule[], pass: number): Instr[] {
  let result = instrs
  for (;;) {
    const defs = new Map(result.map((i) => [i.dest, i]))
    const target = result.find((i) => {
      if (i.op !== 'COPY' || !outputs.has(i.dest)) return false
      const a = i.args[0]
      if (a.kind !== 'var' || outputs.has(a.name) || inputs.has(a.name)) return false
      return defs.get(a.name)?.op !== 'COPY'
    })
    if (!target) return result
    const from = (target.args[0] as { name: string }).name
    const to = target.dest
    log.push({ rule: 'Copy coalescing', dest: to, before: `${formatInstr(defs.get(from)!)}; ${formatInstr(target)}`, after: formatInstr({ ...defs.get(from)!, dest: to }), pass })
    result = result
      .filter((i) => i !== target)
      .map((i) => ({
        ...i,
        dest: i.dest === from ? to : i.dest,
        args: i.args.map((a) => (a.kind === 'var' && a.name === from ? v(to) : a)),
      }))
  }
}
