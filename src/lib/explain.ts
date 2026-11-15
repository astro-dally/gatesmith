import type { CompileResult } from '@/compiler/pipeline'
import type { PhaseName } from '@/compiler/errors'
import type { Expr } from '@/compiler/ast'
import { PHASE_META } from './phases'

export interface Explanation {
  headline: string
  body: string
  concept: string
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

function depth(e: Expr): number {
  switch (e.kind) {
    case 'Ident': case 'Const': return 1
    case 'Unary': return 1 + depth(e.operand)
    case 'Binary': return 1 + Math.max(depth(e.left), depth(e.right))
  }
}

/** What the phase did with *this* program, in plain English, for viva demos. */
export function explainPhase(phase: PhaseName, r: CompileResult): Explanation {
  const p = r[phase]
  const errors = p.diagnostics.filter((d) => d.severity === 'error').length
  const warnings = p.diagnostics.length - errors

  if (p.status === 'skipped') {
    const blocker = PHASE_META.find((m) => r[m.id].status === 'error')
    return {
      headline: 'Skipped',
      body: `This phase did not run because the ${blocker?.title ?? 'previous'} phase reported errors. A compiler stops before a phase that would only produce misleading output from broken input. Fix the problems listed below, and this phase will run again automatically.`,
      concept: 'Errors in an earlier phase block every later phase.',
    }
  }

  switch (phase) {
    case 'lexer': {
      const d = r.lexer.data!
      const tokens = d.tokens.length - 1
      const ops = d.tokens.filter((t) => ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR'].includes(t.type)).length
      const ids = d.tokens.filter((t) => t.type === 'IDENT').length
      return {
        headline: errors ? `Found ${plural(errors, 'lexical error')}` : `Produced ${plural(tokens, 'token')}`,
        body: `The lexer read ${plural(r.source.length, 'character')} left to right and grouped them into ${plural(tokens, 'token')}: ${plural(ids, 'identifier')}, ${plural(ops, 'operator')}, plus keywords and punctuation. ${plural(d.comments.length, 'comment')} and all whitespace were discarded, so no later phase ever sees them.${errors ? ` It hit ${plural(errors, 'character')} it could not classify, reported each one with its line and column, skipped it and kept scanning.` : ''}`,
        concept: 'A lexer is a finite automaton: it recognises a regular language of tokens, one character at a time.',
      }
    }
    case 'parser': {
      const prog = r.parser.data!.program
      const decls = prog.body.filter((s) => s.kind === 'Declaration').length
      const assigns = prog.body.filter((s) => s.kind === 'Assignment')
      const deepest = Math.max(0, ...assigns.map((a) => (a.kind === 'Assignment' ? depth(a.expr) : 0)))
      return {
        headline: errors ? `Found ${plural(errors, 'syntax error')}` : `Built a tree of ${plural(prog.body.length, 'statement')}`,
        body: errors
          ? `The recursive-descent parser found tokens that do not fit the grammar. After each error it used panic-mode recovery: it skipped ahead to the next \`;\` and resumed, so all ${plural(errors, 'independent error')} were reported in one run.`
          : `The recursive-descent parser matched the tokens against the grammar and built an abstract syntax tree with ${plural(decls, 'declaration')} and ${plural(assigns.length, 'assignment')}. The deepest expression is ${plural(deepest, 'level')} deep. Precedence (NOT, then AND, then XOR, then OR) comes from the grammar itself: each precedence level is its own grammar rule.`,
        concept: 'The grammar is LL(1): one token of lookahead always decides which rule to apply.',
      }
    }
    case 'semantic': {
      const s = r.semantic.data!
      const count = (k: string) => s.symbols.filter((x) => x.kind === k).length
      const uses = s.symbols.reduce((n, x) => n + x.usages.length, 0)
      return {
        headline: errors ? `Found ${plural(errors, 'semantic error')}` : `Checked ${plural(s.symbols.length, 'symbol')}`,
        body: `The analyser entered ${plural(count('input'), 'input')}, ${plural(count('output'), 'output')} and ${plural(count('wire'), 'wire')} into the symbol table and resolved ${plural(uses, 'identifier use')} against it. It then checked that every output has exactly one driver, that nothing drives an input, and searched the dependency graph for cycles with a depth-first search.${errors ? ` ${plural(errors, 'rule was', 'rules were')} broken.` : ' Every rule holds.'}${warnings ? ` ${plural(warnings, 'warning')} flag code that is legal but probably unintended.` : ''}`,
        concept: 'Syntax says the program is well formed; semantics says it means something.',
      }
    }
    case 'ir': {
      const d = r.ir.data!
      const temps = new Set(d.program.instrs.map((i) => i.dest).filter((n) => /^t\d+$/.test(n))).size
      return {
        headline: `Emitted ${plural(d.program.instrs.length, 'instruction')}`,
        body: `A post-order walk of each expression tree emitted ${plural(d.program.instrs.length, 'three-address instruction')}, each with one operator and at most two operands, using ${plural(temps, 'temporary', 'temporaries')} for intermediate results. Every name is assigned exactly once, so this code is already in SSA form. The same instructions were turned into a netlist graph with ${plural(d.netlist.gateCount, 'gate')}.`,
        concept: 'Three-address code is flat and uniform, which makes it easy to optimise and to translate.',
      }
    }
    case 'optimizer': {
      const o = r.optimizer.data!
      const rules = new Set(o.applied.map((a) => a.rule))
      const saved = o.gatesBefore - o.gatesAfter
      return {
        headline: saved > 0 ? `Saved ${plural(saved, 'gate')}` : 'Already optimal for these rules',
        body: o.applied.length
          ? `The optimiser made ${plural(o.applied.length, 'rewrite')} using ${plural(rules.size, 'rule')} (${[...rules].slice(0, 4).join(', ')}${rules.size > 4 ? ', …' : ''}) over ${plural(o.passes, 'pass', 'passes')} until nothing more changed. The gate count went from ${o.gatesBefore} to ${o.gatesAfter}.`
          : `No rule applied: there are no constants to fold, no repeated subexpressions and no dead code. The circuit keeps all ${plural(o.gatesBefore, 'gate')}.`,
        concept: 'Each rule is a Boolean-algebra identity, so the output is provably equivalent, and the truth table re-checks it.',
      }
    }
    case 'codegen': {
      const c = r.codegen.data!
      const t = c.truthTable
      const vlines = c.verilog.split('\n').filter((l) => l.trim()).length
      return {
        headline: t.equivalence.equivalent ? 'Generated three targets' : 'Equivalence check failed',
        body: `${t.rows ? `The optimised code was interpreted for all ${t.rows.length} input combinations to build the truth table, and the original code was run alongside it: they agree on every row.` : `With ${t.inputs.length} inputs the table would be too large, so equivalence was checked on ${t.equivalence.vectorsChecked} random input vectors instead.`} The netlist was laid out in layers (inputs left, outputs right) and drawn as ${c.circuit ? `an SVG circuit with ${plural(r.optimizer.data!.netlist.gateCount, 'gate')}` : 'text only, being too large to draw'}, and printed as a ${vlines}-line Verilog module.`,
        concept: 'Code generation maps the IR onto each target: a table, a picture and a hardware description.',
      }
    }
  }
}
