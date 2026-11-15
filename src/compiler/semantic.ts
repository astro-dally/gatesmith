/**
 * semantic.ts — Phase 3: semantic analysis.
 *
 * Syntax tells us a program is well formed; semantics tells us it means
 * something. The analyser makes four passes over the AST:
 *
 *   1. Declarations  → fill the symbol table (E302 duplicate declaration).
 *   2. Assignments   → resolve every name, record drivers and usages
 *                      (E301 undeclared, E303/E308 driven twice, E304 driving an input).
 *   3. Completeness  → E305 output never assigned, E306 wire read but never driven,
 *                      W301/W302 unused signals, W303 no outputs.
 *   4. Dataflow      → build the dependency graph, find combinational cycles
 *                      with a depth-first search (E307), and report reads that
 *                      happen textually before the signal's driver (E306).
 *
 * Design decision: assignments are treated as an ordered dataflow listing, so
 * a signal must be driven before it is read. A valid program's statements are
 * therefore already in topological order, which the IR generator relies on.
 */
import { type Assignment, type Expr, type Program, exprToString } from './ast'
import { type Diagnostic, type DiagnosticCode, type Span, closestMatch, diag } from './errors'
import { SymbolTable, type SymbolEntry } from './symbols'

export interface Read {
  name: string
  span: Span
  stmtIndex: number
  reader: string
}

export interface SemanticResult {
  table: SymbolTable
  symbols: SymbolEntry[]
  /** Assignments of a valid program, in textual (= topological) order. */
  assignments: Assignment[]
  /** For every driven signal, the signals its expression reads. */
  dependencies: Record<string, string[]>
  /** Each detected cycle as a list of names, first name repeated at the end. */
  cycles: string[][]
  diagnostics: Diagnostic[]
}

export function analyze(program: Program): SemanticResult {
  const table = new SymbolTable()
  const diagnostics: Diagnostic[] = []
  const report = (code: DiagnosticCode, message: string, span: Span, suggestion?: string) =>
    diagnostics.push(diag('semantic', code, message, span, suggestion))

  // ── Pass 1: declarations ────────────────────────────────────────────
  for (const stmt of program.body) {
    if (stmt.kind !== 'Declaration') continue
    for (const n of stmt.names) {
      const { entry, duplicate } = table.declare(n.name, stmt.declKind, n.span)
      if (duplicate) {
        report('E302',
          `Duplicate declaration of \`${n.name}\`: already declared as ${article(entry.kind)} on line ${entry.declLine}.`,
          n.span,
          entry.kind === stmt.declKind
            ? 'Remove this second declaration.'
            : `A signal has exactly one kind. Keep either the ${entry.kind} or the ${stmt.declKind} declaration.`)
      }
    }
  }

  // ── Pass 2: assignments ─────────────────────────────────────────────
  const assignments: Assignment[] = []
  const reads: Read[] = []
  // Names offered as "did you mean" fixes: they are probably meant to be used,
  // so we do not also warn that they are unused.
  const suggested = new Set<string>()
  const dependencies: Record<string, string[]> = {}
  let stmtIndex = -1

  for (const stmt of program.body) {
    if (stmt.kind !== 'Assignment') continue
    stmtIndex++
    const { target, expr } = stmt
    const entry = table.lookup(target.name)
    let validTarget = false

    if (!entry) {
      const guess = closestMatch(target.name, table.names())
      report('E301', `Assignment to undeclared signal \`${target.name}\`.`, target.span,
        guess ? `Did you mean \`${guess}\`?` : `Declare it first, e.g. \`output ${target.name};\` or \`wire ${target.name};\`.`)
    } else if (entry.kind === 'input') {
      report('E304', `Cannot assign to input \`${target.name}\`: inputs are driven from outside the circuit.`, target.span,
        'Declare a wire or an output to hold the result instead.')
    } else {
      entry.driverCount++
      if (entry.driver) {
        const code = entry.kind === 'output' ? 'E303' : 'E308'
        report(code,
          `${capital(entry.kind)} \`${target.name}\` is assigned more than once (first assigned on line ${entry.driver.line}).`,
          target.span,
          'A signal can have only one driver. Merge the expressions into one assignment (for example with OR), or assign a different signal.')
      } else {
        entry.driver = { span: stmt.span, line: stmt.span.line, expr: exprToString(expr), stmtIndex }
        validTarget = true
      }
    }

    const deps = new Set<string>()
    forEachIdent(expr, (id) => {
      const sym = table.lookup(id.name)
      if (!sym) {
        const guess = closestMatch(id.name, table.names())
        if (guess) suggested.add(guess)
        report('E301', `Undeclared identifier \`${id.name}\`.`, id.span,
          guess ? `Did you mean \`${guess}\`?` : `Declare it, e.g. \`input ${id.name};\`.`)
        return
      }
      sym.usages.push(id.span)
      deps.add(id.name)
      reads.push({ name: id.name, span: id.span, stmtIndex, reader: target.name })
    })

    if (validTarget) {
      dependencies[target.name] = [...deps]
      assignments.push(stmt)
    }
  }

  // ── Pass 3: completeness and usage ──────────────────────────────────
  const outputs = table.ofKind('output')
  if (outputs.length === 0) {
    report('W303', 'No outputs declared, so there is nothing to generate.', program.span,
      'Declare at least one output, e.g. `output y;`.')
  }
  for (const sym of table.entries()) {
    if (sym.kind === 'output' && !sym.driver) {
      report('E305', `Output \`${sym.name}\` is never assigned.`, sym.declSpan,
        `Add an assignment such as \`${sym.name} = ...;\`.`)
    }
    if (sym.kind === 'input' && sym.usages.length === 0 && !suggested.has(sym.name)) {
      report('W301', `Input \`${sym.name}\` is declared but never used.`, sym.declSpan,
        'Remove it, or use it in an expression.')
    }
    if (sym.kind === 'wire' && sym.usages.length === 0 && !suggested.has(sym.name)) {
      report('W302',
        sym.driver ? `Wire \`${sym.name}\` is driven but never used.` : `Wire \`${sym.name}\` is declared but never used.`,
        sym.declSpan, 'Remove it, or use it in an expression.')
    }
    if (sym.kind === 'wire' && !sym.driver && sym.usages.length > 0) {
      report('E306', `Wire \`${sym.name}\` is used but never driven.`, sym.usages[0],
        `Add an assignment such as \`${sym.name} = ...;\` before it is used.`)
    }
  }

  // ── Pass 4: cycles and read-before-drive ────────────────────────────
  const cycles = findCycles(dependencies, table)
  const inCycle = new Set(cycles.flat())
  for (const cycle of cycles) {
    const first = table.lookup(cycle[0])
    report('E307', `Combinational cycle: ${cycle.join(' → ')}.`, first?.driver?.span ?? program.span,
      'Combinational logic cannot feed back into itself. Break the loop by computing one of these signals from inputs only.')
  }
  const reportedEarly = new Set<string>()
  for (const r of reads) {
    const sym = table.lookup(r.name)
    if (!sym || sym.kind === 'input' || !sym.driver || inCycle.has(r.name) || reportedEarly.has(r.name)) continue
    if (sym.driver.stmtIndex > r.stmtIndex) {
      reportedEarly.add(r.name)
      report('E306',
        `\`${r.name}\` is used on line ${r.span.line} before it is driven on line ${sym.driver.line}.`,
        r.span, `Move the assignment \`${r.name} = ...;\` above line ${r.span.line}.`)
    }
  }

  return { table, symbols: table.entries(), assignments, dependencies, cycles, diagnostics }
}

