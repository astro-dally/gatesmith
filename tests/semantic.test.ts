import { describe, expect, it } from 'vitest'
import { lex } from '@/compiler/lexer'
import { parse } from '@/compiler/parser'
import { analyze } from '@/compiler/semantic'

const check = (src: string) => {
  const p = parse(lex(src).tokens)
  expect(p.diagnostics).toEqual([])
  return analyze(p.program)
}
const codes = (src: string) => check(src).diagnostics.map((d) => d.code).sort()

describe('semantic analysis', () => {
  it('accepts the specification example with no diagnostics', () => {
    const r = check('input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;')
    expect(r.diagnostics).toEqual([])
    expect(r.symbols.map((s) => [s.name, s.kind, s.usages.length])).toEqual([
      ['a', 'input', 1], ['b', 'input', 1], ['c', 'input', 1], ['out', 'output', 0],
    ])
    expect(r.table.lookup('out')!.driver).toMatchObject({ line: 3, expr: 'a AND b OR NOT c' })
  })

  it('E301 undeclared identifier, with an edit-distance suggestion', () => {
    const r = check('input a, b;\noutput o;\no = a AND bb;')
    // b is not reported as unused: it is the likely intended target of the typo.
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]).toMatchObject({ code: 'E301', suggestion: 'Did you mean `b`?', span: { line: 3, col: 11 } })
  })

  it('E301 for an undeclared assignment target', () => {
    expect(codes('input a;\nresult = a;')).toEqual(['E301', 'W303'])
  })

  it('E302 duplicate declaration (same and different kind)', () => {
    expect(codes('input a, a;\noutput o;\no = a;')).toEqual(['E302'])
    const r = check('input a;\noutput a;\na = 1;')
    expect(r.diagnostics.map((d) => d.code)).toContain('E302')
    expect(r.diagnostics.find((d) => d.code === 'E302')!.message).toMatch(/already declared as an input on line 1/)
  })

  it('E303 output assigned more than once', () => {
    const r = check('input a, b;\noutput o;\no = a;\no = b;')
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E303'])
    expect(r.diagnostics[0].message).toMatch(/first assigned on line 3/)
    expect(r.diagnostics[0].span.line).toBe(4)
  })

  it('E308 wire assigned more than once', () => {
    expect(codes('input a;\noutput o;\nwire w;\nw = a;\nw = NOT a;\no = w;')).toEqual(['E308'])
  })

  it('E304 assignment to an input', () => {
    expect(codes('input a;\noutput o;\na = 1;\no = a;')).toEqual(['E304'])
  })

  it('E305 output never assigned', () => {
    expect(codes('input a;\noutput o, p;\no = a;')).toEqual(['E305'])
  })

  it('E306 wire used but never driven', () => {
    expect(codes('input a;\noutput o;\nwire w;\no = a AND w;')).toEqual(['E306'])
  })

  it('E306 wire used before its driving assignment', () => {
    const r = check('input a;\noutput o;\nwire w;\no = w;\nw = NOT a;')
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E306'])
    expect(r.diagnostics[0].message).toBe('`w` is used on line 4 before it is driven on line 5.')
  })

  it('E307 combinational cycle among wires, reported once with its path', () => {
    const r = check('input a;\noutput o;\nwire w1, w2;\nw1 = w2 AND a;\nw2 = NOT w1;\no = w1;')
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E307'])
    expect(r.diagnostics[0].message).toBe('Combinational cycle: w1 → w2 → w1.')
  })

  it('E307 self-loop', () => {
    expect(codes('input a;\noutput o;\nwire w;\nw = w OR a;\no = w;')).toEqual(['E307'])
  })

  it('W301 unused input and W302 unused wire are warnings, not errors', () => {
    const r = check('input a, b;\noutput o;\nwire w;\no = a;')
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([['W301', 'warning'], ['W302', 'warning']])
  })

  it('W303 when no outputs are declared', () => {
    expect(codes('input a;\nwire w;\nw = a;')).toEqual(['W302', 'W303'])
  })

  it('reports every independent semantic error in one run', () => {
    const src = 'input a, b;\noutput o, p, q;\no = a;\no = b;\na = 0;\np = c;'
    expect(codes(src)).toEqual(['E301', 'E303', 'E304', 'E305'])
  })

  it('records usage counts and dependencies for valid programs', () => {
    const r = check('input a, b;\noutput s, c;\nwire t;\nt = a XOR b;\ns = t;\nc = a AND b AND t;')
    expect(r.table.lookup('a')!.usages).toHaveLength(2)
    expect(r.dependencies).toEqual({ t: ['a', 'b'], s: ['t'], c: ['a', 'b', 't'] })
  })
})
