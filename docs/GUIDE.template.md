# Gatesmith: Project Report

**A compiler for a Logic Gate Description Language.** Compiler Design project, AI Product Engineering track.

---

## Contents

1. Problem statement and use case
2. Architecture and data flow
3. The six phases, each with its theory, design decision, algorithm and worked example
4. Formal grammar, FIRST/FOLLOW sets, precedence, semantic rule catalogue
5. Optimiser rules, with proofs
6. Edge cases handled
7. UI/UX design rationale and user manual
8. Testing strategy and results
9. Design decisions log
10. Limitations and future work
11. Viva preparation (25 questions, and a team-contribution guide)

---

## 1. Problem statement and use case

Digital circuits are usually designed in hardware description languages (HDLs) such as Verilog or VHDL. These are large languages, and their compilers are opaque. Students learning either digital logic or compiler construction rarely get to see the whole path from text to a working circuit.

**Gatesmith** is a compiler for a deliberately small HDL for *combinational* logic:

```text
input a, b, c;
output out;
out = (a AND b) OR NOT c;
```

It compiles to three targets: a **truth table**, a **circuit diagram** (SVG), and a **Verilog module**. It also exposes the full intermediate state of every phase in an interactive web app.

**Use cases**
- *Learning compilers.* Every textbook phase (lexing, parsing, semantic analysis, IR, optimisation, code generation) is visible and linked back to the source text.
- *Learning digital logic.* You can write a circuit, toggle its inputs, watch the signals propagate, and read its truth table and minimal sum-of-products.
- *Producing hardware.* The Verilog output is synthesisable and can go into an FPGA toolchain.

**Why this is relevant and non-trivial.** The language is small, but the compiler has to solve real problems:

- operator precedence and associativity in a hand-written parser;
- error recovery, so that several errors are reported in one run;
- graph problems in the semantic phase: multiple drivers and combinational cycle detection;
- a semantics-preserving optimiser whose correctness must be *proven* (we check equivalence on every input);
- an automatic graph layout for the circuit diagram. This is a hard problem in general: minimising crossings is NP-hard, so we use the standard Sugiyama heuristics;
- a strict requirement that the compiler never crashes, whatever the user types.

---

## 2. Architecture and data flow

```mermaid
{{mermaid}}
```


Each phase is a pure function from the previous phase's output to its own output plus a list of `Diagnostic`s:

| Phase | Input | Output (shown in the UI) | File |
|---|---|---|---|
| 1 Lexer | source string | `Token[]`, comments, diagnostics | `lexer.ts` |
| 2 Parser | `Token[]` | `Program` AST | `parser.ts`, `ast.ts` |
| 3 Semantic | AST | `SymbolTable`, dependency graph, ordered assignments | `semantic.ts`, `symbols.ts` |
| 4 IR | checked AST and symbols | three-address code (`IRProgram`), netlist DAG, layout | `ir.ts`, `circuit.ts` |
| 5 Optimizer | `IRProgram` | optimised `IRProgram`, list of applied rules | `optimizer.ts` |
| 6 Codegen | original and optimised IR | `TruthTable`, circuit layout and SVG, Verilog | `codegen.ts`, `circuit.ts` |

`pipeline.ts` runs the phases in order and records each phase's status (`success`, `warning`, `error` or `skipped`) and its time in milliseconds. The rule is simple: **a phase runs only if no earlier phase reported an error.** Warnings do not block. Each phase runs inside `try/catch`, so a bug in the compiler becomes an `E900` diagnostic instead of an exception that could crash the UI.

A `Diagnostic` is plain data: `{ code, severity, phase, message, span, suggestion? }`. A `Span` stores the start/end offsets *and* line/column of both ends. Offsets let the editor underline the exact characters; line and column are for humans.

---

## 3. The phases

### 3.1 Lexical analysis (`lexer.ts`)

**Theory.** A lexer turns a stream of characters into a stream of *tokens*: categories such as identifier, keyword or operator, each with its lexeme and position. Tokens form a regular language, so a lexer is a finite automaton. Separating lexing from parsing keeps the grammar small: the parser never deals with whitespace or comments.

**Design decision.** A hand-written, single-pass scanner instead of a regex table. It is easy to explain line by line, it tracks positions exactly, and it gives custom error messages. Keywords are recognised *after* scanning an identifier, by a case-insensitive table lookup: scan `[A-Za-z_][A-Za-z0-9_]*`, then check whether the lowercased lexeme is a keyword. This is the standard trick that avoids a separate automaton per keyword.

**Algorithm** (one loop, look at the current character):
1. Whitespace: skip it, updating line and column. `\r\n` counts as one line break.
2. `//`: skip to end of line. `/*`: skip to `*/`; reaching end of file first is **E002**, reported at the opening `/*`.
3. A letter or `_`: identifier or keyword (`true`/`false` become `CONST`).
4. A digit: constant. Only `0` and `1` are valid; `2` or `10` is **E004**, and `1a` gets "identifiers cannot start with a digit".
5. One of `! ~ & | ^ = ; , ( )`: a single-character token. Symbols are aliases, so `&` produces the same `AND` token as the word `AND`.
6. Anything else: **E001**. A *run* of invalid characters is grouped into one diagnostic. The scanner skips it and continues (recovery), and a hint table suggests fixes (`+` → "for OR, write `OR` or `|`").

