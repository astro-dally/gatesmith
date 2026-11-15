import type { PhaseName } from '@/compiler/errors'
import { Binary, Braces, Cpu, ListTree, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'

export interface PhaseMeta {
  id: PhaseName
  title: string
  view: string
  icon: LucideIcon
  blurb: string
}

export const PHASE_META: PhaseMeta[] = [
  { id: 'lexer', title: 'Lexer', view: 'Tokens', icon: Binary, blurb: 'Characters to tokens' },
  { id: 'parser', title: 'Parser', view: 'Syntax tree', icon: ListTree, blurb: 'Tokens to a syntax tree' },
  { id: 'semantic', title: 'Semantic', view: 'Symbol table', icon: ShieldCheck, blurb: 'Names, drivers and cycles' },
  { id: 'ir', title: 'IR', view: 'Three-address code', icon: Braces, blurb: 'Tree to instructions and netlist' },
  { id: 'optimizer', title: 'Optimizer', view: 'Optimisation', icon: Sparkles, blurb: 'Algebraic simplification' },
  { id: 'codegen', title: 'Codegen', view: 'Outputs', icon: Cpu, blurb: 'Truth table, circuit, Verilog' },
]

export const phaseIndex = (p: PhaseName) => PHASE_META.findIndex((m) => m.id === p)
