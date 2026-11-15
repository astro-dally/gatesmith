/**
 * parser.ts — Phase 2: syntax analysis.
 *
 * A hand-written recursive-descent parser. Each grammar rule below is one
 * method, so the code can be read side by side with the EBNF:
 *
 *   program     = { statement } EOF ;
 *   statement   = declaration | assignment | ";" ;
 *   declaration = ( "input" | "output" | "wire" ) IDENT { "," IDENT } ";" ;
 *   assignment  = IDENT "=" expr ";" ;
 *   expr        = orExpr ;
 *   orExpr      = xorExpr  { ( "OR"  | "NOR"  ) xorExpr } ;   (* lowest  *)
 *   xorExpr     = andExpr  { ( "XOR" | "XNOR" ) andExpr } ;
 *   andExpr     = unary    { ( "AND" | "NAND" ) unary   } ;
 *   unary       = "NOT" unary | primary ;                     (* highest *)
 *   primary     = IDENT | CONST | "(" expr ")" ;
 *
 * The `{ ... }` loops build left-leaning trees, which is what makes every
 * binary operator left-associative: a OR b OR c  ==>  (a OR b) OR c.
 * The grammar is LL(1) except for `statement`, which looks two tokens ahead
 * (IDENT then "=") only to produce better error messages.
 *
 * Error recovery is panic mode: an error inside a statement throws an internal
 * ParseError that is caught in `parseProgram`, which then discards tokens up to
 * the next `;` (or the next obvious statement start) and carries on, so one run
 * reports every independent syntax error.
 */
import type { Assignment, BinaryOp, Declaration, DeclKind, Expr, Name, Program, Statement } from './ast'
import { type Diagnostic, type DiagnosticCode, type Span, diag, joinSpans, makeSpan } from './errors'
import { type Token, type TokenType, describeToken, keywordSuggestion } from './lexer'

export interface ParseResult {
  program: Program
  diagnostics: Diagnostic[]
}

/** Internal signal used for panic-mode unwinding. Never escapes `parse`. */
class ParseError extends Error {}

/** Precedence levels, lowest first. Each level is one grammar rule above. */
const LEVELS: ReadonlyArray<ReadonlyArray<BinaryOp>> = [
  ['OR', 'NOR'],
  ['XOR', 'XNOR'],
  ['AND', 'NAND'],
]
const BINARY_TYPES: ReadonlySet<TokenType> = new Set(LEVELS.flat())

/** Guards against stack exhaustion on pathological input like 10 000 `(`. */
export const MAX_NESTING = 200
export const MAX_TREE_DEPTH = 500
const MAX_ERRORS = 50

export function parse(tokens: readonly Token[]): ParseResult {
  return new Parser(tokens).parseProgram()
}

class Parser {
  private pos = 0
  private nesting = 0
  private readonly diagnostics: Diagnostic[] = []
  private readonly depthOf = new WeakMap<Expr, number>()
  private readonly tokens: readonly Token[]

  constructor(tokens: readonly Token[]) {
    // Defensive: always have an EOF sentinel even if given an empty array.
    this.tokens = tokens.length && tokens[tokens.length - 1].type === 'EOF'
      ? tokens
      : [...tokens, { type: 'EOF', lexeme: '', span: makeSpan(0, 0, 1, 1, 1, 1) }]
  }

  // ───────────────────────── token helpers ─────────────────────────

  private peek(k = 0): Token {
    return this.tokens[Math.min(this.pos + k, this.tokens.length - 1)]
  }
  private previous(): Token {
    return this.tokens[Math.max(0, this.pos - 1)]
  }
  private check(type: TokenType): boolean {
    return this.peek().type === type
  }
  private advance(): Token {
    const t = this.peek()
    if (t.type !== 'EOF') this.pos++
    return t
  }
  private atEnd(): boolean {
    return this.peek().type === 'EOF'
  }

