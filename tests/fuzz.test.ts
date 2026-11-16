import { describe, expect, it } from 'vitest'
import { compile } from '@/compiler/pipeline'
import type { Assignment } from '@/compiler/ast'
import { evaluateIR } from '@/compiler/ir'
import { evalExpr, randomExpr, rng } from './helpers'

describe('robustness fuzzing', () => {
  it('never throws on 1500 random strings, and every diagnostic has a valid span', () => {
    const r = rng(42)
    const alphabet = 'abcxyz01 \n\t;,=()!~&|^@#$/*\'"input output wire AND OR NOT XOR NAND'
    for (let n = 0; n < 1500; n++) {
      const len = Math.floor(r() * 120)
      let s = ''
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(r() * alphabet.length)]
      const res = compile(s)
      expect(res.diagnostics.every((d) => d.code !== 'E900')).toBe(true)
      for (const d of res.diagnostics) {
        expect(d.span.start).toBeGreaterThanOrEqual(0)
        expect(d.span.end).toBeLessThanOrEqual(s.length)
      }
    }
  })

  it('never throws on mutated valid programs (random deletions and insertions)', () => {
    const r = rng(7)
    const base = 'input a, b, cin;\noutput sum, cout;\nwire p;\np = a XOR b;\nsum = p XOR cin;\ncout = (a AND b) OR (p AND cin); // c\n/* x */'
    const junk = ';()=,!&|^ab1'
    for (let n = 0; n < 1500; n++) {
      let s = base
      const edits = 1 + Math.floor(r() * 4)
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(r() * s.length)
        s = r() < 0.5 ? s.slice(0, at) + s.slice(at + 1) : s.slice(0, at) + junk[Math.floor(r() * junk.length)] + s.slice(at)
      }
      const res = compile(s)
      expect(res.diagnostics.every((d) => d.code !== 'E900')).toBe(true)
    }
  })

  it('handles hostile inputs: huge files, binary noise, deep nesting', () => {
    expect(() => compile('\u0000\uffff\ud800'.repeat(200))).not.toThrow()
    expect(compile(`input a;\noutput y;\ny = ${'('.repeat(20000)}a${')'.repeat(20000)};`).diagnostics[0].code).toBe('E208')
    const big = compile(Array.from({ length: 3000 }, (_, i) => `wire w${i};`).join('\n'))
    expect(big.ok).toBe(true)
  })
})

describe('optimizer equivalence (property test)', () => {
  it('optimised and unoptimised circuits agree on every input for 400 random expressions', () => {
    const r = rng(2024)
    const vars = ['a', 'b', 'c', 'd']
    for (let n = 0; n < 400; n++) {
      const exprs = [randomExpr(r, vars, 5), randomExpr(r, vars, 4)]
      const src = `input a, b, c, d;\noutput y, z;\ny = ${exprs[0]};\nz = ${exprs[1]};`
      const res = compile(src)
      // Unused inputs are fine (warnings); errors are not.
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
      const before = res.ir.data!.program
      const after = res.optimizer.data!.after
      const asts = res.parser.data!.program.body.filter((s): s is Assignment => s.kind === 'Assignment')
      for (let row = 0; row < 16; row++) {
        const env = { a: (row >> 3) & 1, b: (row >> 2) & 1, c: (row >> 1) & 1, d: row & 1 } as Record<string, 0 | 1>
        const u = evaluateIR(before, env), o = evaluateIR(after, env)
        for (const a of asts) {
          const ref = evalExpr(a.expr, env)
          expect(u[a.target.name], `IR vs AST: ${src}`).toBe(ref)
          expect(o[a.target.name], `optimised vs AST: ${src}`).toBe(ref)
        }
      }
      expect(res.codegen.data!.truthTable.equivalence.equivalent).toBe(true)
      expect(res.optimizer.data!.gatesAfter).toBeLessThanOrEqual(res.optimizer.data!.gatesBefore)
    }
  })
})
