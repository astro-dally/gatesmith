| Pass | Rule | Before | After |
|---|---|---|---|
| 1 | Double negation | `t2 = NOT t1` | `t2 = a` |
| 1 | Identity law | `t3 = OR b 0` | `t3 = b` |
| 1 | Copy propagation | `t4 = AND t2 t3` | `t4 = AND a b` |
| 1 | Identity law | `y = AND t4 1` | `y = t4` |
| 1 | Common subexpression | `t5 = AND a b` | `t5 = t4` |
| 1 | Common subexpression | `t6 = AND b a` | `t6 = t4` |
| 1 | Copy propagation | `t7 = OR t5 t6` | `t7 = OR t4 t4` |
| 1 | Idempotence | `t7 = OR t4 t4` | `t7 = t4` |
| 1 | Complement law | `t9 = AND c t8` | `t9 = 0` |
| 1 | Constant propagation | `z = OR t7 t9` | `z = OR t4 0` |
| 1 | Identity law | `z = OR t4 0` | `z = t4` |
| 1 | Self-cancellation | `spare = XOR a a` | `spare = 0` |
| 1 | Constant folding | `t10 = AND 1 0` | `t10 = 0` |
| 1 | Constant propagation | `t11 = OR spare t10` | `t11 = OR 0 0` |
| 1 | Constant folding | `t11 = OR 0 0` | `t11 = 0` |
| 1 | Constant propagation | `k = OR t11 c` | `k = OR 0 c` |
| 1 | Identity law | `k = OR 0 c` | `k = c` |
| 1 | Dead code | `t11 = 0` | *(removed)* |
| 1 | Dead code | `t10 = 0` | *(removed)* |
| 1 | Dead code | `spare = 0` | *(removed)* |
| 1 | Dead code | `t9 = 0` | *(removed)* |
| 1 | Dead code | `t8 = NOT c` | *(removed)* |
| 1 | Dead code | `t7 = t4` | *(removed)* |
| 1 | Dead code | `t6 = t4` | *(removed)* |
| 1 | Dead code | `t5 = t4` | *(removed)* |
| 1 | Dead code | `t3 = b` | *(removed)* |
| 1 | Dead code | `t2 = a` | *(removed)* |
| 1 | Dead code | `t1 = NOT a` | *(removed)* |
| 1 | Copy coalescing | `t4 = AND a b; y = t4` | `y = AND a b` |

Gate count: **15 → 1**. Final code:

```text
y = AND a b
z = y
k = c
```