The scanner is O(n) in the length of the source and always reaches EOF. It returns comments separately so the editor can colour them; the parser never sees them. The editor's syntax colouring calls *this same lexer*, so colouring and compilation can never disagree.

**Worked example** for `out = (a AND b) OR NOT c` (the program has 21 tokens plus EOF):

{{tokens}}

### 3.2 Syntax analysis (`parser.ts`, `ast.ts`)

**Theory.** A parser checks the token sequence against a context-free grammar and builds a tree. A *parse tree* (concrete syntax tree) has a node for every grammar symbol, including `(`, `)` and `;`. An *abstract syntax tree* keeps only the meaning. Our AST has no parenthesis nodes, because grouping is already the shape of the tree.

**Design decision.** We use **recursive descent**: one method per grammar rule, which maps one-to-one onto the EBNF in §4 and is easy to defend in a viva. Precedence is encoded with *one rule per precedence level* (`orExpr → xorExpr → andExpr → unary → primary`). One generic method, `parseLevel(i)`, implements the three binary levels from a table, which is the "precedence climbing" form of recursive descent. Left associativity comes from the **loop** in `level = next { op next }`: each iteration makes the tree built so far the *left* child, so `a OR b OR c` parses as `(a OR b) OR c`. Writing the rule right-recursively would have produced right associativity, and left-recursive rules cannot be used in recursive descent at all.

**Error recovery (panic mode).** When a statement is malformed, the parser records a diagnostic and throws an internal `ParseError`. `parseProgram` catches it and *synchronises*: it discards tokens up to and including the next `;`, or up to a token that can only start a statement (`input`/`output`/`wire`, or `IDENT =` on a later line). Then it carries on. It always consumes at least one token, so it cannot loop forever. Two refinements give better messages:

- **Missing `;`** (E202) is detected without panicking. If the next token is on a later line and starts a statement, the `;` was simply forgotten. The error is reported, but the next statement still parses normally.
- **Misspelt keywords.** If an identifier at statement start is followed by another identifier (`ouput z;`), or an identifier appears where an operator is expected (`a ANDD b`), the parser suggests the nearest keyword by edit distance.

**Robustness.** Nesting depth (parentheses and `NOT`) is limited to 200 and tree depth to 500. Beyond that the parser reports E208 rather than overflowing the JavaScript call stack. The fuzz test feeds 20,000 nested `(`.

**Worked example.** The AST, with `[line:col-line:col]` spans:

{{ast}}

### 3.3 Semantic analysis (`semantic.ts`, `symbols.ts`)

**Theory.** Syntax says a program is *well formed*; semantics says it *means something*. Semantic analysis checks the rules that a context-free grammar cannot express: that names are declared, that signals have one driver, and that there are no cycles. Its central data structure is the **symbol table**, which maps each name to its attributes.

**Design decision.** The language has a single flat **scope** (the module), so the symbol table is a hash map (`Map<string, SymbolEntry>`) with O(1) insert and lookup, kept in insertion order for display. Each entry stores its name, kind, declaration line, *driver* (the assignment that gives it a value), driver count and every usage span.

We treat the assignments as an **ordered dataflow listing**: a wire or output must be driven before it is read. Verilog's `assign` statements are order-independent, but this rule catches likely mistakes, and it means a valid program's statements are already in topological order, which the IR generator relies on. A read that would close a cycle is reported as a cycle (E307) rather than as a read-before-drive (E306), so the same mistake is not reported twice.

**Algorithm**, in four passes:
1. **Declarations.** Insert every name. A second declaration of the same name is **E302**, even if its kind differs.
2. **Assignments.** Resolve the target:
   - undeclared → **E301**, with a suggestion;
   - an input → **E304**;
   - already driven → **E303** for an output, **E308** for a wire.

   Resolve every identifier in the expression (undeclared → **E301**), recording its usages and the dependency edge `target → identifier`. Expression walks are iterative (an explicit stack), so they are stack-safe.
3. **Completeness.**
   - output with no driver → **E305**;
   - wire read but never driven → **E306**;
   - unused input → **W301**, unused wire → **W302** (both warnings);
   - no outputs at all → **W303**.
4. **Dataflow.** Run a **three-colour depth-first search** on the dependency graph. White means unvisited, grey means on the current path, black means finished. An edge into a grey node is a back edge, which closes a cycle; the cycle is read off the current path (`w1 → w2 → w1`) and reported once (**E307**). Finally, any read that comes textually before its signal's driver is **E306**.

**Suggestions** use Levenshtein edit distance (a dynamic programme in O(|a|·|b|)). A candidate is suggested if it is within distance 2, and less than half the name's length for short names. When a suggestion points at a declared signal, that signal's "unused" warning is suppressed, because the user evidently meant to use it.

**Worked example.** The symbol table:

{{symbols}}

### 3.4 Intermediate representation (`ir.ts`)

