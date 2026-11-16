import { describe, expect, it } from 'vitest'
import { compileOk } from './helpers'

/** Compiles `y = <expr>;` over inputs a,b,c and returns the optimised TAC text and rules. */
const opt = (expr: string, inputs = 'a, b, c') => {
  const r = compileOk(`input ${inputs};\noutput y;\ny = ${expr};`)
  const o = r.optimizer.data!
  return { text: o.text, rules: o.applied.map((x) => x.rule), gates: [o.gatesBefore, o.gatesAfter] as const }
}

describe('optimizer rules', () => {
  it('constant folding', () => {
    const r = opt('(1 AND 0) OR (NOT 0)', 'a')
    expect(r.text).toBe('y = 1')
    expect(r.rules).toContain('Constant folding')
  })
  it('identity laws: x AND 1, x OR 0, x XOR 0, x XNOR 1', () => {
    for (const e of ['a AND 1', 'a OR 0', 'a XOR 0', 'a XNOR 1', '1 AND a']) {
      const r = opt(e, 'a')
      expect(r.text).toBe('y = a')
      expect(r.rules).toContain('Identity law')
    }
  })
  it('annihilator laws: x AND 0, x OR 1, x NAND 0, x NOR 1', () => {
    expect(opt('a AND 0', 'a').text).toBe('y = 0')
    expect(opt('a OR 1', 'a').text).toBe('y = 1')
    expect(opt('a NAND 0', 'a').text).toBe('y = 1')
    expect(opt('a NOR 1', 'a').text).toBe('y = 0')
    expect(opt('a OR 1', 'a').rules).toContain('Annihilator law')
  })
  it('inversion law: x XOR 1 = NOT x', () => {
    expect(opt('a XOR 1', 'a').text).toBe('y = NOT a')
  })
  it('double negation removal', () => {
    const r = opt('NOT NOT NOT NOT a', 'a')
    expect(r.text).toBe('y = a')
    expect(r.rules).toContain('Double negation')
    expect(r.gates).toEqual([4, 0])
  })
  it('idempotence and self-cancellation', () => {
    expect(opt('a AND a', 'a').text).toBe('y = a')
    expect(opt('(a OR b) OR (a OR b)', 'a, b').text).toBe('y = OR a b')
    expect(opt('a XOR a', 'a').text).toBe('y = 0')
    expect(opt('a NAND a', 'a').text).toBe('y = NOT a')
  })
  it('complement law', () => {
    expect(opt('a AND NOT a', 'a').text).toBe('y = 0')
    expect(opt('NOT a OR a', 'a').text).toBe('y = 1')
  })
  it('common-subexpression elimination, including commuted operands', () => {
    const r = compileOk('input a, b;\noutput x, y;\nx = (a AND b) XOR NOT b;\ny = (b AND a) OR NOT b;')
    const o = r.optimizer.data!
    expect(o.applied.map((x) => x.rule)).toContain('Common subexpression')
    expect(o.gatesAfter).toBe(4) // one AND, one NOT, one XOR, one OR
  })
  it('dead-code elimination removes logic that never reaches an output', () => {
    const r = compileOk('input a, b;\noutput y;\nwire w;\nw = a AND b;\ny = a OR (w AND 0);')
    const o = r.optimizer.data!
    expect(o.text).toBe('y = a')
    expect(o.applied.filter((x) => x.rule === 'Dead code').map((x) => x.dest)).toContain('w')
  })
  it('inverter absorption: NOT (a AND b) becomes one NAND gate', () => {
    const r = opt('NOT (a AND b)', 'a, b')
    expect(r.text).toBe('y = NAND a b')
    expect(r.gates).toEqual([2, 1])
  })
  it('the optimizer showcase example shrinks and stays equivalent', () => {
    const r = compileOk(`input a, b, c;\noutput y, z, k;\nwire spare;\ny = NOT NOT a AND (b OR 0) AND 1;\nz = (a AND b) OR (b AND a) OR (c AND NOT c);\nspare = a XOR a;\nk = spare OR (1 AND 0) OR c;`)
    const o = r.optimizer.data!
    expect(o.text).toBe('y = AND a b\nz = y\nk = c')
    expect(o.gatesBefore).toBeGreaterThan(10)
    expect(o.gatesAfter).toBe(1)
    expect(r.codegen.data!.truthTable.equivalence.equivalent).toBe(true)
  })
})
