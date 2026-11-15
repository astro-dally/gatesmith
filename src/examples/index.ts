/**
 * Bundled examples. `expect` lists the diagnostic codes each example must
 * produce (tests/examples.test.ts enforces this), so the dropdown doubles as a
 * regression suite.
 */
export interface Example {
  id: string
  name: string
  group: 'Basic gates' | 'Circuits' | 'Optimizer' | 'Errors'
  blurb: string
  source: string
  expect: string[]
}

export const EXAMPLES: Example[] = [
  {
    id: 'gate-and',
    name: 'AND gate',
    group: 'Basic gates',
    blurb: 'y is 1 only when a and b are both 1',
    expect: [],
    source: `// AND gate: y is 1 only when a and b are both 1.
input a, b;
output y;

y = a AND b;
`,
  },
  {
    id: 'gate-or',
    name: 'OR gate',
    group: 'Basic gates',
    blurb: 'y is 1 when a or b (or both) is 1',
    expect: [],
    source: `// OR gate: y is 1 when a or b (or both) is 1.
input a, b;
output y;

y = a OR b;
`,
  },
  {
    id: 'gate-not',
    name: 'NOT gate',
    group: 'Basic gates',
    blurb: 'y is the opposite of a',
    expect: [],
    source: `// NOT gate: y is the opposite of a.
input a;
output y;

y = NOT a;
`,
  },
  {
    id: 'gate-nand',
    name: 'NAND gate',
    group: 'Basic gates',
    blurb: 'the opposite of AND',
    expect: [],
    source: `// NAND gate: the opposite of AND.
input a, b;
output y;

y = a NAND b;
`,
  },
  {
    id: 'gate-nor',
    name: 'NOR gate',
    group: 'Basic gates',
    blurb: 'the opposite of OR',
    expect: [],
    source: `// NOR gate: the opposite of OR.
input a, b;
output y;

y = a NOR b;
`,
  },
  {
    id: 'gate-xor',
    name: 'XOR gate',
    group: 'Basic gates',
    blurb: 'y is 1 when a and b are different',
    expect: [],
    source: `// XOR gate: y is 1 when a and b are different.
input a, b;
output y;

y = a XOR b;
`,
  },
  {
    id: 'gate-xnor',
    name: 'XNOR gate',
    group: 'Basic gates',
    blurb: 'y is 1 when a and b are the same',
    expect: [],
    source: `// XNOR gate: y is 1 when a and b are the same.
input a, b;
output y;

y = a XNOR b;
`,
  },
  {
    id: 'spec',
    name: 'Specification example',
    group: 'Circuits',
    blurb: 'out = (a AND b) OR NOT c',
    expect: [],
    source: `// The example from the project specification.
input a, b, c;
output out;

out = (a AND b) OR NOT c;
`,
  },
  {
    id: 'xor-basic',
    name: 'XOR from basic gates',
    group: 'Circuits',
    blurb: 'Exclusive-or built from AND, OR and NOT',
    expect: [],
    source: `// a XOR b, written with AND / OR / NOT only.
input a, b;
output y;

y = (a AND NOT b) OR (NOT a AND b);
`,
  },
  {
    id: 'half-adder',
    name: 'Half adder',
    group: 'Circuits',
    blurb: 'Adds two bits: sum and carry',
    expect: [],
    source: `// Half adder: adds two 1-bit numbers.
input a, b;
output sum, carry;

sum   = a ^ b;     // symbol alias for XOR
carry = a & b;     // symbol alias for AND
`,
  },
  {
    id: 'full-adder',
    name: 'Full adder',
    group: 'Circuits',
    blurb: 'Two half adders and an OR, using wires',
    expect: [],
    source: `/* Full adder: a + b + cin = (cout, sum).
   Built from two half adders joined by wires. */
input a, b, cin;
output sum, cout;
wire p, g1, g2;

p    = a XOR b;          // first half adder: partial sum
g1   = a AND b;          //                   carry
sum  = p XOR cin;        // second half adder
g2   = p AND cin;
cout = g1 OR g2;
`,
  },
  {
    id: 'mux',
    name: '2-to-1 multiplexer',
    group: 'Circuits',
    blurb: 'Selects d0 or d1 using s',
    expect: [],
    source: `// 2-to-1 multiplexer: y = d0 when s = 0, y = d1 when s = 1.
input s, d0, d1;
output y;

y = (NOT s AND d0) OR (s AND d1);
`,
  },
  {
    id: 'majority',
    name: 'Majority gate',
    group: 'Circuits',
    blurb: 'High when at least two of three inputs are high',
    expect: [],
    source: `// 3-input majority (voter) circuit.
input a, b, c;
output m;

m = (a AND b) OR (a AND c) OR (b AND c);
`,
  },
  {
    id: 'simplify',
    name: 'Simplification demo',
    group: 'Optimizer',
    blurb: 'Watch the optimizer remove gates that do nothing',
    expect: [],
    source: `// Each line has gates that do nothing. Open the Optimizer phase.
input a, b;
output y, z;

y = NOT NOT a;                // two NOTs cancel out: y = a
z = (a AND 1) OR (b AND 0);   // AND 1 keeps a, AND 0 is always 0: z = a
`,
  },
  {
    id: 'err-undefined',
    name: 'Undefined signal',
    group: 'Errors',
    blurb: 'E301 with a "did you mean" suggestion',
    expect: ['E301'],
    source: `input a, b, carry;
output out;

out = (a AND b) OR cary;   // typo: cary is never declared
`,
  },
  {
    id: 'err-double',
    name: 'Output assigned twice',
    group: 'Errors',
    blurb: 'E303: one output, two drivers',
    expect: ['E303'],
    source: `input a, b;
output y;

y = a AND b;
y = a OR b;     // second driver for y
`,
  },
  {
    id: 'err-syntax',
    name: 'Syntax errors',
    group: 'Errors',
    blurb: 'Missing ;, unbalanced ( and a missing operand, all in one run',
    expect: ['E202', 'E203', 'E204'],
    source: `input a, b, c
output x, y, z;

x = (a AND b;       // missing )
y = a OR ;          // missing operand
z = NOT c;
`,
  },
  {
    id: 'err-cycle',
    name: 'Combinational cycle',
    group: 'Errors',
    blurb: 'E307: wires that feed back on each other',
    expect: ['E307'],
    source: `input a;
output y;
wire w1, w2;

w1 = a AND w2;
w2 = NOT w1;      // w1 → w2 → w1 is a loop
y = w1;
`,
  },
  {
    id: 'err-char',
    name: 'Invalid characters',
    group: 'Errors',
    blurb: 'E001 and E004: characters the lexer cannot read',
    expect: ['E001', 'E001', 'E004'],
    source: `input a, b;
output y;

y = a + b;     // '+' is not an operator here; use OR
y = a @ 2;
`,
  },
]

export const DEFAULT_EXAMPLE = EXAMPLES.find((e) => e.id === 'spec')!
