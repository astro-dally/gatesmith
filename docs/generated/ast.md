```text
Program
├── Declaration(input: a, b, c)  [1:1-1:15]
├── Declaration(output: out)  [2:1-2:12]
└── Assignment(target: out)  [3:1-3:26]
    └── Binary(OR)  [3:7-3:25]
        ├── Binary(AND)  [3:7-3:16]
        │   ├── Ident(a)  [3:8-3:9]
        │   └── Ident(b)  [3:14-3:15]
        └── Unary(NOT)  [3:20-3:25]
            └── Ident(c)  [3:24-3:25]
```
