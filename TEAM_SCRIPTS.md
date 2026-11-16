# Gatesmith: Team Presentation Scripts

A simple guide to what we built, split into four speaking parts. Each part takes about **2 to 3 minutes** to say out loud. Lines in *[square brackets and italics]* are things to **do** on screen, not things to say.

---

## The whole project in 30 seconds

We built a **compiler** for a tiny language that describes **logic gates**.

You write something like this:

```text
input a, b, c;
output out;
out = (a AND b) OR NOT c;
```

Our compiler reads it, checks it for mistakes, and turns it into three things:

1. a **truth table**: every input combination and its output;
2. a **circuit diagram**: real gate shapes connected by wires, where you can click the inputs and watch the signals change;
3. **Verilog**: the language real chip designers use.

It works in **six steps** (called *phases*), and the app shows the result of every step live, while you type. Everything runs in the web browser. We wrote the compiler by hand, without any parser-generator tools.

---

## Words you will say (simple meanings)

| Word | What it means, simply |
|---|---|
| **Compiler** | A program that translates code from one form into another. |
| **Gate** | A tiny logic switch: AND, OR, NOT, NAND, NOR, XOR, XNOR. |
| **Token** | One "word" of the code, like `input`, `a`, `AND` or `;`. |
| **Lexer** | Step 1. Cuts the text into tokens. |
| **Parser** | Step 2. Checks the grammar and builds a tree. |
| **Syntax tree (AST)** | A tree showing what the code means and in which order things happen. |
| **Symbol table** | A list of every signal name: whether it is an input, output or wire, where it was declared, and who sets it. |
| **Semantic check** | Step 3. Checks that the code *makes sense*, not just that it is spelled right. |
| **IR / three-address code** | Step 4. The code rewritten as simple one-gate-per-line steps, like `t1 = AND a b`. |
| **Optimizer** | Step 5. Removes gates that do nothing useful. |
| **Code generation** | Step 6. Produces the truth table, circuit and Verilog. |
| **t1, t2…** | Temporary names for in-between results. |

---

## Who presents what

**Tip:** Person 4 drives the laptop the whole time, so the others can just talk.

| Person | Part | Time | Examples to click |
|---|---|---|---|
| **Person 1** | Introduction, the language, Step 1 (Lexer) | ~2.5 min | *Specification example*, *AND gate* |
| **Person 2** | Step 2 (Parser) and Step 3 (finding mistakes) | ~3 min | *Syntax errors*, *Undefined signal*, *Output assigned twice* |
| **Person 3** | Step 4 (IR), Step 5 (Optimizer), Step 6 (outputs) | ~3 min | *Specification example*, *Simplification demo* |
| **Person 4** | Live demo, how we tested it, wrap-up | ~2.5 min | *Full adder*, *Half adder* |

---

## Person 1: Introduction, the language, and the Lexer

> **Say:**
>
> "Hi, we are [team names]. Our project is **Gatesmith**, a compiler for a small language that describes logic circuits.
>
> Logic gates are the building blocks of every computer chip. Our language lets you describe a circuit in plain text. It has all seven basic gates: **AND, OR, NOT, NAND, NOR, XOR and XNOR**."

*[Open the Examples menu and click **AND gate**.]*

> "Here is the simplest program. You say which signals are **inputs**, which are **outputs**, and then you write the formula: `y = a AND b`. The circuit appears on the right, and if I click the inputs, the output changes."

*[Click input `a`, then input `b`, to show `y` turn green (1).]*

> "Now, how does the compiler understand the text? It works in six steps. You can see them across the top: Lexer, Parser, Semantic, IR, Optimizer and Codegen."

*[Click **Specification example**, then click step **1 Lexer**.]*

> "Step one is the **lexer**. It reads the text one character at a time and cuts it into **tokens**, like cutting a sentence into words. `input` is a keyword, `a` is a name, `AND` is an operator, and the semicolon ends a line. Spaces and comments are thrown away here.
>
> If I hover over a token, it lights up in the code, so you can see exactly where each one came from."

*[Hover over a few rows in the token table.]*

> "If someone types a character that is not allowed, like a plus sign or an @, the lexer reports it with the line and column, skips it, and keeps going. Now Person 2 will explain how we check the grammar."

---

## Person 2: The Parser and finding mistakes

*[Click step **2 Parser**.]*

> **Say:**
>
> "Step two is the **parser**. It takes the tokens and checks that they follow the grammar, the rules of our language. Then it builds a **syntax tree**.
>
> The tree shows the order things happen in. NOT is done first, then AND, then XOR, then OR, just like multiplication comes before addition in maths. So in `(a AND b) OR NOT c`, OR is at the top, because it is done last.
>
> We wrote the parser by hand. Each grammar rule is one function, which makes it easy to read and easy to check."

*[Open **Syntax errors** from the Examples menu.]*

> "Here is a program with three mistakes: a missing semicolon, a missing bracket, and an operator with nothing after it. A simple compiler would stop at the first mistake. Ours reports **all three at once**. When it finds an error, it skips forward to the next semicolon and carries on.
>
> Every error has a code, a line number, and a hint about how to fix it."

*[Point at the Problems panel at the bottom. Click one problem to show it jump to the code.]*

> "Step three is **semantic checking**. It asks whether the code *makes sense*. For that we keep a **symbol table**, a list of every signal name."

*[Open **Undefined signal**.]*

> "Here someone typed `cary` instead of `carry`. The grammar is fine, but the name was never declared. Our compiler says *'did you mean carry?'*. It works that out by counting how many letters differ between the two names."

*[Open **Output assigned twice**.]*

