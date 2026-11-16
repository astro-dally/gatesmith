/**
 * pipeline.ts — runs the six phases in order and packages every intermediate
 * result for the UI.
 *
 * Rules:
 *  - A phase runs only if every earlier phase finished without errors
 *    (warnings are fine). Otherwise it is marked "skipped".
 *  - Each phase runs inside try/catch: a bug in the compiler becomes an E900
 *    diagnostic, never an uncaught exception, so the UI cannot crash.
 */
import type { Program } from './ast'
import { type CircuitLayout, circuitToSVG, layoutCircuit, MAX_DRAWABLE_NODES } from './circuit'
import { type TruthTable, buildTruthTable, generateVerilog, MAX_TABLE_INPUTS } from './codegen'
import { type Diagnostic, type PhaseName, EMPTY_SPAN, diag, hasErrors, sortDiagnostics } from './errors'
import { type IRProgram, type Netlist, buildNetlist, formatProgram, generateIR } from './ir'
import { type LexResult, lex } from './lexer'
import { type OptimizeResult, optimize } from './optimizer'
import { type ParseResult, parse } from './parser'
import { type SemanticResult, analyze } from './semantic'

export type PhaseStatus = 'success' | 'warning' | 'error' | 'skipped'

export interface PhaseResult<T> {
  name: PhaseName
  status: PhaseStatus
  timeMs: number
  data: T | null
  diagnostics: Diagnostic[]
}

export interface IRResult {
  program: IRProgram
  text: string
  netlist: Netlist
  layout: CircuitLayout | null
}

export interface OptimizerResult extends OptimizeResult {
  text: string
  netlist: Netlist
  layout: CircuitLayout | null
}

export interface CodegenResult {
  truthTable: TruthTable
  circuit: CircuitLayout | null
  svg: string | null
  verilog: string
}

export interface CompileResult {
  source: string
  lexer: PhaseResult<LexResult>
  parser: PhaseResult<ParseResult>
  semantic: PhaseResult<SemanticResult>
  ir: PhaseResult<IRResult>
  optimizer: PhaseResult<OptimizerResult>
  codegen: PhaseResult<CodegenResult>
  diagnostics: Diagnostic[]
  totalMs: number
  ok: boolean
}

export const PHASES: PhaseName[] = ['lexer', 'parser', 'semantic', 'ir', 'optimizer', 'codegen']

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function run<T>(
  name: PhaseName,
  blocked: boolean,
  fn: () => { data: T; diagnostics: Diagnostic[] },
): PhaseResult<T> {
  if (blocked) return { name, status: 'skipped', timeMs: 0, data: null, diagnostics: [] }
  const t0 = now()
  try {
    const { data, diagnostics } = fn()
    const status: PhaseStatus = hasErrors(diagnostics) ? 'error' : diagnostics.length ? 'warning' : 'success'
    return { name, status, timeMs: now() - t0, data, diagnostics }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      name,
      status: 'error',
      timeMs: now() - t0,
      data: null,
      diagnostics: [diag(name, 'E900', `Internal compiler error in the ${name} phase: ${message}`, EMPTY_SPAN,
        'This is a bug in the compiler, not in your program. Please report it with this source.')],
    }
  }
}

export function compile(source: string): CompileResult {
  const t0 = now()
  const src = typeof source === 'string' ? source : ''

  const lexer = run('lexer', false, () => {
    const r = lex(src)
    return { data: r, diagnostics: r.diagnostics }
  })

  const parser = run('parser', !lexer.data || lexer.status === 'error', () => {
    const r = parse(lexer.data!.tokens)
    return { data: r, diagnostics: r.diagnostics }
  })

  const program: Program | undefined = parser.data?.program
  const semantic = run('semantic', !program || parser.status === 'error', () => {
    const r = analyze(program!)
    return { data: r, diagnostics: r.diagnostics }
  })

  const ir = run('ir', !semantic.data || semantic.status === 'error', () => {
    const p = generateIR(semantic.data!)
    const netlist = buildNetlist(p)
    return { data: { program: p, text: formatProgram(p), netlist, layout: layoutCircuit(netlist) }, diagnostics: [] }
  })

  const optimizer = run('optimizer', !ir.data || ir.status === 'error', () => {
    const r = optimize(ir.data!.program)
    const netlist = buildNetlist(r.after)
    return { data: { ...r, text: formatProgram(r.after), netlist, layout: layoutCircuit(netlist) }, diagnostics: [] }
  })

  const codegen = run('codegen', !optimizer.data || optimizer.status === 'error', () => {
    const opt = optimizer.data!
    const diagnostics: Diagnostic[] = []
    const truthTable = buildTruthTable(ir.data!.program, opt.after)
    if (!truthTable.rows) {
      diagnostics.push(diag('codegen', 'W601',
        `Truth table not generated: ${truthTable.inputs.length} inputs would need ${(2 ** truthTable.inputs.length).toLocaleString('en-US')} rows (the limit is ${MAX_TABLE_INPUTS} inputs).`,
        EMPTY_SPAN, `Equivalence was still checked on ${truthTable.equivalence.vectorsChecked.toLocaleString('en-US')} random input vectors.`))
    }
    if (!opt.layout && opt.netlist.nodes.length > MAX_DRAWABLE_NODES) {
      diagnostics.push(diag('codegen', 'W602',
        `Circuit diagram not drawn: ${opt.netlist.nodes.length} nodes exceed the drawing limit of ${MAX_DRAWABLE_NODES}.`, EMPTY_SPAN))
    }
    if (!truthTable.equivalence.equivalent) {
      diagnostics.push(diag('codegen', 'E900',
        'Optimised circuit is not equivalent to the unoptimised one.', EMPTY_SPAN, 'This is an optimiser bug; please report it.'))
    }
    return {
      data: {
        truthTable,
        circuit: opt.layout,
        svg: opt.layout ? circuitToSVG(opt.layout) : null,
        verilog: generateVerilog(opt.after),
      },
      diagnostics,
    }
  })

  const phases = [lexer, parser, semantic, ir, optimizer, codegen]
  const diagnostics = sortDiagnostics(phases.flatMap((p) => p.diagnostics))
  return {
    source: src,
    lexer, parser, semantic, ir, optimizer, codegen,
    diagnostics,
    totalMs: now() - t0,
    ok: !hasErrors(diagnostics),
  }
}
