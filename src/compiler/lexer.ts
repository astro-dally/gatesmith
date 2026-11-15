/**
 * lexer.ts — Phase 1: lexical analysis.
 *
 * A hand-written, single-pass scanner. It walks the source one character at a
 * time keeping (offset, line, column), groups characters into tokens, and turns
 * every malformed piece of input into a Diagnostic instead of stopping.
 *
 * Recovery strategy: an invalid character run is reported once and skipped; an
 * unterminated block comment is reported at its opening `/*` and consumes the
 * rest of the file. Scanning always reaches EOF.
 */
import { type Diagnostic, type Span, closestMatch, diag, makeSpan } from './errors'

export type TokenType =
  | 'INPUT'
  | 'OUTPUT'
  | 'WIRE'
  | 'IDENT'
  | 'CONST'
  | 'NOT'
  | 'AND'
  | 'NAND'
  | 'OR'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'ASSIGN'
  | 'SEMI'
  | 'COMMA'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF'

export interface Token {
  type: TokenType
  lexeme: string
  /** For CONST tokens, the boolean value 0 or 1. */
  value?: 0 | 1
  span: Span
}

export interface Comment {
  text: string
  span: Span
  block: boolean
}

export interface LexResult {
  tokens: Token[]
  comments: Comment[]
  diagnostics: Diagnostic[]
}

/** Keywords are matched case-insensitively: `and`, `AND` and `And` are the same token. */
export const KEYWORDS: Record<string, TokenType> = {
  input: 'INPUT',
  output: 'OUTPUT',
  wire: 'WIRE',
  not: 'NOT',
  and: 'AND',
  nand: 'NAND',
  or: 'OR',
  nor: 'NOR',
  xor: 'XOR',
  xnor: 'XNOR',
  true: 'CONST',
  false: 'CONST',
}

/** Single-character symbols and the token each one produces. */
const SYMBOLS: Record<string, TokenType> = {
  '!': 'NOT',
  '~': 'NOT',
  '&': 'AND',
  '|': 'OR',
  '^': 'XOR',
  '=': 'ASSIGN',
  ';': 'SEMI',
  ',': 'COMMA',
  '(': 'LPAREN',
  ')': 'RPAREN',
}

export const OPERATOR_TYPES: ReadonlySet<TokenType> = new Set([
  'NOT', 'AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR',
])

const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
const isDigit = (c: string) => c >= '0' && c <= '9'
const isAlnum = (c: string) => isAlpha(c) || isDigit(c)
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'

/** Can this character begin some valid token, comment or whitespace? */
function canStartSomething(c: string): boolean {
  return isAlnum(c) || isSpace(c) || c in SYMBOLS || c === '/' || c === '*'
}