  /** Records a diagnostic and unwinds to the statement loop (panic mode). */
  private fail(code: DiagnosticCode, message: string, span: Span, suggestion?: string): never {
    this.report(code, message, span, suggestion)
    throw new ParseError(message)
  }
  private report(code: DiagnosticCode, message: string, span: Span, suggestion?: string): void {
    this.diagnostics.push(diag('parser', code, message, span, suggestion))
  }

  // ───────────────────────── program & recovery ─────────────────────────

  parseProgram(): ParseResult {
    const body: Statement[] = []
    const first = this.peek().span
    while (!this.atEnd()) {
      const startPos = this.pos
      this.nesting = 0
      try {
        const stmt = this.parseStatement()
        if (stmt) body.push(stmt)
      } catch (e) {
        if (!(e instanceof ParseError)) throw e
        this.synchronize(startPos)
      }
      if (this.diagnostics.length >= MAX_ERRORS) break
    }
    const last = this.previous().span
    return {
      program: { kind: 'Program', body, span: body.length ? joinSpans(first, last) : first },
      diagnostics: this.diagnostics,
    }
  }

  /**
   * Panic-mode synchronisation. Discard tokens until we have consumed a `;`
   * or reach a token that can only begin a new statement (a declaration
   * keyword, or `IDENT =` on a later line). Always consumes at least one token
   * so the loop is guaranteed to terminate.
   */
  private synchronize(startPos: number): void {
    const errorLine = this.peek().span.line
    if (this.pos === startPos) this.advance()
    while (!this.atEnd()) {
      if (this.previous().type === 'SEMI' && this.pos > startPos) return
      const t = this.peek()
      if (t.type === 'INPUT' || t.type === 'OUTPUT' || t.type === 'WIRE') return
      if (t.type === 'IDENT' && this.peek(1).type === 'ASSIGN' && t.span.line > errorLine) return
      this.advance()
    }
  }

  /** Does the current token unmistakably begin a statement? */
  private startsStatement(): boolean {
    const t = this.peek()
    return t.type === 'INPUT' || t.type === 'OUTPUT' || t.type === 'WIRE' ||
      (t.type === 'IDENT' && this.peek(1).type === 'ASSIGN')
  }

  /**
   * Expects the `;` that ends a statement. If the next token is on a later line
   * and starts a new statement (or is EOF), the `;` was simply forgotten: report
   * E202 but do not panic, so the following statement still parses normally.
   */
  private expectSemicolon(context: string, afterDecl: boolean): Token {
    if (this.check('SEMI')) return this.advance()
    const prev = this.previous()
    const next = this.peek()
    if (next.type === 'EOF' || (this.startsStatement() && next.span.line > prev.span.endLine)) {
      this.report('E202', `Missing \`;\` after ${context}: expected \`;\`, found ${describeToken(next)}.`,
        prev.span, 'Every statement ends with `;`.')
      return prev
    }
    if (next.type === 'RPAREN') {
      this.fail('E206', 'Unbalanced parentheses: this `)` has no matching `(`.', next.span,
        'Remove the `)` or add a `(` earlier in the expression.')
    }
    if (afterDecl && next.type === 'IDENT') {
      this.fail('E201', `Expected \`,\` or \`;\`, found ${describeToken(next)}.`, next.span,
        'Separate signal names with commas: `input a, b;`.')
    }
    const kw = next.type === 'IDENT' ? keywordSuggestion(next.lexeme) : undefined
    this.fail('E201',
      `Expected an operator or \`;\`, found ${describeToken(next)}.`, next.span,
      kw ? `Did you mean \`${kw}\`?` : afterDecl ? 'End the declaration with `;`.' : 'Join operands with an operator such as AND, OR or XOR, or end the statement with `;`.')
  }

  // ───────────────────────── statements ─────────────────────────

