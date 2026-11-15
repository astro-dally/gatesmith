import { describe, expect, it } from 'vitest'
import { lex } from '@/compiler/lexer'
import { parse } from '@/compiler/parser'
import { type Assignment, type Expr, exprToString } from '@/compiler/ast'

const parseSrc = (src: string) => parse(lex(src).tokens)
/** Parses `x = <expr>;` and returns a fully parenthesised rendering of the tree. */
const shape = (expr: string): string => {
  const r = parseSrc(`x = ${expr};`)
  expect(r.diagnostics).toEqual([])
  return paren((r.program.body[0] as Assignment).expr)
}
const paren = (e: Expr): string =>
  e.kind === 'Ident' ? e.name
    : e.kind === 'Const' ? String(e.value)
      : e.kind === 'Unary' ? `(NOT ${paren(e.operand)})`
        : `(${paren(e.left)} ${e.op} ${paren(e.right)})`
const codes = (src: string) => parseSrc(src).diagnostics.map((d) => d.code)

describe('parser: structure', () => {
  it('parses declarations and assignments', () => {
    const r = parseSrc('input a, b, c;\noutput out;\nwire w;\nout = (a AND b) OR NOT c;')
    expect(r.diagnostics).toEqual([])
    expect(r.program.body.map((s) => s.kind)).toEqual(['Declaration', 'Declaration', 'Declaration', 'Assignment'])
    const d = r.program.body[0]
    expect(d.kind === 'Declaration' && d.names.map((n) => n.name)).toEqual(['a', 'b', 'c'])
  })

  it('includes parentheses in the expression span', () => {
    const r = parseSrc('x = (a AND b);')
    const e = (r.program.body[0] as Assignment).expr
    expect(e.span.col).toBe(5)
    expect(e.span.endCol).toBe(14)
  })

  it('ignores empty statements', () => {
    expect(parseSrc(';;input a;;').program.body).toHaveLength(1)
  })
})

describe('parser: precedence and associativity', () => {
  it('NOT binds tighter than AND', () => expect(shape('NOT a AND b')).toBe('((NOT a) AND b)'))
  it('AND binds tighter than XOR', () => expect(shape('a XOR b AND c')).toBe('(a XOR (b AND c))'))
  it('XOR binds tighter than OR', () => expect(shape('a OR b XOR c')).toBe('(a OR (b XOR c))'))
  it('NAND shares AND precedence, NOR shares OR, XNOR shares XOR', () => {
    expect(shape('a NOR b NAND c')).toBe('(a NOR (b NAND c))')
    expect(shape('a XNOR b OR c')).toBe('((a XNOR b) OR c)')
  })
  it('binary operators are left-associative', () => {
    expect(shape('a OR b OR c')).toBe('((a OR b) OR c)')
    expect(shape('a NAND b NAND c')).toBe('((a NAND b) NAND c)')
    expect(shape('a ^ b XNOR c')).toBe('((a XOR b) XNOR c)')
  })
  it('NOT is right-recursive and parentheses override precedence', () => {
    expect(shape('!~NOT a')).toBe('(NOT (NOT (NOT a)))')
    expect(shape('(a | b) & c')).toBe('((a OR b) AND c)')
  })
  it('pretty-printer inserts only the parentheses that are needed', () => {
    const r = parseSrc('x = (a AND b) OR NOT c; y = a AND (b OR c); z = a OR (b OR c);')
    const exprs = r.program.body.map((s) => exprToString((s as Assignment).expr))
    expect(exprs).toEqual(['a AND b OR NOT c', 'a AND (b OR c)', 'a OR (b OR c)'])
  })
})

describe('parser: errors and recovery', () => {
  it('reports a missing semicolon with "expected X, found Y" and keeps parsing', () => {
    const r = parseSrc('input a, b\noutput o;\no = a AND b;')
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]).toMatchObject({ code: 'E202', span: { line: 1 } })
    expect(r.diagnostics[0].message).toMatch(/expected `;`, found keyword `output`/)
    expect(r.program.body).toHaveLength(3)
  })

  it('reports missing ) with the position of the opening (', () => {
    const r = parseSrc('o = (a AND b;')
    expect(r.diagnostics[0].code).toBe('E203')
    expect(r.diagnostics[0].message).toMatch(/close the `\(` at 1:5, found `;`/)
  })

  it('reports an unmatched )', () => expect(codes('o = a AND b);')).toEqual(['E206']))

  it('reports missing operands in several positions', () => {
    expect(codes('o = a AND ;')).toEqual(['E204'])
    expect(codes('o = ;')).toEqual(['E204'])
    expect(codes('o = OR b;')).toEqual(['E204'])
    expect(codes('o = ();')).toEqual(['E204'])
  })

  it('reports unexpected tokens and suggests misspelt keywords', () => {
    const r = parseSrc('o = a ANDD b;')
    expect(r.diagnostics[0]).toMatchObject({ code: 'E201', suggestion: 'Did you mean `AND`?' })
    const r2 = parseSrc('ouput o;')
    expect(r2.diagnostics[0]).toMatchObject({ code: 'E205', suggestion: 'Did you mean `output`?' })
    expect(codes('input a b;')).toEqual(['E201'])
    expect(codes('input ;')).toEqual(['E207'])
    expect(codes('input and;')).toEqual(['E207'])
    expect(codes('= a;')).toEqual(['E205'])
  })

  it('panic-mode recovery reports several independent errors in one run', () => {
    const r = parseSrc('input a;\no = a AND ;\np = (a;\nq = a OR b);\nr = a;')
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E204', 'E203', 'E206'])
    expect(r.program.body.some((s) => s.kind === 'Assignment' && s.target.name === 'r')).toBe(true)
  })

  it('guards against pathological nesting without overflowing the stack', () => {
    expect(codes(`o = ${'('.repeat(5000)}a;`)).toContain('E208')
    expect(codes(`o = ${'NOT '.repeat(5000)}a;`)).toContain('E208')
    expect(codes(`o = a${' AND a'.repeat(2000)};`)).toContain('E208')
  })
})
