import { describe, expect, it } from 'vitest'
import { lex } from '@/compiler/lexer'

const types = (src: string) => lex(src).tokens.map((t) => t.type)

describe('lexer', () => {
  it('tokenizes the specification example', () => {
    const r = lex('input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;')
    expect(r.diagnostics).toEqual([])
    expect(r.tokens.map((t) => t.type)).toEqual([
      'INPUT', 'IDENT', 'COMMA', 'IDENT', 'COMMA', 'IDENT', 'SEMI',
      'OUTPUT', 'IDENT', 'SEMI',
      'IDENT', 'ASSIGN', 'LPAREN', 'IDENT', 'AND', 'IDENT', 'RPAREN', 'OR', 'NOT', 'IDENT', 'SEMI', 'EOF',
    ])
  })

  it('treats keywords case-insensitively but keeps the original lexeme', () => {
    const r = lex('InPuT x; Out = x aNd 1 Or NOT x;')
    expect(r.tokens[0]).toMatchObject({ type: 'INPUT', lexeme: 'InPuT' })
    expect(types('and AND And nand NOR xnor')).toEqual(['AND', 'AND', 'AND', 'NAND', 'NOR', 'XNOR', 'EOF'])
  })

  it('maps symbol aliases to operator tokens', () => {
    expect(types('! ~ & | ^')).toEqual(['NOT', 'NOT', 'AND', 'OR', 'XOR', 'EOF'])
  })

  it('recognises constants 0, 1, true, false with values', () => {
    const toks = lex('0 1 true FALSE').tokens
    expect(toks.slice(0, 4).map((t) => [t.type, t.value])).toEqual([
      ['CONST', 0], ['CONST', 1], ['CONST', 1], ['CONST', 0],
    ])
  })

  it('tracks line and column, counting CRLF as one line break', () => {
    const r = lex('input a;\r\n  output  zz;')
    const zz = r.tokens.find((t) => t.lexeme === 'zz')!
    expect(zz.span).toMatchObject({ line: 2, col: 11, endCol: 13 })
  })

  it('skips line and block comments but records them', () => {
    const r = lex('// hello\ninput /* inline */ a; /* multi\nline */')
    expect(r.diagnostics).toEqual([])
    expect(types('// x\na')).toEqual(['IDENT', 'EOF'])
    expect(r.comments).toHaveLength(3)
    expect(r.comments[2].block).toBe(true)
  })

  it('reports an invalid character, then recovers', () => {
    const r = lex('out = a @ b;')
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]).toMatchObject({ code: 'E001', span: { line: 1, col: 9 } })
    expect(r.tokens.map((t) => t.lexeme)).toEqual(['out', '=', 'a', 'b', ';', ''])
  })

  it('groups a run of invalid characters into one diagnostic', () => {
    const r = lex('a $#@ b + c')
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E001', 'E001'])
    expect(r.diagnostics[0].message).toContain('$#@')
    expect(r.diagnostics[1].suggestion).toMatch(/OR/)
  })

  it('reports an unterminated block comment at its opening', () => {
    const r = lex('input a;\n/* never closed\noutput b;')
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]).toMatchObject({ code: 'E002', span: { line: 2, col: 1 } })
    expect(types('input a;\n/* never closed\noutput b;')).toEqual(['INPUT', 'IDENT', 'SEMI', 'EOF'])
  })

  it('reports a stray */ and invalid numeric constants', () => {
    expect(lex('a */ b').diagnostics[0].code).toBe('E003')
    const r = lex('x = 2 AND 10; y = 1a;')
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E004', 'E004', 'E004'])
    expect(r.diagnostics[2].message).toMatch(/cannot start with a digit/)
  })

  it('always ends with exactly one EOF token, even for empty input', () => {
    expect(types('')).toEqual(['EOF'])
    expect(types('   \n\t ')).toEqual(['EOF'])
  })
})
