Every row below was produced by running the compiler on `input a, b; output y;` followed by the input shown (⏎ marks a line break).

| Category | Input | Expected | Actual compiler output | Match |
|---|---|---|---|---|
| Lexical | `y = a @ b;` | E001: invalid character, scanning continues | E001 at 3:7: Invalid character `@`. *Hint: Remove it. Valid symbols are ! ~ & \| ^ = ; , ( ).* | ✅ |
| Lexical | `y = a $#@ b;` | E001: one diagnostic for a run of bad characters | E001 at 3:7: Invalid characters `$#@`. *Hint: Remove it. Valid symbols are ! ~ & \| ^ = ; , ( ).* | ✅ |
| Lexical | `y = a + b;` | E001: hint to use OR | E001 at 3:7: Invalid character `+`. *Hint: For OR, write `OR` or `\|`.* | ✅ |
| Lexical | `/* never closed ⏎ y = a;` | E002: reported at the opening /* | E002 at 3:1: Unterminated block comment: `/*` is never closed by `*/`. *Hint: Add `*/` where the comment should end.* | ✅ |
| Lexical | `y = a */ b;` | E003: stray end of comment | E003 at 3:7: Found `*/` without a matching `/*`. *Hint: Remove the `*/` or add `/*` where the comment should begin.* | ✅ |
| Lexical | `y = a AND 2;` | E004: only 0 and 1 are constants | E004 at 3:11: Invalid constant `2`: only 0 and 1 (or true/false) are allowed. *Hint: Use 0 or 1.* | ✅ |
| Lexical | `y = 1a;` | E004: identifiers cannot start with a digit | E004 at 3:5: Invalid token `1a`: identifiers cannot start with a digit. *Hint: Rename it, for example `_1a`.* | ✅ |
| Syntax | `y = a AND b` | E202: missing ; at end of file | E202 at 3:11: Missing `;` after the assignment: expected `;`, found end of file. *Hint: Every statement ends with `;`.* | ✅ |
| Syntax | `y = (a AND b;` | E203: missing ), points at the opening ( | E203 at 3:13: Unbalanced parentheses: expected `)` to close the `(` at 3:5, found `;`. *Hint: Add the missing `)`.* | ✅ |
| Syntax | `y = a AND b);` | E206: unmatched ) | E206 at 3:12: Unbalanced parentheses: this `)` has no matching `(`. *Hint: Remove the `)` or add a `(` earlier in the expression.* | ✅ |
| Syntax | `y = a AND ;` | E204: missing right operand | E204 at 3:11: Missing operand after `AND`: expected a signal, constant or `(`, found `;`. *Hint: Expected a signal name, 0, 1, or a parenthesised expression.* | ✅ |
| Syntax | `y = OR b;` | E204: missing left operand | E204 at 3:5: Missing operand before operator `OR`. *Hint: `OR` needs an operand on each side, e.g. `a OR b`.* | ✅ |
| Syntax | `y = ();` | E204: empty parentheses | E204 at 3:5: Missing operand: the parentheses are empty. *Hint: Put an expression inside, e.g. `(a AND b)`.* | ✅ |
| Syntax | `y = a ANDD b;` | E201: unexpected token, did you mean AND | E201 at 3:7: Expected an operator or `;`, found identifier `ANDD`. *Hint: Did you mean `AND`?* | ✅ |
| Syntax | `y = a b;` | E201: two operands with no operator | E201 at 3:7: Expected an operator or `;`, found identifier `b`. *Hint: Join operands with an operator such as AND, OR or XOR, or end the statement with `;`.* | ✅ |
| Syntax | `ouput z;` | E205: misspelt keyword at statement start | E205 at 3:1: Unknown statement `ouput`. *Hint: Did you mean `output`?* | ✅ |
| Syntax | `= a;` | E205: assignment without a target | E205 at 3:1: Missing assignment target before `=`. *Hint: Write the signal to drive first, e.g. `out = a AND b;`.* | ✅ |
| Syntax | `wire ;` | E207: declaration without names | E207 at 3:6: Expected a signal name after `wire`, found `;`. *Hint: Declarations list one or more names, e.g. `input a, b;`.* | ✅ |
| Syntax | `wire and;` | E207: reserved word as a name | E207 at 3:6: Expected a signal name after `wire`, found operator `and`. *Hint: `and` is a reserved word; choose another name such as `and_sig`.* | ✅ |
| Syntax | `y = ((((((((((((((((((((…)))))))))));` | E208: nesting limit instead of a stack overflow | E208 at 3:205: Expression is nested more than 200 levels deep. *Hint: Split it into intermediate wires.* | ✅ |
| Semantic | `y = a AND bb;` | E301: undeclared, did you mean b | E301 at 3:11: Undeclared identifier `bb`. *Hint: Did you mean `b`?* | ✅ |
| Semantic | `q = a; ⏎ y = b;` | E301: undeclared assignment target | E301 at 3:1: Assignment to undeclared signal `q`. *Hint: Declare it first, e.g. `output q;` or `wire q;`.* | ✅ |
| Semantic | `wire a; ⏎ y = a;` | E302: name already declared as input | E302 at 3:6: Duplicate declaration of `a`: already declared as an input on line 1. *Hint: A signal has exactly one kind. Keep either the input or the wire declaration.* | ✅ |
| Semantic | `y = a; ⏎ y = b;` | E303: output driven twice | E303 at 4:1: Output `y` is assigned more than once (first assigned on line 3). *Hint: A signal can have only one driver. Merge the expressions into one assignment (for example with OR), or assign a different signal.* | ✅ |
| Semantic | `a = b; ⏎ y = a;` | E304: driving an input | E304 at 3:1: Cannot assign to input `a`: inputs are driven from outside the circuit. *Hint: Declare a wire or an output to hold the result instead.* | ✅ |
| Semantic | `output z; ⏎ y = a AND b;` | E305: output never assigned | E305 at 3:8: Output `z` is never assigned. *Hint: Add an assignment such as `z = ...;`.* | ✅ |
| Semantic | `wire w; ⏎ y = a AND b AND w;` | E306: wire read but never driven | E306 at 4:17: Wire `w` is used but never driven. *Hint: Add an assignment such as `w = ...;` before it is used.* | ✅ |
| Semantic | `wire w; ⏎ y = w; ⏎ w = a AND b;` | E306: wire read before its driver | E306 at 4:5: `w` is used on line 4 before it is driven on line 5. *Hint: Move the assignment `w = ...;` above line 4.* | ✅ |
| Semantic | `wire w1, w2; ⏎ w1 = w2 AND a; ⏎ w2 = NOT w1 OR b; ⏎ y = w1;` | E307: cycle, with its path | E307 at 4:1: Combinational cycle: w1 → w2 → w1. *Hint: Combinational logic cannot feed back into itself. Break the loop by computing one of these signals from inputs only.* | ✅ |
| Semantic | `wire w; ⏎ w = w OR a; ⏎ y = w AND b;` | E307: self-loop | E307 at 4:1: Combinational cycle: w → w. *Hint: Combinational logic cannot feed back into itself. Break the loop by computing one of these signals from inputs only.* | ✅ |
| Semantic | `wire w; ⏎ w = a; ⏎ w = b; ⏎ y = w;` | E308: wire driven twice | E308 at 5:1: Wire `w` is assigned more than once (first assigned on line 4). *Hint: A signal can have only one driver. Merge the expressions into one assignment (for example with OR), or assign a different signal.* | ✅ |
| Semantic | `y = a;` | W301: unused input b (warning, still compiles) | W301 at 1:10: Input `b` is declared but never used. *Hint: Remove it, or use it in an expression.* | ✅ |
| Semantic | `wire w; ⏎ y = a AND b;` | W302: unused wire (warning) | W302 at 3:6: Wire `w` is declared but never used. *Hint: Remove it, or use it in an expression.* | ✅ |
| Robustness | empty file | W303 no outputs, no crash | W303 | ✅ |
| Robustness | 1,500 random strings (fuzz test) | no exception, valid spans | passes (tests/fuzz.test.ts) | ✅ |
| Codegen | 12 inputs | W601 table capped, equivalence on random vectors | W601: Truth table not generated: 12 inputs would need 4,096 rows (the limit is 10 inputs). | ✅ |
