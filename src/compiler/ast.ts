/**
 * ast.ts — Abstract Syntax Tree types.
 *
 * The AST keeps only what later phases need. Unlike a parse tree it has no
 * nodes for `;`, `,` or parentheses: grouping is already encoded in the tree's
 * shape, and a node's span still covers its parentheses so the UI can
 * highlight exactly what the user wrote.
 */
import type { Span } from './errors'

export type BinaryOp = 'AND' | 'NAND' | 'OR' | 'NOR' | 'XOR' | 'XNOR'
export type DeclKind = 'input' | 'output' | 'wire'

export interface IdentExpr {
  kind: 'Ident'
  name: string
  span: Span
}

export interface ConstExpr {
  kind: 'Const'
  value: 0 | 1
  span: Span
}

export interface UnaryExpr {
  kind: 'Unary'
  op: 'NOT'
  operand: Expr
  span: Span
  opSpan: Span
}

export interface BinaryExpr {
  kind: 'Binary'
  op: BinaryOp
  left: Expr
  right: Expr
  span: Span
  opSpan: Span
}

export type Expr = IdentExpr | ConstExpr | UnaryExpr | BinaryExpr

export interface Name {
  name: string
  span: Span
}

export interface Declaration {
  kind: 'Declaration'
  declKind: DeclKind
  names: Name[]
  span: Span
}

export interface Assignment {
  kind: 'Assignment'
  target: Name
  expr: Expr
  span: Span
}

export type Statement = Declaration | Assignment

export interface Program {
  kind: 'Program'
  body: Statement[]
  span: Span
}

export type AstNode = Program | Statement | Expr

/** Children of a node in source order (used by the AST viewer and visitors). */
export function childrenOf(node: AstNode): AstNode[] {
  switch (node.kind) {
    case 'Program': return node.body
    case 'Assignment': return [node.expr]
    case 'Declaration': return []
    case 'Unary': return [node.operand]
    case 'Binary': return [node.left, node.right]
    default: return []
  }
}

/** Pretty-prints an expression with the minimum parentheses needed. */
export function exprToString(e: Expr, parentPrec = 0): string {
  switch (e.kind) {
    case 'Ident': return e.name
    case 'Const': return String(e.value)
    case 'Unary': return `NOT ${exprToString(e.operand, PREC.NOT)}`
    case 'Binary': {
      const p = PREC[e.op]
      // Left-associative: the right child needs parens at equal precedence.
      const s = `${exprToString(e.left, p)} ${e.op} ${exprToString(e.right, p + 1)}`
      return p < parentPrec ? `(${s})` : s
    }
  }
}

/** Binding strength of each operator (higher binds tighter). */
export const PREC: Record<BinaryOp | 'NOT', number> = {
  OR: 1, NOR: 1,
  XOR: 2, XNOR: 2,
  AND: 3, NAND: 3,
  NOT: 4,
}

/** Converts the AST to plain JSON (spans included) for the raw-JSON view. */
export function astToJSON(node: AstNode): unknown {
  return JSON.parse(JSON.stringify(node))
}
