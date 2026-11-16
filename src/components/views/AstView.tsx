import { useMemo, useState } from 'react'
import { ChevronRight, Code2, Network } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AstNode, Program } from '@/compiler/ast'
import { childrenOf } from '@/compiler/ast'
import type { Span } from '@/compiler/errors'
import { useSourceLink } from '@/lib/source-link'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Section } from './common'
import { cn } from '@/lib/utils'

const KIND_STYLE: Record<string, string> = {
  Program: 'text-fg', Declaration: 'text-syn-kw', Assignment: 'text-accent',
  Binary: 'text-syn-op', Unary: 'text-syn-op', Ident: 'text-fg', Const: 'text-syn-const',
}

function describe(n: AstNode): { kind: string; detail: string } {
  switch (n.kind) {
    case 'Program': return { kind: 'Program', detail: `${n.body.length} statements` }
    case 'Declaration': return { kind: 'Declaration', detail: `${n.declKind} ${n.names.map((x) => x.name).join(', ')}` }
    case 'Assignment': return { kind: 'Assignment', detail: `${n.target.name} =` }
    case 'Binary': return { kind: 'BinaryOp', detail: n.op }
    case 'Unary': return { kind: 'UnaryOp', detail: 'NOT' }
    case 'Ident': return { kind: 'Identifier', detail: n.name }
    case 'Const': return { kind: 'Constant', detail: String(n.value) }
  }
}

const spanText = (s: Span) => (s.line === s.endLine ? `${s.line}:${s.col}–${s.endCol}` : `${s.line}:${s.col}–${s.endLine}:${s.endCol}`)

function TreeNode({ node, depth, path, open, toggle, edge }: {
  node: AstNode; depth: number; path: string; open: Set<string>; toggle: (p: string) => void; edge?: string
}) {
  const link = useSourceLink()
  const kids = childrenOf(node)
  const isOpen = open.has(path)
  const { kind, detail } = describe(node)
  const hasKids = kids.length > 0 || (node.kind === 'Declaration')
  const edgeFor = (i: number) => (node.kind === 'Binary' ? (i === 0 ? 'left' : 'right') : node.kind === 'Unary' ? 'operand' : undefined)
  return (
    <li role="treeitem" aria-expanded={hasKids ? isOpen : undefined}>
      <div
        className="group flex cursor-pointer items-center gap-1.5 rounded-md py-[3px] pr-2 transition-colors hover:bg-accent-soft"
        style={{ paddingLeft: depth * 16 + 4 }}
        onMouseEnter={() => link.hover(node.span)}
        onMouseLeave={() => link.hover(null)}
        onClick={() => link.select(node.span)}
      >
        <button
          className={cn('flex size-4 items-center justify-center rounded text-faint hover:text-fg', !hasKids && 'invisible')}
          onClick={(e) => { e.stopPropagation(); toggle(path) }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
        </button>
        <span className={cn('text-[13px] font-medium', KIND_STYLE[node.kind])}>{kind}</span>
        <span className="font-mono text-[12.5px] text-fg/90">{detail}</span>
        {edge && <span className="text-[10.5px] text-faint">({edge})</span>}
        <span className="ml-auto font-mono text-[11px] text-faint opacity-0 transition-opacity group-hover:opacity-100">{spanText(node.span)}</span>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && hasKids && (
          <motion.ul role="group" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }} className="relative overflow-hidden">
            <span aria-hidden className="absolute bottom-1 top-0 w-px bg-line" style={{ left: depth * 16 + 11 }} />
            {node.kind === 'Declaration'
              ? node.names.map((n) => (
                <li key={n.span.start} role="treeitem">
                  <div className="flex cursor-pointer items-center gap-1.5 rounded-md py-[3px] hover:bg-accent-soft" style={{ paddingLeft: (depth + 1) * 16 + 24 }}
                    onMouseEnter={() => link.hover(n.span)} onMouseLeave={() => link.hover(null)} onClick={() => link.select(n.span)}>
                    <span className="text-[13px] font-medium text-fg">Name</span>
                    <span className="font-mono text-[12.5px]">{n.name}</span>
                  </div>
                </li>
              ))
              : kids.map((k, i) => (
                <TreeNode key={i} node={k} depth={depth + 1} path={`${path}.${i}`} open={open} toggle={toggle} edge={edgeFor(i)} />
              ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  )
}

function allPaths(node: AstNode, path: string, out: string[], depth: number, max: number) {
  if (depth > max) return
  out.push(path)
  childrenOf(node).forEach((c, i) => allPaths(c, `${path}.${i}`, out, depth + 1, max))
}

export default function AstView({ program }: { program: Program }) {
  const [mode, setMode] = useState<'tree' | 'json'>('tree')
  const initial = useMemo(() => {
    const p: string[] = []
    allPaths(program, 'r', p, 0, 6)
    return new Set(p)
  }, [program])
  const [open, setOpen] = useState<Set<string>>(initial)
  const [prevProgram, setPrevProgram] = useState(program)
  if (prevProgram !== program) {
    // Reset expansion when a new tree arrives (React's derived-state pattern).
    setPrevProgram(program)
    setOpen(initial)
  }
  const toggle = (p: string) => setOpen((s) => {
    const n = new Set(s)
    if (n.has(p)) n.delete(p)
    else n.add(p)
    return n
  })
  const json = useMemo(() => JSON.stringify(program, null, 2), [program])

  return (
    <Section
      className="flex h-full min-h-0 flex-col"
      title="Abstract syntax tree"
      aside={
        <>
          {mode === 'tree' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => { const p: string[] = []; allPaths(program, 'r', p, 0, 999); setOpen(new Set(p)) }}>Expand all</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(new Set(['r']))}>Collapse</Button>
            </>
          )}
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'tree' | 'json')}>
            <TabsList>
              <TabsTrigger value="tree"><Network />Tree</TabsTrigger>
              <TabsTrigger value="json"><Code2 />JSON</TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {mode === 'tree' ? (
          <ul role="tree" aria-label="Abstract syntax tree">
            <TreeNode node={program} depth={0} path="r" open={open} toggle={toggle} />
          </ul>
        ) : (
          <pre className="whitespace-pre p-2 font-mono text-[12px] leading-relaxed text-muted">{json}</pre>
        )}
      </div>
      <footer className="border-t border-line px-3.5 py-2 text-[12px] text-muted">
        Hover a node to highlight its source. Parentheses are not nodes: grouping lives in the shape of the tree.
      </footer>
    </Section>
  )
}
