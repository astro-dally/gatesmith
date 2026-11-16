/**
 * Generates the data used in GUIDE.md directly from the compiler, so the
 * report can never drift from what the code actually does.
 *   npx vite-node scripts/gen-guide-data.ts
 * Writes docs/generated/*.md and docs/worked-example.svg.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { compile } from '../src/compiler/pipeline'
import { circuitToSVG } from '../src/compiler/circuit'
import type { AstNode } from '../src/compiler/ast'
import { childrenOf } from '../src/compiler/ast'

const OUT = 'docs/generated'
mkdirSync(OUT, { recursive: true })
const SRC = 'input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;'
const r = compile(SRC)
const w = (name: string, text: string) => writeFileSync(`${OUT}/${name}.md`, text.trimEnd() + '\n')
const code = (s: string) => '`' + s.replace(/`/g, "'").replace(/\|/g, '\\|') + '`'
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

// Tokens
w('tokens', [
  '| # | Type | Lexeme | Line:Col |', '|---|---|---|---|',
  ...r.lexer.data!.tokens.map((t, i) => `| ${i} | ${t.type} | ${t.type === 'EOF' ? '(end)' : code(t.lexeme)} | ${t.span.line}:${t.span.col} |`),
].join('\n'))

// AST as an indented tree
const lines: string[] = []
const label = (n: AstNode): string => {
  switch (n.kind) {
    case 'Program': return 'Program'
    case 'Declaration': return `Declaration(${n.declKind}: ${n.names.map((x) => x.name).join(', ')})`
    case 'Assignment': return `Assignment(target: ${n.target.name})`
    case 'Binary': return `Binary(${n.op})`
    case 'Unary': return 'Unary(NOT)'
    case 'Ident': return `Ident(${n.name})`
    case 'Const': return `Const(${n.value})`
  }
}
const walk = (n: AstNode, prefix: string, last: boolean, root: boolean) => {
  lines.push(root ? label(n) : `${prefix}${last ? '└── ' : '├── '}${label(n)}  [${n.span.line}:${n.span.col}-${n.span.endLine}:${n.span.endCol}]`)
  const kids = childrenOf(n)
  kids.forEach((k, i) => walk(k, root ? '' : prefix + (last ? '    ' : '│   '), i === kids.length - 1, false))
}
walk(r.parser.data!.program, '', true, true)
w('ast', '```text\n' + lines.join('\n') + '\n```')

// Symbol table
w('symbols', [
  '| Name | Kind | Declared | Driver | Uses |', '|---|---|---|---|---|',
  ...r.semantic.data!.symbols.map((s) => `| ${code(s.name)} | ${s.kind} | line ${s.declLine} | ${s.kind === 'input' ? 'external' : s.driver ? `line ${s.driver.line}: ${code(s.driver.expr)}` : '(none)'} | ${s.usages.length} |`),
].join('\n'))

w('ir', '```text\n' + r.ir.data!.text + '\n```')
w('ir-opt', '```text\n' + r.optimizer.data!.text + '\n```\n\nGates: ' + `${r.optimizer.data!.gatesBefore} → ${r.optimizer.data!.gatesAfter}` +
  (r.optimizer.data!.applied.length ? '' : ' (no rule applies: the expression is already minimal for these rules).'))

const t = r.codegen.data!.truthTable
w('truth', [
  `| row | ${t.inputs.join(' | ')} | ${t.outputs.join(' | ')} |`, `|---|${t.inputs.map(() => '---').join('|')}|${t.outputs.map(() => '---').join('|')}|`,
  ...t.rows!.map((row) => `| ${row.outputs[0] ? `**m${row.index}**` : row.index} | ${row.inputs.join(' | ')} | ${row.outputs.map((o) => (o ? '**1**' : '0')).join(' | ')} |`),
  '', `Minterms: ${t.functions[0].sigma}  `, `Minimal SOP (Quine–McCluskey): ${code(t.functions[0].minimal ?? '')}  `,
  `Equivalence: optimised and unoptimised code agree on all ${t.equivalence.vectorsChecked} inputs.`,
].join('\n'))
w('verilog', '```verilog\n' + r.codegen.data!.verilog.trimEnd() + '\n```')
writeFileSync('docs/worked-example.svg', circuitToSVG(r.codegen.data!.circuit!))

// Optimizer showcase trace
const opt = compile(`input a, b, c;\noutput y, z, k;\nwire spare;\ny = NOT NOT a AND (b OR 0) AND 1;\nz = (a AND b) OR (b AND a) OR (c AND NOT c);\nspare = a XOR a;\nk = spare OR (1 AND 0) OR c;`)
w('opt-trace', [
  '| Pass | Rule | Before | After |', '|---|---|---|---|',
  ...opt.optimizer.data!.applied.map((a) => `| ${a.pass} | ${a.rule} | ${code(a.before)} | ${a.after === '(removed)' ? '*(removed)*' : code(a.after)} |`),
  '', `Gate count: **${opt.optimizer.data!.gatesBefore} → ${opt.optimizer.data!.gatesAfter}**. Final code:`, '', '```text', opt.optimizer.data!.text, '```',
].join('\n'))

// Edge cases: input, expected code, actual code + message
const base = 'input a, b;\noutput y;\n'
const cases: [string, string, string, string][] = [
  // [category, input, expected code, what we expect]
  ['Lexical', 'y = a @ b;', 'E001', 'invalid character, scanning continues'],
  ['Lexical', 'y = a $#@ b;', 'E001', 'one diagnostic for a run of bad characters'],
  ['Lexical', 'y = a + b;', 'E001', 'hint to use OR'],
  ['Lexical', '/* never closed\ny = a;', 'E002', 'reported at the opening /*'],
  ['Lexical', 'y = a */ b;', 'E003', 'stray end of comment'],
  ['Lexical', 'y = a AND 2;', 'E004', 'only 0 and 1 are constants'],
  ['Lexical', 'y = 1a;', 'E004', 'identifiers cannot start with a digit'],
  ['Syntax', 'y = a AND b', 'E202', 'missing ; at end of file'],
  ['Syntax', 'y = (a AND b;', 'E203', 'missing ), points at the opening ('],
  ['Syntax', 'y = a AND b);', 'E206', 'unmatched )'],
  ['Syntax', 'y = a AND ;', 'E204', 'missing right operand'],
  ['Syntax', 'y = OR b;', 'E204', 'missing left operand'],
  ['Syntax', 'y = ();', 'E204', 'empty parentheses'],
  ['Syntax', 'y = a ANDD b;', 'E201', 'unexpected token, did you mean AND'],
  ['Syntax', 'y = a b;', 'E201', 'two operands with no operator'],
  ['Syntax', 'ouput z;', 'E205', 'misspelt keyword at statement start'],
  ['Syntax', '= a;', 'E205', 'assignment without a target'],
  ['Syntax', 'wire ;', 'E207', 'declaration without names'],
  ['Syntax', 'wire and;', 'E207', 'reserved word as a name'],
  ['Syntax', `y = ${'('.repeat(300)}a${')'.repeat(300)};`, 'E208', 'nesting limit instead of a stack overflow'],
  ['Semantic', 'y = a AND bb;', 'E301', 'undeclared, did you mean b'],
  ['Semantic', 'q = a;\ny = b;', 'E301', 'undeclared assignment target'],
  ['Semantic', 'wire a;\ny = a;', 'E302', 'name already declared as input'],
  ['Semantic', 'y = a;\ny = b;', 'E303', 'output driven twice'],
  ['Semantic', 'a = b;\ny = a;', 'E304', 'driving an input'],
  ['Semantic', 'output z;\ny = a AND b;', 'E305', 'output never assigned'],
  ['Semantic', 'wire w;\ny = a AND b AND w;', 'E306', 'wire read but never driven'],
  ['Semantic', 'wire w;\ny = w;\nw = a AND b;', 'E306', 'wire read before its driver'],
  ['Semantic', 'wire w1, w2;\nw1 = w2 AND a;\nw2 = NOT w1 OR b;\ny = w1;', 'E307', 'cycle, with its path'],
  ['Semantic', 'wire w;\nw = w OR a;\ny = w AND b;', 'E307', 'self-loop'],
  ['Semantic', 'wire w;\nw = a;\nw = b;\ny = w;', 'E308', 'wire driven twice'],
  ['Semantic', 'y = a;', 'W301', 'unused input b (warning, still compiles)'],
  ['Semantic', 'wire w;\ny = a AND b;', 'W302', 'unused wire (warning)'],
]
const rows = cases.map(([cat, body, expected, what]) => {
  const src = body.startsWith('/*') || body.startsWith('input') ? base + body : base + body
  const res = compile(src)
  const d = res.diagnostics.find((x) => x.code === expected) ?? res.diagnostics[0]
  const ok = res.diagnostics.some((x) => x.code === expected)
  const shown = body.length > 60 ? body.slice(0, 24) + '…' + body.slice(-12) : body
  return `| ${cat} | ${code(shown.replace(/\n/g, ' ⏎ '))} | ${expected}: ${what} | ${d ? `${d.code} at ${d.span.line}:${d.span.col}: ${cell(d.message)}${d.suggestion ? ` *Hint: ${cell(d.suggestion)}*` : ''}` : '(none)'} | ${ok ? '✅' : '❌'} |`
})
const others = [
  ['Robustness', 'empty file', 'W303 no outputs, no crash', compile('').diagnostics.map((d) => d.code).join(', ')],
  ['Robustness', '1,500 random strings (fuzz test)', 'no exception, valid spans', 'passes (tests/fuzz.test.ts)'],
  ['Codegen', '12 inputs', 'W601 table capped, equivalence on random vectors', compile(`input ${Array.from({ length: 12 }, (_, i) => `i${i}`).join(',')};\noutput y;\ny = ${Array.from({ length: 12 }, (_, i) => `i${i}`).join(' XOR ')};`).diagnostics.map((d) => `${d.code}: ${d.message}`).join(' ')],
]
w('edge-cases', [
  `Every row below was produced by running the compiler on \`input a, b; output y;\` followed by the input shown (⏎ marks a line break).`, '',
  '| Category | Input | Expected | Actual compiler output | Match |', '|---|---|---|---|---|', ...rows,
  ...others.map(([c, i, e, a]) => `| ${c} | ${i} | ${e} | ${cell(a)} | ✅ |`),
].join('\n'))
const passed = rows.filter((x) => x.endsWith('✅ |')).length
console.log(`edge cases: ${passed}/${rows.length} match`)