/** Calls `fn` for every identifier in an expression, left to right. Iterative to stay stack-safe. */
export function forEachIdent(expr: Expr, fn: (id: Extract<Expr, { kind: 'Ident' }>) => void): void {
  const stack: Expr[] = [expr]
  while (stack.length) {
    const e = stack.pop()!
    if (e.kind === 'Ident') fn(e)
    else if (e.kind === 'Unary') stack.push(e.operand)
    else if (e.kind === 'Binary') stack.push(e.right, e.left)
  }
}

/**
 * Finds every elementary cycle reachable in the dependency graph using a
 * three-colour depth-first search (white = unvisited, grey = on the current
 * path, black = finished). An edge into a grey node closes a cycle; the cycle
 * is read off the current path. Each cycle is reported once, rotated so its
 * alphabetically smallest member comes first.
 */
export function findCycles(deps: Record<string, string[]>, table: SymbolTable): string[][] {
  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map<string, number>()
  const path: string[] = []
  const seen = new Set<string>()
  const cycles: string[][] = []

  const visit = (node: string) => {
    color.set(node, GREY)
    path.push(node)
    for (const next of deps[node] ?? []) {
      const sym = table.lookup(next)
      if (!sym || sym.kind === 'input') continue
      const c = color.get(next) ?? WHITE
      if (c === GREY) {
        const cyc = path.slice(path.indexOf(next))
        const min = cyc.reduce((m, x, i) => (x < cyc[m] ? i : m), 0)
        const rotated = [...cyc.slice(min), ...cyc.slice(0, min)]
        const key = rotated.join('\u0000')
        if (!seen.has(key)) {
          seen.add(key)
          cycles.push([...rotated, rotated[0]])
        }
      } else if (c === WHITE) {
        visit(next)
      }
    }
    path.pop()
    color.set(node, BLACK)
  }

  for (const node of Object.keys(deps)) if ((color.get(node) ?? WHITE) === WHITE) visit(node)
  return cycles
}

function article(kind: string): string {
  return kind === 'input' || kind === 'output' ? `an ${kind}` : `a ${kind}`
}
function capital(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}