  private parseStatement(): Statement | null {
    const t = this.peek()
    switch (t.type) {
      case 'INPUT':
      case 'OUTPUT':
      case 'WIRE':
        return this.parseDeclaration()
      case 'IDENT':
        return this.parseAssignment()
      case 'SEMI':
        this.advance() // empty statement: harmless, ignored
        return null
      case 'RPAREN':
        return this.fail('E206', 'Unbalanced parentheses: this `)` has no matching `(`.', t.span, 'Remove the `)`.')
      case 'ASSIGN':
        return this.fail('E205', 'Missing assignment target before `=`.', t.span, 'Write the signal to drive first, e.g. `out = a AND b;`.')
      default:
        return this.fail('E205',
          `A statement must start with \`input\`, \`output\`, \`wire\` or a signal name; found ${describeToken(t)}.`,
          t.span)
    }
  }

  /** declaration = ( "input" | "output" | "wire" ) IDENT { "," IDENT } ";" */
  private parseDeclaration(): Declaration {
    const kwTok = this.advance()
    const declKind = kwTok.type.toLowerCase() as DeclKind
    const names: Name[] = [this.expectName(`after \`${kwTok.lexeme}\``)]
    while (this.check('COMMA')) {
      this.advance()
      names.push(this.expectName('after `,`'))
    }
    const semi = this.expectSemicolon(`the ${declKind} declaration`, true)
    return { kind: 'Declaration', declKind, names, span: joinSpans(kwTok.span, semi.span) }
  }

  private expectName(where: string): Name {
    const t = this.peek()
    if (t.type === 'IDENT') {
      this.advance()
      return { name: t.lexeme, span: t.span }
    }
    if (t.type === 'SEMI' || t.type === 'EOF') {
      this.fail('E207', `Expected a signal name ${where}, found ${describeToken(t)}.`, t.span,
        'Declarations list one or more names, e.g. `input a, b;`.')
    }
    const reserved = /^[A-Za-z]/.test(t.lexeme)
    this.fail('E207', `Expected a signal name ${where}, found ${describeToken(t)}.`, t.span,
      reserved ? `\`${t.lexeme}\` is a reserved word; choose another name such as \`${t.lexeme.toLowerCase()}_sig\`.` : undefined)
  }

  /** assignment = IDENT "=" expr ";" */
  private parseAssignment(): Assignment {
    const targetTok = this.advance()
    if (!this.check('ASSIGN')) {
      const next = this.peek()
      const kw = keywordSuggestion(targetTok.lexeme)
      if (next.type === 'IDENT' && kw && ['INPUT', 'OUTPUT', 'WIRE'].includes(kw)) {
        this.fail('E205', `Unknown statement \`${targetTok.lexeme}\`.`, targetTok.span, `Did you mean \`${kw.toLowerCase()}\`?`)
      }
      this.fail('E201', `Expected \`=\` after \`${targetTok.lexeme}\`, found ${describeToken(next)}.`, next.span,
        `Assign a value with \`${targetTok.lexeme} = <expression>;\`.`)
    }
    this.advance() // '='
    const expr = this.parseExpr()
    const semi = this.expectSemicolon('the assignment', false)
    return {
      kind: 'Assignment',
      target: { name: targetTok.lexeme, span: targetTok.span },
      expr,
      span: joinSpans(targetTok.span, semi.span),
    }
  }

  // ───────────────────────── expressions ─────────────────────────

  /** expr = orExpr */
  private parseExpr(): Expr {
    return this.parseLevel(0)
  }

  /**
   * One method handles orExpr, xorExpr and andExpr: `level` indexes LEVELS.
   *   levelN = levelN+1 { op levelN+1 }
   * The while loop is what makes the operators left-associative.
   */
  private parseLevel(level: number): Expr {
    if (level === LEVELS.length) return this.parseUnary()
    let left = this.parseLevel(level + 1)
    while (LEVELS[level].includes(this.peek().type as BinaryOp)) {
      const opTok = this.advance()
      const right = this.parseLevel(level + 1)
      left = this.track({
        kind: 'Binary',
        op: opTok.type as BinaryOp,
        left,
        right,
        span: joinSpans(left.span, right.span),
        opSpan: opTok.span,
      }, Math.max(this.depth(left), this.depth(right)) + 1, opTok.span)
    }
    return left
  }

