/**
 * errors.ts — the diagnostic system shared by every compiler phase.
 *
 * A Diagnostic is plain data (never an exception) so that each phase can keep
 * going after a problem and report *all* problems in one run.
 */

export type Severity = 'error' | 'warning'

export type PhaseName = 'lexer' | 'parser' | 'semantic' | 'ir' | 'optimizer' | 'codegen'

/** A half-open source range [start, end) plus 1-based line/column of both ends. */
export interface Span {
  start: number
  end: number
  line: number
  col: number
  endLine: number
  endCol: number
}

export interface Diagnostic {
  code: string
  severity: Severity
  phase: PhaseName
  message: string
  span: Span
  suggestion?: string
}

/**
 * The catalogue of every diagnostic the compiler can emit.
 * E0xx lexical, E2xx syntax, E3xx/W3xx semantic, W4xx-W6xx later phases, E9xx internal.
 */
export const CODES = {
  // Lexical
  E001: 'Invalid character',
  E002: 'Unterminated block comment',
  E003: 'Stray end of block comment',
  E004: 'Invalid constant',
  // Syntax
  E201: 'Unexpected token',
  E202: 'Missing semicolon',
  E203: 'Unbalanced parentheses: missing )',
  E204: 'Missing operand',
  E205: 'Invalid statement start',
  E206: 'Unbalanced parentheses: unmatched )',
  E207: 'Missing signal name in declaration',
  E208: 'Expression too deeply nested',
  // Semantic
  E301: 'Undeclared identifier',
  E302: 'Duplicate declaration',
  E303: 'Output assigned more than once',
  E304: 'Assignment to an input',
  E305: 'Output never assigned',
  E306: 'Signal used before being driven',
  E307: 'Combinational cycle',
  E308: 'Wire assigned more than once',
  W301: 'Unused input',
  W302: 'Unused wire',
  W303: 'No outputs declared',
  // Later phases
  W601: 'Truth table not generated',
  W602: 'Circuit too large to draw',
  E900: 'Internal compiler error',
} as const

export type DiagnosticCode = keyof typeof CODES

/** Builds a span from a start offset/position and an end offset/position. */
export function makeSpan(
  start: number,
  end: number,
  line: number,
  col: number,
  endLine: number,
  endCol: number,
): Span {
  return { start, end, line, col, endLine, endCol }
}

/** Smallest span covering both a and b. */
export function joinSpans(a: Span, b: Span): Span {
  const first = a.start <= b.start ? a : b
  const last = a.end >= b.end ? a : b
  return {
    start: first.start,
    end: last.end,
    line: first.line,
    col: first.col,
    endLine: last.endLine,
    endCol: last.endCol,
  }
}

export const EMPTY_SPAN: Span = { start: 0, end: 0, line: 1, col: 1, endLine: 1, endCol: 1 }

export function diag(
  phase: PhaseName,
  code: DiagnosticCode,
  message: string,
  span: Span,
  suggestion?: string,
): Diagnostic {
  const severity: Severity = code.startsWith('W') ? 'warning' : 'error'
  return suggestion
    ? { code, severity, phase, message, span, suggestion }
    : { code, severity, phase, message, span }
}

/**
 * Levenshtein edit distance (insert / delete / substitute, each cost 1),
 * computed with the classic two-row dynamic programme in O(|a|·|b|).
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/**
 * Returns the closest candidate to `name`, or undefined when nothing is close.
 * "Close" means distance ≤ 2 and smaller than the name itself (so `x` never
 * suggests `y`). Case-only differences always count as close.
 */
export function closestMatch(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined
  let bestDist = Infinity
  for (const c of candidates) {
    if (c === name) continue
    const d = c.toLowerCase() === name.toLowerCase() ? 0.5 : editDistance(name, c)
    if (d < bestDist || (d === bestDist && best !== undefined && c < best)) {
      best = c
      bestDist = d
    }
  }
  const limit = Math.min(2, Math.max(1, Math.floor(name.length / 2)))
  return bestDist <= limit && bestDist < name.length ? best : undefined
}

export function hasErrors(diags: readonly Diagnostic[]): boolean {
  return diags.some((d) => d.severity === 'error')
}

/** Stable ordering for the Problems panel: by position, then errors first. */
export function sortDiagnostics(diags: readonly Diagnostic[]): Diagnostic[] {
  return [...diags].sort(
    (a, b) =>
      a.span.start - b.span.start ||
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      a.code.localeCompare(b.code),
  )
}

export function formatPos(span: Span): string {
  return `${span.line}:${span.col}`
}
