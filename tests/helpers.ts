import type { Expr } from '@/compiler/ast'
import { compile } from '@/compiler/pipeline'

/** Reference interpreter straight over the AST, independent of the IR. */
export function evalExpr(e: Expr, env: Record<string, 0 | 1>): 0 | 1 {
  switch (e.kind) {
    case 'Const': return e.value
    case 'Ident': return env[e.name] ?? 0
    case 'Unary': return (evalExpr(e.operand, env) ^ 1) as 0 | 1
    case 'Binary': {
      const a = evalExpr(e.left, env), b = evalExpr(e.right, env)
      const r = { AND: a & b, OR: a | b, XOR: a ^ b, NAND: (a & b) ^ 1, NOR: (a | b) ^ 1, XNOR: (a ^ b) ^ 1 }[e.op]
      return r as 0 | 1
    }
  }
}

/** Seeded PRNG (mulberry32) so failures are reproducible. */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const OPS = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', '&', '|', '^']
/** Random expression over the given variables, biased towards redundancy so optimiser rules fire. */
export function randomExpr(r: () => number, vars: string[], depth: number): string {
  const roll = r()
  if (depth <= 0 || roll < 0.15) {
    if (r() < 0.15) return r() < 0.5 ? '0' : '1'
    return vars[Math.floor(r() * vars.length)]
  }
  if (roll < 0.3) return `${r() < 0.5 ? 'NOT ' : '!'}${randomExpr(r, vars, depth - 1)}`
  const op = OPS[Math.floor(r() * OPS.length)]
  const left = randomExpr(r, vars, depth - 1)
  const right = r() < 0.2 ? left : randomExpr(r, vars, depth - 1) // duplicates feed CSE/idempotence
  return `(${left} ${op} ${right})`
}

export function compileOk(src: string) {
  const r = compile(src)
  const errs = r.diagnostics.filter((d) => d.severity === 'error')
  if (errs.length) throw new Error(`Unexpected errors: ${errs.map((d) => `${d.code} ${d.message}`).join('; ')}`)
  return r
}