  /** unary = "NOT" unary | primary */
  private parseUnary(): Expr {
    if (this.check('NOT')) {
      const opTok = this.advance()
      this.enter(opTok.span)
      try {
        const operand = this.parseUnary()
        return this.track({ kind: 'Unary', op: 'NOT', operand, span: joinSpans(opTok.span, operand.span), opSpan: opTok.span },
          this.depth(operand) + 1, opTok.span)
      } finally {
        this.nesting--
      }
    }
    return this.parsePrimary()
  }

  /** primary = IDENT | CONST | "(" expr ")" */
  private parsePrimary(): Expr {
    const t = this.peek()
    if (t.type === 'IDENT') {
      this.advance()
      return { kind: 'Ident', name: t.lexeme, span: t.span }
    }
    if (t.type === 'CONST') {
      this.advance()
      return { kind: 'Const', value: t.value ?? 0, span: t.span }
    }
    if (t.type === 'LPAREN') {
      const open = this.advance()
      if (this.check('RPAREN')) {
        this.fail('E204', 'Missing operand: the parentheses are empty.', joinSpans(open.span, this.peek().span),
          'Put an expression inside, e.g. `(a AND b)`.')
      }
      this.enter(open.span)
      let inner: Expr
      try {
        inner = this.parseExpr()
      } finally {
        this.nesting--
      }
      if (!this.check('RPAREN')) {
        const found = this.peek()
        const kw = found.type === 'IDENT' ? keywordSuggestion(found.lexeme) : undefined
        this.fail('E203',
          `Unbalanced parentheses: expected \`)\` to close the \`(\` at ${open.span.line}:${open.span.col}, found ${describeToken(found)}.`,
          found.span, kw ? `Did you mean \`${kw}\`?` : 'Add the missing `)`.')
      }
      const close = this.advance()
      // Parentheses vanish from the AST, but the span grows to include them.
      return { ...inner, span: joinSpans(open.span, close.span) }
    }
    this.missingOperand(t)
  }

  private missingOperand(t: Token): never {
    const prev = this.previous()
    if (BINARY_TYPES.has(t.type) && (prev.type === 'ASSIGN' || prev.type === 'LPAREN' || BINARY_TYPES.has(prev.type) || prev.type === 'NOT')) {
      this.fail('E204', `Missing operand before ${describeToken(t)}.`, t.span,
        `\`${t.lexeme}\` needs an operand on each side, e.g. \`a ${t.lexeme} b\`.`)
    }
    const after = prev.type === 'ASSIGN'
      ? 'after `=`'
      : prev.type === 'NOT' || BINARY_TYPES.has(prev.type)
        ? `after \`${prev.lexeme}\``
        : 'here'
    const suggestion = prev.type === 'ASSIGN'
      ? 'Write an expression, e.g. `out = a AND b;`.'
      : t.type === 'INPUT' || t.type === 'OUTPUT' || t.type === 'WIRE'
        ? 'The previous statement may be missing its operand and `;`.'
        : 'Expected a signal name, 0, 1, or a parenthesised expression.'
    this.fail('E204', `Missing operand ${after}: expected a signal, constant or \`(\`, found ${describeToken(t)}.`,
      t.span, suggestion)
  }

  // ───────────────────────── depth guards ─────────────────────────

  private enter(span: Span): void {
    if (this.nesting >= MAX_NESTING) {
      this.fail('E208', `Expression is nested more than ${MAX_NESTING} levels deep.`, span,
        'Split it into intermediate wires.')
    }
    this.nesting++
  }
  private depth(e: Expr): number {
    return this.depthOf.get(e) ?? 1
  }
  private track(e: Expr, depth: number, span: Span): Expr {
    if (depth > MAX_TREE_DEPTH) {
      this.fail('E208', `Expression is more than ${MAX_TREE_DEPTH} operators deep.`, span,
        'Split it into intermediate wires.')
    }
    this.depthOf.set(e, depth)
    return e
  }
}
