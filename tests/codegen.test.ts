import { describe, expect, it } from 'vitest'
import { compile } from '@/compiler/pipeline'
import { minimizeSOP, canonicalSOP } from '@/compiler/codegen'
import { generateIR, formatProgram, buildNetlist } from '@/compiler/ir'
import { lex } from '@/compiler/lexer'
import { parse } from '@/compiler/parser'
import { analyze } from '@/compiler/semantic'
import { compileOk } from './helpers'

const column = (src: string, out: string) => {
  const t = compileOk(src).codegen.data!.truthTable
  const i = t.outputs.indexOf(out)
  return t.rows!.map((r) => r.outputs[i]).join('')
}

describe('IR generation', () => {
  it('produces the three-address code from the specification', () => {
    const p = parse(lex('input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;').tokens).program
    const ir = generateIR(analyze(p))
    expect(formatProgram(ir)).toBe('t1 = AND a b\nt2 = NOT c\nout = OR t1 t2')
  })
  it('never lets a temporary collide with a user signal named t1', () => {
    const r = compileOk('input t1, b;\noutput o;\no = NOT (t1 AND b);')
    expect(r.ir.data!.text).toBe('t2 = AND t1 b\no = NOT t2')
  })
  it('builds a netlist DAG where copies are connections, not gates', () => {
    const p = parse(lex('input a;\noutput o, p;\no = a;\np = NOT a;').tokens).program
    const net = buildNetlist(generateIR(analyze(p)))
    expect(net.gateCount).toBe(1)
    expect(net.nodes.find((n) => n.id === 'out:o')!.inputs).toEqual(['in:a'])
  })
})

describe('truth tables', () => {
  it('spec example', () => {
    expect(column('input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;', 'out')).toBe('10101011')
  })
  it('half adder', () => {
    const src = 'input a, b;\noutput sum, carry;\nsum = a ^ b;\ncarry = a & b;'
    expect(column(src, 'sum')).toBe('0110')
    expect(column(src, 'carry')).toBe('0001')
  })
  it('full adder', () => {
    const src = 'input a, b, cin;\noutput sum, cout;\nwire p, g1, g2;\np = a XOR b;\ng1 = a AND b;\nsum = p XOR cin;\ng2 = p AND cin;\ncout = g1 OR g2;'
    expect(column(src, 'sum')).toBe('01101001')
    expect(column(src, 'cout')).toBe('00010111')
  })
  it('2-to-1 MUX, majority, XOR from basic gates and NAND-only XOR', () => {
    expect(column('input s, d0, d1;\noutput y;\ny = (NOT s AND d0) OR (s AND d1);', 'y')).toBe('00110101')
    expect(column('input a, b, c;\noutput m;\nm = (a AND b) OR (a AND c) OR (b AND c);', 'm')).toBe('00010111')
    expect(column('input a, b;\noutput y;\ny = (a AND NOT b) OR (NOT a AND b);', 'y')).toBe('0110')
    expect(column('input a, b;\noutput y;\nwire n1, n2, n3;\nn1 = a NAND b;\nn2 = a NAND n1;\nn3 = b NAND n1;\ny = n2 NAND n3;', 'y')).toBe('0110')
  })
  it('records minterms and a sigma expression', () => {
    const f = compileOk('input a, b, c;\noutput m;\nm = (a AND b) OR (a AND c) OR (b AND c);').codegen.data!.truthTable.functions[0]
    expect(f.minterms).toEqual([3, 5, 6, 7])
    expect(f.sigma).toBe('Σm(3, 5, 6, 7)')
  })
  it('handles zero inputs (a single row)', () => {
    const t = compileOk('output y;\ny = 1;').codegen.data!.truthTable
    expect(t.rows).toHaveLength(1)
    expect(t.rows![0].outputs).toEqual([1])
  })
  it('caps the table at 10 inputs with a friendly warning, still checking equivalence', () => {
    const names = Array.from({ length: 11 }, (_, i) => `i${i}`)
    const r = compile(`input ${names.join(', ')};\noutput y;\ny = ${names.join(' XOR ')};`)
    expect(r.codegen.status).toBe('warning')
    expect(r.codegen.data!.truthTable.rows).toBeNull()
    expect(r.codegen.diagnostics[0].code).toBe('W601')
    expect(r.codegen.data!.truthTable.equivalence).toMatchObject({ equivalent: true, exhaustive: false, vectorsChecked: 4096 })
    expect(r.codegen.data!.verilog).toContain('assign y =')
  })
})