**Theory.** An IR sits between the front end and the targets. **Three-address code (TAC)** is a flat list of instructions with at most one operator and two operands, such as `t1 = AND a b`. Flat code is easy to analyse, optimise and translate. In **static single assignment (SSA)** form, every name is assigned exactly once. Optimisations become simpler because a name always denotes one value. In programs with branches, SSA needs φ-functions where control flow merges; combinational logic has no control flow, so our TAC is SSA *for free*.

**Design decision.** We produce two IRs. TAC is for optimisation and evaluation. A **netlist** (a DAG of input, constant, gate and output nodes) is for drawing. In the netlist, `COPY` instructions become plain connections, not gates. The generator writes an assignment's top-level operator straight into its target (`out = OR t1 t2`), avoiding a useless `t3` and copy. Temporary names skip any user signal already called `t1`, `t2` and so on.

**Algorithm.** A post-order walk: generate the left operand, then the right, then emit the operator into a fresh temporary. This is O(size of the AST).

**Worked example.** The TAC:

{{ir}}

The netlist has nodes `in:a`, `in:b`, `in:c`, `g:t1 (AND)`, `g:t2 (NOT)`, `g:out (OR)` and `out:out`, with edges following the operands.

### 3.5 Optimisation (`optimizer.ts`)

**Theory.** Machine-independent optimisation rewrites IR into cheaper IR *with the same meaning*. Classic techniques include constant folding, algebraic simplification, common-subexpression elimination (CSE) and dead-code elimination (DCE). For circuits, "cheaper" means fewer gates.

**Design decision.** We use a **local, rule-based optimiser iterated to a fixpoint**, because one rewrite often enables another. Each pass:
1. *Propagation:* replace operands already known to be copies or constants.
2. *Simplification:* apply algebraic laws to the instruction until none matches (§5).
3. *Value numbering (CSE):* a hash key `OP(arg1,arg2)` (operands sorted for commutative operators) finds an earlier instruction computing the same value.

After the forward walk, a backward **liveness** sweep removes dead instructions, and *copy coalescing* folds `y = t` into the instruction that defines `t`. Passes repeat until the program stops changing, with a safety cap of 25. Every rewrite is logged as `{rule, before, after, pass}`. This log drives the UI's rule list and diff.

**Correctness** is not taken on trust. Code generation interprets the original and the optimised TAC side by side on every input row, and the property test in `tests/fuzz.test.ts` does the same for 400 random expressions against an independent AST interpreter.

**Worked example.** `out = (a AND b) OR NOT c` is already minimal for these rules:

{{ir-opt}}

