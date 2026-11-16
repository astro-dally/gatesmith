| row | a | b | c | out |
|---|---|---|---|---|
| **m0** | 0 | 0 | 0 | **1** |
| 1 | 0 | 0 | 1 | 0 |
| **m2** | 0 | 1 | 0 | **1** |
| 3 | 0 | 1 | 1 | 0 |
| **m4** | 1 | 0 | 0 | **1** |
| 5 | 1 | 0 | 1 | 0 |
| **m6** | 1 | 1 | 0 | **1** |
| **m7** | 1 | 1 | 1 | **1** |

Minterms: Σm(0, 2, 4, 6, 7)  
Minimal SOP (Quine–McCluskey): `NOT c OR (a AND b)`  
Equivalence: optimised and unoptimised code agree on all 8 inputs.