export function lex(source: string): LexResult {
  const tokens: Token[] = []
  const comments: Comment[] = []
  const diagnostics: Diagnostic[] = []

  let pos = 0
  let line = 1
  let col = 1

  const peek = (k = 0) => source[pos + k] ?? ''

  /** Consume one character, maintaining line/column. `\r\n` counts as one line break. */
  const advance = () => {
    const c = source[pos++]
    if (c === '\n') {
      line++
      col = 1
    } else if (c === '\r') {
      if (source[pos] !== '\n') {
        line++
        col = 1
      }
    } else {
      col++
    }
    return c
  }

  while (pos < source.length) {
    const c = peek()
    const start = pos
    const startLine = line
    const startCol = col
    const spanHere = () => makeSpan(start, pos, startLine, startCol, line, col)

    // 1. Whitespace is insignificant.
    if (isSpace(c)) {
      advance()
      continue
    }

    // 2. Comments: `// to end of line` and `/* block */` (blocks do not nest).
    if (c === '/' && peek(1) === '/') {
      while (pos < source.length && peek() !== '\n') advance()
      comments.push({ text: source.slice(start, pos), span: spanHere(), block: false })
      continue
    }
    if (c === '/' && peek(1) === '*') {
      advance()
      advance()
      let closed = false
      while (pos < source.length) {
        if (peek() === '*' && peek(1) === '/') {
          advance()
          advance()
          closed = true
          break
        }
        advance()
      }
      comments.push({ text: source.slice(start, pos), span: spanHere(), block: true })
      if (!closed) {
        diagnostics.push(
          diag('lexer', 'E002', 'Unterminated block comment: `/*` is never closed by `*/`.',
            makeSpan(start, start + 2, startLine, startCol, startLine, startCol + 2),
            'Add `*/` where the comment should end.'),
        )
      }
      continue
    }
    if (c === '*' && peek(1) === '/') {
      advance()
      advance()
      diagnostics.push(
        diag('lexer', 'E003', 'Found `*/` without a matching `/*`.', spanHere(),
          'Remove the `*/` or add `/*` where the comment should begin.'),
      )
      continue
    }

    // 3. Identifiers and keywords: [A-Za-z_][A-Za-z0-9_]*
    if (isAlpha(c)) {
      while (isAlnum(peek())) advance()
      const lexeme = source.slice(start, pos)
      const kw = KEYWORDS[lexeme.toLowerCase()]
      if (kw === 'CONST') {
        tokens.push({ type: 'CONST', lexeme, value: lexeme.toLowerCase() === 'true' ? 1 : 0, span: spanHere() })
      } else {
        tokens.push({ type: kw ?? 'IDENT', lexeme, span: spanHere() })
      }
      continue
    }

    // 4. Constants. Only the digits 0 and 1 are meaningful in Boolean logic.
    //    A digit run glued to letters (e.g. `1a`) is reported as one bad lexeme.
    if (isDigit(c)) {
      while (isAlnum(peek())) advance()
      const lexeme = source.slice(start, pos)
      if (lexeme === '0' || lexeme === '1') {
        tokens.push({ type: 'CONST', lexeme, value: lexeme === '1' ? 1 : 0, span: spanHere() })
      } else {
        const startsIdent = /^[0-9]+[A-Za-z_]/.test(lexeme)
        diagnostics.push(
          diag('lexer', 'E004',
            startsIdent
              ? `Invalid token \`${lexeme}\`: identifiers cannot start with a digit.`
              : `Invalid constant \`${lexeme}\`: only 0 and 1 (or true/false) are allowed.`,
            spanHere(),
            startsIdent ? `Rename it, for example \`_${lexeme}\`.` : 'Use 0 or 1.'),
        )
      }
      continue
    }

    // 5. Single-character symbols.
    if (c in SYMBOLS) {
      advance()
      tokens.push({ type: SYMBOLS[c], lexeme: c, span: spanHere() })
      continue
    }

    // 6. Anything else is invalid. Group a run of invalid characters into one
    //    diagnostic so `@@@` produces one message, not three.
    advance()
    while (pos < source.length && !canStartSomething(peek())) advance()
    const bad = source.slice(start, pos)
    diagnostics.push(
      diag('lexer', 'E001',
        bad.length === 1
          ? `Invalid character \`${printable(bad)}\`.`
          : `Invalid characters \`${printable(bad)}\`.`,
        spanHere(),
        suggestForInvalid(bad)),
    )
  }

  tokens.push({ type: 'EOF', lexeme: '', span: makeSpan(pos, pos, line, col, line, col) })
  return { tokens, comments, diagnostics }
}

function printable(s: string): string {
  return [...s].map((ch) => {
    const code = ch.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? `\\u${code.toString(16).padStart(4, '0')}` : ch
  }).join('')
}

/** Friendly hints for the invalid characters people type most often. */
function suggestForInvalid(bad: string): string | undefined {
  const hints: Record<string, string> = {
    '+': 'For OR, write `OR` or `|`.',
    '*': 'For AND, write `AND` or `&`.',
    '.': 'For AND, write `AND` or `&`.',
    "'": 'For NOT, write `NOT x`, `!x` or `~x` before the operand.',
    '-': 'For NOT, write `NOT`, `!` or `~`.',
    '/': 'Comments start with `//` or `/*`.',
    ':': 'Assignments use `=`, as in `out = a AND b;`.',
    '{': 'Blocks are not part of this language; write one statement per `;`.',
    '}': 'Blocks are not part of this language; write one statement per `;`.',
    '[': 'Buses are not supported; declare single-bit signals.',
    ']': 'Buses are not supported; declare single-bit signals.',
  }
  return hints[bad[0]] ?? 'Remove it. Valid symbols are ! ~ & | ^ = ; , ( ).'
}

/** If an identifier looks like a misspelt keyword, return the keyword. */
export function keywordSuggestion(name: string): string | undefined {
  const kw = closestMatch(name.toLowerCase(), Object.keys(KEYWORDS).filter((k) => k !== 'true' && k !== 'false'))
  return kw && kw !== name.toLowerCase() ? kw.toUpperCase() : undefined
}

export function describeToken(t: Token): string {
  switch (t.type) {
    case 'EOF': return 'end of file'
    case 'IDENT': return `identifier \`${t.lexeme}\``
    case 'CONST': return `constant \`${t.lexeme}\``
    case 'SEMI': return '`;`'
    case 'COMMA': return '`,`'
    case 'LPAREN': return '`(`'
    case 'RPAREN': return '`)`'
    case 'ASSIGN': return '`=`'
    case 'INPUT': case 'OUTPUT': case 'WIRE': return `keyword \`${t.lexeme}\``
    default: return `operator \`${t.lexeme}\``
  }
}