This longer program from the test suite shows many rules firing (the app's *Simplification demo* example is a shorter version):

{{opt-trace}}

### 3.6 Code generation (`codegen.ts`, `circuit.ts`)

**Truth table.** For n inputs, interpret the optimised TAC on all 2ⁿ vectors, with input 0 as the most significant bit. For speed, the TAC is first compiled into an *evaluator*: names are resolved to array slots once, and each row runs a tight loop over a `Uint8Array`. This made table generation about six times faster. The table is capped at 10 inputs (1,024 rows). Above that, W601 explains why, and equivalence is checked on 4,096 deterministic pseudo-random vectors instead. Rows where an output is 1 are its **minterms** (shown as Σm(…)). From them we print the **canonical SOP** and a **minimal SOP**.

The minimal SOP uses **Quine–McCluskey**:
1. repeatedly merge implicants that differ in exactly one bit, to find all prime implicants;
2. take the essential primes;
3. cover the remaining minterms greedily.

This runs for up to 8 inputs.

**Circuit diagram.** A hand-written layered (Sugiyama-style) layout:
1. **Layering.** Inputs and constants go in layer 0, a gate goes one layer to the right of its deepest input, and outputs go in the last layer.
2. **Dummy nodes.** A net that spans several layers gets an invisible dummy node in each layer it skips, so every edge connects adjacent layers.
3. **Crossing reduction.** Six alternating down/up sweeps sort each layer by the *barycentre* (average position) of its neighbours.
4. **Vertical placement.** Each node wants to sit level with the pins that feed it, subject to keeping the layer order and a minimum gap. This is exactly an *isotonic regression*, solved optimally by the **pool-adjacent-violators** algorithm.
5. **Orthogonal routing.** Each net gets its own vertical track in the channel between two layers, and wires run horizontal → vertical → horizontal. A **junction dot** marks every point where three segments of a net meet (fan-out).

Gate shapes are the standard ANSI symbols: AND's D shape, OR's curved shield, XOR's extra back curve, and a bubble for negation. The same layout object drives the downloadable SVG and the interactive React view.

**Verilog.** Ports are declared as `input wire` / `output wire`. Single-use temporaries are inlined back into expressions, gates used more than once become internal `wire`s, and every output is a continuous `assign`. Names that are Verilog keywords (`reg`, `module`, …) are emitted as escaped identifiers (`\reg `).

**Worked example.**

{{truth}}

![Generated circuit for the worked example](docs/worked-example.svg)

{{verilog}}

---

## 4. Formal grammar

```ebnf
program     = { statement } EOF ;
statement   = declaration | assignment | ";" ;
declaration = ( "input" | "output" | "wire" ) IDENT { "," IDENT } ";" ;
assignment  = IDENT "=" expr ";" ;
expr        = orExpr ;
orExpr      = xorExpr { ( "OR" | "NOR" ) xorExpr } ;
xorExpr     = andExpr { ( "XOR" | "XNOR" ) andExpr } ;
andExpr     = unary   { ( "AND" | "NAND" ) unary } ;
unary       = "NOT" unary | primary ;
primary     = IDENT | CONST | "(" expr ")" ;
```

Lexical rules: `IDENT = [A-Za-z_][A-Za-z0-9_]*` (case-sensitive). `CONST = 0 | 1 | true | false`. Keywords are case-insensitive. The symbol aliases are `!` and `~` for NOT, `&` for AND, `|` for OR and `^` for XOR. The comments are `// …` and `/* … */`, which do not nest.

### Precedence table

| Level | Operators | Associativity | Example |
|---|---|---|---|
| 4 (highest) | `NOT` `!` `~` | right (prefix) | `NOT NOT a` = `NOT (NOT a)` |
| 3 | `AND` `&` `NAND` | left | `a NAND b NAND c` = `(a NAND b) NAND c` |
| 2 | `XOR` `^` `XNOR` | left | `a XOR b AND c` = `a XOR (b AND c)` |
| 1 (lowest) | `OR` `\|` `NOR` | left | `a OR b XOR c` = `a OR (b XOR c)` |

### FIRST and FOLLOW sets

| Non-terminal | FIRST | FOLLOW |
|---|---|---|
| program | input, output, wire, IDENT, `;`, ε | EOF |
| statement | input, output, wire, IDENT, `;` | input, output, wire, IDENT, `;`, EOF |
| declaration | input, output, wire | same as statement |
| assignment | IDENT | same as statement |
| expr, orExpr | NOT, IDENT, CONST, `(` | `;`, `)` |
| xorExpr | NOT, IDENT, CONST, `(` | OR, NOR, `;`, `)` |
| andExpr | NOT, IDENT, CONST, `(` | XOR, XNOR, OR, NOR, `;`, `)` |
| unary, primary | NOT, IDENT, CONST, `(` / IDENT, CONST, `(` | AND, NAND, XOR, XNOR, OR, NOR, `;`, `)` |

**The grammar is LL(1).** The alternatives of `statement`, `unary` and `primary` have disjoint FIRST sets. Each `{ op X }` loop continues on its own operators and stops on the FOLLOW set, and the two are disjoint (e.g. for `andExpr` the loop tokens {AND, NAND} do not meet FOLLOW(andExpr)). So one token of lookahead always decides. The parser peeks a second token only to choose a *better error message*.

### Semantic rule catalogue

| Code | Severity | Rule | Example that triggers it |
|---|---|---|---|
| E001 | error | Invalid character | `y = a @ b;` |
| E002 | error | Unterminated block comment | `/* …` with no `*/` |
| E003 | error | Stray `*/` | `a */ b` |
| E004 | error | Invalid constant / identifier starting with a digit | `2`, `1a` |
| E201 | error | Unexpected token ("expected X, found Y") | `y = a b;` |
| E202 | error | Missing semicolon | `input a` then a newline |
| E203 | error | Missing `)` | `y = (a AND b;` |
| E204 | error | Missing operand | `y = a AND ;` |
| E205 | error | Invalid statement start | `= a;`, `ouput y;` |
| E206 | error | Unmatched `)` | `y = a);` |
| E207 | error | Missing name in a declaration | `input ;`, `wire and;` |
| E208 | error | Nesting too deep (stack guard) | 300 nested `(` |
| E301 | error | Undeclared identifier | `y = bb;` |
| E302 | error | Duplicate declaration | `input a; wire a;` |
| E303 | error | **Output assigned more than once** | `y = a; y = b;` |
| E304 | error | Assignment to an input | `a = b;` |
| E305 | error | Output never assigned | `output z;` and no `z = …` |
| E306 | error | Signal used before being driven / never driven | `y = w; w = a;` |
| E307 | error | Combinational cycle | `w1 = w2; w2 = w1;` |
| E308 | error | Wire assigned more than once | `w = a; w = b;` |
| W301 | warning | Unused input | `input c;`, never read |
| W302 | warning | Unused wire | `wire w;`, never read |
| W303 | warning | No outputs declared | `input a;` only |
| W601 | warning | Truth table not generated (more than 10 inputs) | 12 inputs |
| W602 | warning | Circuit too large to draw (more than 400 nodes) | very large designs |
| E900 | error | Internal compiler error (caught, never thrown) | should never appear |

---

## 5. Optimiser rules, with proofs

All rules are Boolean-algebra identities, so each can be proven by a truth table over its free variable(s) (perfect induction). We write x̄ for NOT x.

| Rule | Rewrite | Proof |
|---|---|---|
| Constant folding | `OP c₁ c₂ → value` | Evaluate the operator on constants at compile time; nothing depends on inputs. |
| Constant / copy propagation | after `x = y`, a use of `x` becomes `y` | SSA: `x` is assigned once, so it equals `y` everywhere. |
| Identity law | x·1 = x, x+0 = x, x⊕0 = x, x⊙1 = x | x=0: 0·1=0, 0+0=0, 0⊕0=0, 0⊙1=0. x=1: 1·1=1, 1+0=1, 1⊕0=1, 1⊙1=1. ∎ |
| Annihilator law | x·0 = 0, x+1 = 1, NAND(x,0) = 1, NOR(x,1) = 0 | x·0 is 0 for x∈{0,1}; x+1 is 1; the NAND/NOR cases are the complements. ∎ |
| Inversion law | x⊕1 = x̄, x⊙0 = x̄, NAND(x,1) = x̄, NOR(x,0) = x̄ | x⊕1: 0⊕1=1, 1⊕1=0, which is x̄. NAND(x,1) = NOT(x·1) = x̄ by identity. Similarly for the others. ∎ |
| Idempotence | x·x = x, x+x = x, NAND(x,x) = x̄, NOR(x,x) = x̄ | 0·0=0, 1·1=1; 0+0=0, 1+1=1; NAND and NOR are the complements. ∎ |
| Self-cancellation | x⊕x = 0, x⊙x = 1 | XOR is 1 exactly when its operands differ; x never differs from itself. ∎ |
| Complement law | x·x̄ = 0, x+x̄ = 1, x⊕x̄ = 1 | Exactly one of x, x̄ is 1, so AND is 0, OR is 1, and XOR (operands differ) is 1. ∎ |
| Double negation | NOT(NOT x) = x | 0 → 1 → 0, 1 → 0 → 1. ∎ |
| Inverter absorption | NOT(AND a b) = NAND a b (also OR→NOR, XOR→XNOR and the reverse) | By definition NAND = NOT∘AND. Applied only when the inner gate has no other use, so one gate disappears. ∎ |
| Common subexpression | a later `t = OP x y` is replaced by `t = s` when `s = OP x y` (or `OP y x` for commutative operators) | In SSA, x and y have fixed values, so equal operators on equal operands give equal results; commutativity justifies sorting the operands. ∎ |
| Copy coalescing | `t = OP…; y = t` → `y = OP…` | Renaming in SSA: `t` is assigned once, and replacing every `t` by `y` changes no value. ∎ |
| Dead code | remove `t = …` if `t` does not reach any output | Combinational logic has no side effects, so an unread value cannot affect any output. ∎ |

**Termination.** We rely on explicit bounds rather than a formal proof. Each instruction is rewritten at most 8 times per pass. The outer loop stops as soon as a pass changes nothing, with a hard cap of 25 passes. What we *can* show is that the gate count never increases: every rewrite either turns a gate into a COPY or constant, or replaces one gate with exactly one gate (inversion law, inverter absorption). The property test asserts this on 400 random programs, and in practice every program converges within a few passes.

**Equivalence is also checked empirically.** Every truth table compares the optimised and original circuits on all inputs, and 400 random programs in the test suite are compared against an independent AST interpreter.

---

## 6. Edge cases handled

{{edge-cases}}

Additional robustness: CRLF line endings, tabs, empty input, `;;` empty statements, user signals named `t1` (temporaries skip taken names), signal names that are Verilog keywords (escaped), zero-input circuits (`y = 1;`), outputs that read other outputs, and binary/control characters (reported as E001, shown with `\uXXXX` escapes).

---

## 7. UI/UX design rationale and user manual

### Rationale

- **One screen, the whole pipeline.** The editor sits on the left and the phase stepper on the right, so cause (your text) and effect (each phase) are always visible together. The stepper draws the pipeline as a single trace line. A segment is lit when data flowed through it and dashed when the next phase was skipped, so a blocked phase is obvious at a glance.
- **Everything links back to the source.** Hovering a token, AST node, symbol, IR line, gate or problem highlights the exact source span, using the spans recorded in phase 1. This is the core teaching device: it connects each abstraction to the text that produced it.
- **One bold element.** The interface stays quiet (slate surfaces, one instrument-blue accent) so that the *live circuit* stands out. Green is reserved for logic 1 and grey for logic 0, so colour means something. Signals ripple left to right one layer at a time (110 ms per layer), which makes propagation through logic depth visible.
- **Errors as directions, not mood.** Every diagnostic says what is wrong, where, and how to fix it, with a code you can look up in §4. A skipped phase explains *why* it was skipped and links to the first error.
- **Accessible by default.** Every text colour token meets WCAG AA contrast (4.5:1) in both themes, which we checked by computation. There are visible focus rings; circuit inputs are real buttons, operable with Space/Enter and announced with their value; the step-through narration is an `aria-live` region; and motion is disabled under `prefers-reduced-motion`. Everything is reachable from the keyboard.
- **Typography.** IBM Plex Sans has an engineering heritage that fits the subject; JetBrains Mono is used for code and data. Both are bundled locally, so the offline build renders correctly without a network.

### User manual

1. **Write or load a program.** Type in the editor, or pick an example from the *Examples* menu. The menu has four groups: *Basic gates* (AND, OR, NOT, NAND, NOR, XOR, XNOR), *Circuits*, *Optimizer* and *Errors*. Everything except the *Errors* group compiles cleanly. The error demos cover the five most common mistakes; every other error code is listed in §4 and tested in §6.
2. **Compile.** With *Live* on, compilation happens 220 ms after you stop typing. Otherwise press **Compile** or **Ctrl+Enter**.
3. **Read the pipeline.** Each stepper node shows its status (a number on success, ⚠ for warnings, ✕ for errors, ⊘ for skipped) and its time. Click a node, or press Alt+1…6, to open its view:
   - *Lexer*: a colour-coded token table, filterable, with an option to show the discarded comments.
   - *Parser*: a collapsible AST with left/right/operand labels, plus a raw JSON toggle.
   - *Semantic*: a sortable symbol table (click a column header) with kind badges, drivers and usage lines, plus the dependency graph.
   - *IR*: three-address code beside the netlist DAG.
   - *Optimizer*: the gate count before → after, a before/after diff (− removed, ~ rewritten, + new), and an expandable list of every rule application.
   - *Codegen*: the live circuit, the truth table, the Boolean functions, and Verilog in its own tab.
4. **Play with the circuit.** Click an input pad to toggle it. Hover a truth-table row to preview it on the circuit, or click the row to keep it. Zoom with Ctrl+wheel or the +/− buttons, and drag to pan.
5. **Fix problems.** The Problems panel (Alt+P) lists every diagnostic. Click one to jump to its location. Errors are also underlined in the editor, and hovering an underline shows the message and suggestion.
6. **Present it.** Press **Step through** (Alt+S), then use Next and Prev (Alt+→ and Alt+←) to walk the phases, each with a plain-English explanation of what it did to *this* program.
7. **Export.** Use the top bar to download the circuit SVG, copy Verilog, or copy the optimised IR.

---

## 8. Testing strategy and results

| Layer | Tool | What is covered | Count |
|---|---|---|---|
| Lexer | Vitest | tokens, case-insensitivity, aliases, positions with CRLF, comments, every lexical error and its recovery | {{t-lexer}} |
| Parser | Vitest | structure, **precedence and associativity of every operator pair**, spans, every syntax error, multi-error recovery, depth guards | {{t-parser}} |
| Semantic | Vitest | every semantic error and warning code, multiple errors in one run, symbol and dependency data | {{t-semantic}} |
| Optimizer | Vitest | every rule individually, gate counts, a program that fires most rules | {{t-optimizer}} |
| IR and codegen | Vitest | TAC shape, temporary naming, netlist, truth tables of all reference circuits, minterms, QM, Verilog, layout invariants (orthogonal wires, inputs left of outputs), evaluator agreement, performance | {{t-codegen}} |
| Examples | Vitest | each of the 19 bundled examples produces exactly its declared diagnostics, and valid ones are equivalence-checked | {{t-examples}} |
| Fuzz and properties | Vitest | 1,500 random strings and 1,500 mutated programs never throw and always give in-range spans; **400 random expressions: AST interpreter = unoptimised IR = optimised IR on every input** | {{t-fuzz}} |
| End to end | Playwright | all 19 examples through the real UI, input toggling, step-through, live errors, Ctrl+Enter, the 10-input cap, theme, shortcuts, no console errors | 49 checks |

**Results.** All **{{t-total}} unit tests pass** (`npm test`, about 4 s) and all **49 browser checks pass**. `npm run build`, `npm run lint` and `tsc --noEmit` are clean.

**Bugs the tests found and we fixed** (worth mentioning in a viva):
1. *Editor update loop.* The browser test types very fast. Each keystroke's state update was urgent, and a debounced effect queued another urgent update, so React aborted with "maximum update depth exceeded". Fix: the editor is the source of truth for its text (it is uncontrolled while typing), and mirroring the text into React is marked as a non-urgent `startTransition`.
2. *Live-compile race.* "Compile now" read the newest text from a ref, but the debounced live compile captured an older copy from React state, and could overwrite a fresh result with a stale one. Fix: both paths read the same ref.
3. *Optimiser left `t1 = OR a b; y = t1`.* A test expected `y = OR a b`, which led to the copy-coalescing rule.
4. *Noisy diagnostics.* A typo `cary` produced both "undeclared `cary`" and "unused input `carry`". Signals named in a suggestion are now exempt from the unused warning.

**Performance.** A 320-statement, 10-input program (1,220 gates) compiles in about 65 ms end to end, including a 1,024-row truth table. Lexing and parsing take under 10 ms.

---

## 9. Design decisions log

| Decision | Alternatives | Why |
|---|---|---|
| Recursive descent, one method per precedence level | Pratt parser, LR parser generator | Maps 1:1 to the EBNF, easy to explain; generators were not allowed. |
| Strict gating: any error skips all later phases | Run semantic analysis on a partial AST | Simple and predictable rule; later phases never produce misleading output from broken input. Each phase still reports *all* of its own errors. |
| Read-before-drive is an error (E306) | Allow any order, like Verilog `assign` | Catches likely mistakes and makes textual order topological. Cycles are reported once, as E307. |
| Empty statements (`;;`) allowed silently | Report an error | Harmless; common in many languages. |
| Unused warnings suppressed for "did you mean" targets | Report both | Avoids two messages for one typo. |
| Optimise TAC, not the AST | Rewrite AST trees | Flat SSA code makes CSE (hashing) and DCE (liveness) natural. |
| Truth table capped at 10 inputs, QM at 8, drawing at 400 nodes | No caps | Keeps the UI responsive; each cap shows a friendly message instead of silently failing. |
| shadcn/ui components vendored by hand (Radix + Tailwind + cva) | `npx shadcn add` | The shadcn registry was unreachable from the build environment; the components follow the same structure and APIs. |
| Browser tests in Python Playwright | `@playwright/test` (Node) | The available Chromium build was wired to Python Playwright; the script is small and documented. |
| Fonts bundled with @fontsource | Google Fonts CDN | `dist/` must work offline from a static server. |

---

## 10. Limitations and future work

- **Combinational only.** There are no flip-flops, clocks or sequential logic. Adding `reg` with a clock would need a timing model and would change cycle detection (a cycle through a register is legal).
- **Single-bit signals.** There are no buses (`input [3:0] a`). These would need widths in the type system and bit-blasting in the IR.
- **No modules or hierarchy**, hence a single flat scope. Modules would introduce nested scopes and a scope chain in the symbol table.
- **Local optimiser.** It cannot find every minimum. Global methods (Quine–McCluskey per output, Espresso, or BDD-based minimisation) could resynthesise whole functions. Factoring out shared terms across outputs is also not attempted.
- **Greedy QM cover.** It is not guaranteed minimal in pathological cases; Petrick's method would make it exact.
- **Layout.** Barycentre sweeps reduce crossings but do not minimise them (that is NP-hard), and very large circuits (more than 400 nodes) are not drawn.
- **Future:** don't-care conditions; Karnaugh-map view for up to 4 variables; export to Logisim or Digital; gate-delay timing analysis with critical-path highlighting; a NAND-only technology mapper.

---

## 11. Viva preparation

### 25 likely questions with model answers

1. **What is the difference between a lexer and a parser?** The lexer groups characters into tokens using a regular language (a finite automaton). The parser checks the token sequence against a context-free grammar and builds a tree. Lexing handles whitespace and comments so the grammar does not have to. Here they are `lexer.ts` and `parser.ts`.

2. **Why is the lexer regular but the parser context-free?** Tokens never need nesting: an identifier is just letters and digits. Expressions need *balanced parentheses*, which no finite automaton can count, so a context-free grammar with a stack (or recursion) is required.

3. **What is a token, a lexeme and a pattern?** The pattern is the rule (`[A-Za-z_][A-Za-z0-9_]*`), the lexeme is the matched text (`carry`), and the token is the category plus attributes (`IDENT`, lexeme, line, column).

4. **How does your lexer distinguish keywords from identifiers?** It scans the longest identifier, then looks the lowercased lexeme up in a keyword table (`KEYWORDS`). This is maximal munch plus a table, so `ANDY` is an identifier, not `AND` followed by `Y`.

5. **How does your lexer recover from errors?** It reports an invalid character (grouping a run into one message), skips it, and keeps scanning. An unterminated comment is reported at its `/*` and consumes the rest of the file. The lexer always reaches EOF.

6. **What are FIRST and FOLLOW sets, and why do they matter?** FIRST(X) is the set of terminals that can start a string derived from X. FOLLOW(X) is the set of terminals that can appear right after X. A grammar is LL(1) when, for every choice, the FIRST sets of the alternatives (plus FOLLOW when an alternative can be empty) are disjoint, so one lookahead token decides. §4 lists ours; for example FOLLOW(andExpr) = {XOR, XNOR, OR, NOR, `;`, `)`}.

7. **LL versus LR parsing?** LL parses top-down, left to right, building a leftmost derivation, and predicts the rule from the lookahead. It is hand-writable as recursive descent, but cannot handle left recursion. LR parses bottom-up, building a rightmost derivation in reverse with shift/reduce actions. It handles more grammars (including left recursion) but is normally generated (yacc, bison). Our grammar is LL(1), so recursive descent is the natural choice.

8. **Why can't recursive descent handle left recursion, and how did you avoid it?** `E → E + T` would make `parseE` call itself before consuming any token, recursing forever. We rewrote it to iteration, `E → T { + T }`, which is the standard left-recursion elimination. The loop also gives left associativity.

9. **How do you get precedence and associativity?** Precedence: one grammar rule per level, where lower-precedence rules call higher ones (`orExpr → xorExpr → andExpr → unary`), so tighter operators end up deeper in the tree. Associativity: the `while` loop folds each new operand onto the tree built so far as its left child. `NOT` is right-recursive (`unary → NOT unary`).

10. **Parse tree versus AST?** A parse tree shows every grammar step and token, including `(`, `)` and `;`. An AST keeps only the meaning: our `(a AND b)` is just a `Binary(AND)` node, with grouping implied by its position. ASTs are smaller and are what later phases consume. We still keep the source span, including the parentheses, on each node.

11. **Explain panic-mode recovery.** On a syntax error, report it and discard tokens until a *synchronising token* (`;`, or a token that starts a statement), then resume. It is simple and never loops (at least one token is consumed). It may skip a little valid code, but it lets us report independent errors in one run. Our "missing `;`" check adds *phrase-level* recovery: we pretend the `;` was there and continue without skipping anything.

12. **What is a symbol table, and what does yours store?** It maps names to attributes. Ours stores name, kind (input/output/wire), declaration position, driver (the assigning statement), driver count and every usage span. It is a hash map with O(1) average insert and lookup.

13. **What is scope? How would you add nested scopes?** Scope is the region of the program where a name is visible. We have one flat module scope. For nested modules or blocks, use a *stack of tables* (a scope chain): lookup walks from the innermost scope outward, and leaving a block pops its table.

14. **Which checks are semantic and not syntactic, and why?** Declared-before-use, a single driver per output, no assignment to inputs, and no cycles. These depend on *context* (what was declared elsewhere, how many assignments exist), which a context-free grammar cannot express.

15. **How do you detect combinational cycles?** Build a dependency graph (signal → the signals its expression reads) and run a three-colour DFS. Reaching a grey node (one still on the current path) is a back edge, which means a cycle. The cycle is the current path from that node: O(V+E).

16. **What is three-address code?** A linear IR where each instruction has at most one operator and three addresses (a destination and two operands), e.g. `t1 = AND a b`. It is generated by a post-order AST walk, with temporaries holding intermediate results.

17. **What is SSA, and is your IR in SSA form?** Static single assignment: every variable is assigned exactly once. Yes: every temporary is fresh, and the semantic checks guarantee each user signal has exactly one driver. With no branches, no φ-functions are needed. SSA makes CSE, copy propagation and renaming (copy coalescing) trivially sound.

18. **Why have both TAC and a netlist?** TAC is best for analysis and evaluation (ordered, flat, hashable). The netlist DAG is best for drawing and for thinking in hardware terms (copies vanish, and fan-out is explicit). Both are generated from the same information.

19. **What kinds of optimisation exist, and which did you implement?** Optimisations can be grouped by scope (local, global, interprocedural) and by technique (folding, algebraic simplification, CSE, DCE, loop optimisations, and so on). We implemented local, machine-independent ones: constant folding and propagation, algebraic laws, double negation, inverter absorption, CSE by value numbering, copy propagation and coalescing, and DCE by liveness, iterated to a fixpoint.

20. **How do you know the optimiser is correct?** Three ways. Each rule is a proven Boolean identity (§5). Every compile compares the truth tables of the original and optimised circuits on all inputs, and the UI shows the result. And a property test checks 400 random programs against an independent AST interpreter.

21. **How does CSE work?** Value numbering: each instruction gets a key `OP(arg1,arg2)`, with operands sorted for commutative operators, so `AND a b` and `AND b a` match. If the key has been seen before, the instruction becomes a copy of the earlier result. Copy propagation and DCE then remove it.

22. **What is code generation here, and how is it different from a normal compiler?** Normally codegen means instruction selection, register allocation and scheduling for a CPU. Here the "machines" are three targets: interpretation for the truth table, layout for the circuit picture, and translation to Verilog. The principle is the same: map the IR onto the target's primitives (gates and `assign` statements).

23. **How does the circuit auto-layout work?** It uses Sugiyama's layered method: assign layers by longest path from the inputs, insert dummy nodes for long edges, reduce crossings with barycentre sweeps, place nodes vertically with isotonic regression (pool-adjacent-violators), and route wires orthogonally on per-net channel tracks, with junction dots at fan-out.

24. **How do you get the minimal sum of products?** Quine–McCluskey: merge implicants that differ in one bit until no more merges are possible (these are the prime implicants), take the essential primes, then cover the rest greedily. It is exact for small functions; Petrick's method would guarantee a minimum cover.

25. **How did you ensure the compiler never crashes?** Errors are data (`Diagnostic`), not exceptions. Recovery in the lexer and parser always makes progress. Depth limits prevent stack overflow. Every phase is wrapped in `try/catch` (a failure becomes E900). And it is fuzzed with 3,000 random and mutated inputs in the test suite.

### Explaining your own contribution

Use this template. Each member takes one or two modules and prepares the three talking points listed for it.

| Area | Files | Be ready to explain |
|---|---|---|
| Lexer and errors | `lexer.ts`, `errors.ts` | the scan loop and position tracking; keyword lookup; error grouping and hints; edit distance |
| Parser and AST | `parser.ts`, `ast.ts` | the EBNF ↔ method mapping; precedence and associativity; panic-mode recovery and the missing-`;` rule |
| Semantic analysis | `semantic.ts`, `symbols.ts` | the four passes; the symbol table; three-colour DFS cycle detection; read-before-drive |
| IR and optimiser | `ir.ts`, `optimizer.ts` | post-order TAC generation; SSA; each rule with its proof; value numbering; liveness DCE; fixpoint |
| Code generation | `codegen.ts`, `circuit.ts` | the truth table and fast evaluator; Quine–McCluskey; the five layout stages; Verilog emission |
| UI and integration | `src/components`, `pipeline.ts`, `App.tsx` | phase gating; source linking via spans; signal animation; step-through; the two concurrency bugs we fixed |
| Testing | `tests/`, `scripts/smoke_test.py` | the test pyramid; property-based equivalence; fuzzing; what the end-to-end test caught |

A good structure for a two-minute personal explanation is: **what problem** your part solves → **the key design decision** and the alternative you rejected → **one algorithm** in detail → **how you tested it** → **one bug** you found and fixed.