> "This is one of the main rules of the project: **an output can only be set once**. Here `y` is set twice, which is impossible in a real circuit, so we report an error.
>
> We also catch signals that are used but never declared, assigning to an input, loops where a wire feeds back into itself, and unused inputs, which get a warning. When there is an error, the later steps are marked **skipped**, so we never draw a broken circuit. Over to Person 3."

---

## Person 3: IR, Optimizer, and the outputs

*[Open **Specification example**, then click step **4 IR**.]*

> **Say:**
>
> "Step four turns the tree into **three-address code**: a simple list where every line does just one gate.

```text
t1  = AND a b
t2  = NOT c
out = OR t1 t2
```

> "`t1` and `t2` are temporary names for in-between results. Each line is basically one gate, which makes the next steps much easier. On the right is the same thing drawn as a graph of gates."

*[Open **Simplification demo**, then click step **5 Optimizer**.]*

> "Step five is the **optimizer**. It removes gates that do nothing useful. Look at this program:
>
> - `NOT NOT a` is just `a`, because two NOTs cancel out.
> - `a AND 1` is just `a`.
> - `b AND 0` is always `0`.
>
> So this circuit had **5 gates, and after optimisation it has 0**. Both outputs are simply wired to `a`. The red lines on the left were removed, and the list below shows which rule did what."

*[Expand **Double negation** in the Applied rules list.]*

> "How do we know the optimizer did not break anything? We run the original circuit and the optimised one on **every possible input** and compare the answers. The app shows that check at the top of the truth table."

*[Click step **6 Codegen**.]*

> "Step six makes the three outputs. The **truth table** lists every input combination, and green rows are where the output is 1. The **circuit diagram** is drawn automatically: inputs on the left, gates in the middle, outputs on the right. The **Verilog** tab has real hardware code. Person 4 will show it working."

---

## Person 4: Live demo, testing, and wrap-up

*[Open **Full adder**. Stay on step **6 Codegen**.]*

> **Say:**
>
> "This is a **full adder**. It adds three bits together, and it is used in every computer's maths unit. I will click the inputs."

*[Click `a`, then `cin`. Point at the green wires.]*

> "You can see the signal move through the gates from left to right. **Green means 1 and grey means 0.** One plus one gives `sum = 0` and `cout = 1` (carry out), which is binary for two: correct.
>
> If I hover over a row in the truth table, the circuit shows that row."

*[Hover two or three truth-table rows.]*

> "Now I will type something live."

*[Click at the end of the line `cout = g1 OR g2;` and delete `g2` so it reads `cout = g1 OR ;`]*

> "The mistake is underlined straight away, the Problems panel explains it, and the later steps are skipped. I will undo it."

*[Press **Ctrl+Z**. Everything turns green again.]*

> "For our viva demo we also built **Step-through mode**."

*[Click **Step through** at the top, then press **Next** twice.]*

> "It goes through each step and explains in plain English what that step did to *this* program.
>
> Finally, **testing**. We have **96 automatic tests**. They check every step, every error message, and every optimizer rule. We also feed the compiler thousands of random, broken programs to make sure it **never crashes**, and we test hundreds of random circuits to prove the optimizer never changes the answer. On top of that, a browser robot clicks through the whole app: 49 checks, all passing.
>
> To sum up: we built all six phases of a compiler by hand, with all seven basic gates, clear error messages, and three outputs: a truth table, a live circuit, and Verilog. Thank you. We are happy to take questions."

---

## If they ask: simple answers

**What is the difference between the lexer and the parser?**
The lexer cuts text into words (tokens). The parser checks that the words are in a valid order and builds a tree.

**How do you make NOT happen before AND, and AND before OR?**
Each level has its own grammar rule. The lowest-priority rule (OR) calls the next one (XOR), which calls AND, which calls NOT. So the higher-priority operators end up deeper in the tree, and get worked out first.

**What is a symbol table?**
A list of every name in the program, recording whether it is an input, output or wire, where it was declared, and which line sets its value.

**How do you report many errors at once?**
When the parser hits a mistake, it records it, skips to the next semicolon, and continues. This is called *panic-mode recovery*.

**Why can an output only be assigned once?**
In a real circuit, one wire cannot be driven by two different gates at the same time; it would be a short circuit. So we report error **E303**.

**What is a combinational cycle?**
A wire that depends on itself, for example `w1 = w2` and `w2 = w1`. It has no stable answer, so we report error **E307**.

**What is three-address code?**
A list where each line does one operation with at most two inputs, like `t1 = AND a b`. It is easier to optimise than a tree.

**How do you know the optimizer is correct?**
Every rule is a basic law of logic (like "x AND 1 = x"). We also check the truth table before and after on every input, and our tests do the same for hundreds of random circuits.

**Why stop the truth table at 10 inputs?**
Each extra input doubles the rows. Ten inputs is 1,024 rows; twenty would be over a million. Above 10 we show a friendly message instead.

**Could it crash if I type nonsense?**
No. Every step reports problems as messages instead of crashing, and we tested it with thousands of random inputs.

For harder questions, see the **Viva preparation** section of `GUIDE.pdf` (25 questions with answers).

---

## Checklist before the viva

- [ ] Run `npm install`, then `npm run dev`, and open the link it prints. Do this **before** you walk in.
- [ ] Pick the dark or light theme (moon/sun button, top right). Light is easier to see on projectors.
- [ ] Zoom the browser to about 110–125% so the room can read it.
- [ ] Practise the example order: AND gate → Specification example → Syntax errors → Undefined signal → Output assigned twice → Simplification demo → Full adder.
- [ ] Backup plan: if `npm run dev` fails, run `npx serve dist` (or `python3 -m http.server 8080 --directory dist`) and open that address instead.
- [ ] Each person reads their part out loud once, with a timer.
- [ ] Keep `GUIDE.pdf` open in another tab for deep questions.