describe('sum of products', () => {
  it('Quine–McCluskey finds the minimal majority function', () => {
    expect(minimizeSOP(['a', 'b', 'c'], [3, 5, 6, 7])).toBe('(a AND b) OR (a AND c) OR (b AND c)')
  })
  it('handles constants and single-variable functions', () => {
    expect(minimizeSOP(['a', 'b'], [])).toBe('0')
    expect(minimizeSOP(['a', 'b'], [0, 1, 2, 3])).toBe('1')
    expect(minimizeSOP(['a', 'b'], [2, 3])).toBe('a')
    expect(canonicalSOP(['a', 'b'], [1, 2])).toBe('(NOT a AND b) OR (a AND NOT b)')
  })
})

describe('Verilog and circuit targets', () => {
  it('emits a module with continuous assignments', () => {
    const v = compileOk('input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;').codegen.data!.verilog
    expect(v).toContain('module circuit (')
    expect(v).toContain('input  wire a')
    expect(v).toContain('output wire out')
    expect(v).toContain('assign out = (a & b) | ~c;')
    expect(v.trim().endsWith('endmodule')).toBe(true)
  })
  it('declares shared gates as wires and escapes Verilog keywords', () => {
    const v = compileOk('input reg, b;\noutput x, y;\nx = (reg AND b) OR b;\ny = (reg AND b) XOR b;').codegen.data!.verilog
    expect(v).toMatch(/wire t1;/)
    expect(v).toContain('\\reg ')
  })
  it('lays out every node and routes every connection orthogonally', () => {
    const r = compileOk('input a, b, cin;\noutput sum, cout;\nwire p;\np = a XOR b;\nsum = p XOR cin;\ncout = (a AND b) OR (p AND cin);')
    const layout = r.codegen.data!.circuit!
    const net = r.optimizer.data!.netlist
    expect(layout.nodes).toHaveLength(net.nodes.length)
    expect(layout.wires).toHaveLength(net.nodes.reduce((s, n) => s + n.inputs.length, 0))
    for (const w of layout.wires) {
      for (let i = 1; i < w.points.length; i++) {
        const a = w.points[i - 1], b = w.points[i]
        expect(a.x === b.x || a.y === b.y).toBe(true)
      }
    }
    const inputsX = layout.nodes.filter((n) => n.type === 'INPUT').map((n) => n.x)
    const outputsX = layout.nodes.filter((n) => n.type === 'OUTPUT').map((n) => n.x)
    expect(Math.max(...inputsX)).toBeLessThan(Math.min(...outputsX))
    expect(r.codegen.data!.svg).toMatch(/^<svg[\s\S]*<\/svg>$/)
  })
})

describe('performance and evaluator', () => {
  it('the slot-compiled evaluator agrees with the reference interpreter', async () => {
    const { compileEvaluator, evaluateIR } = await import('@/compiler/ir')
    const r = compileOk('input a, b, cin;\noutput sum, cout;\nwire p;\np = a XOR b;\nsum = p XNOR NOT cin;\ncout = (a NAND b) NOR (p AND cin) OR 0;')
    const p = r.ir.data!.program
    const fast = compileEvaluator(p)
    for (let row = 0; row < 8; row++) {
      const bits = [(row >> 2) & 1, (row >> 1) & 1, row & 1]
      const slow = evaluateIR(p, { a: bits[0], b: bits[1], cin: bits[2] } as Record<string, 0 | 1>)
      const m = fast.run(bits)
      for (const o of p.outputs) expect(m[fast.slotOf(o)]).toBe(slow[o])
    }
  })

  it('compiles a 320-statement, 10-input program quickly', () => {
    const ins = Array.from({ length: 10 }, (_, i) => `x${i}`)
    const wires = Array.from({ length: 300 }, (_, i) => `w${i}`)
    const lines = [`input ${ins.join(', ')};`, 'output o;', `wire ${wires.join(', ')};`]
    wires.forEach((w, i) => {
      const a = i < 10 ? ins[i] : wires[i - 1 - (i % 7)]
      lines.push(`${w} = (${a} AND NOT ${ins[(i * 3) % 10]}) XOR (${i < 2 ? ins[5] : wires[Math.floor(i / 2)]} OR ${ins[i % 10]});`)
    })
    lines.push('o = w299;')
    const t0 = performance.now()
    const r = compile(lines.join('\n'))
    const ms = performance.now() - t0
    expect(r.codegen.status).not.toBe('skipped')
    expect(r.codegen.data!.truthTable.rows).toHaveLength(1024)
    expect(r.codegen.data!.truthTable.equivalence.equivalent).toBe(true)
    expect(ms).toBeLessThan(2000) // ~60 ms locally; generous bound for slow CI machines
  })
})
