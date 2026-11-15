/**
 * symbols.ts — the symbol table.
 *
 * The language has a single, flat scope (one module), so the table is a hash
 * map from name to entry: O(1) insert and lookup. Insertion order is kept so
 * the UI and the truth table list signals in declaration order.
 */
import type { DeclKind } from './ast'
import type { Span } from './errors'

export interface Driver {
  /** Span of the whole assignment statement that drives the signal. */
  span: Span
  line: number
  /** The driving expression, pretty-printed. */
  expr: string
  /** Index of the assignment among all statements (textual order). */
  stmtIndex: number
}

export interface SymbolEntry {
  name: string
  kind: DeclKind
  declSpan: Span
  declLine: number
  /** First (and, in a valid program, only) driver. Inputs are driven externally. */
  driver: Driver | null
  /** How many assignments target this name (more than 1 is an error). */
  driverCount: number
  /** Every place the signal is read inside an expression. */
  usages: Span[]
  /** Declaration order, 0-based. */
  index: number
}

export class SymbolTable {
  private readonly map = new Map<string, SymbolEntry>()

  /** Inserts a new symbol, or returns the existing entry if the name is taken. */
  declare(name: string, kind: DeclKind, span: Span): { entry: SymbolEntry; duplicate: boolean } {
    const existing = this.map.get(name)
    if (existing) return { entry: existing, duplicate: true }
    const entry: SymbolEntry = {
      name,
      kind,
      declSpan: span,
      declLine: span.line,
      driver: null,
      driverCount: 0,
      usages: [],
      index: this.map.size,
    }
    this.map.set(name, entry)
    return { entry, duplicate: false }
  }

  lookup(name: string): SymbolEntry | undefined {
    return this.map.get(name)
  }

  has(name: string): boolean {
    return this.map.has(name)
  }

  names(): string[] {
    return [...this.map.keys()]
  }

  /** All entries in declaration order. */
  entries(): SymbolEntry[] {
    return [...this.map.values()]
  }

  ofKind(kind: DeclKind): SymbolEntry[] {
    return this.entries().filter((e) => e.kind === kind)
  }

  get size(): number {
    return this.map.size
  }
}
