import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { LexResult, TokenType } from '@/compiler/lexer'
import { Badge } from '../ui/badge'
import { useSourceLink, linkProps } from '@/lib/source-link'
import { Section, Stat, td, th } from './common'
import { cn } from '@/lib/utils'

type Tone = 'kw' | 'accent' | 'const' | 'neutral'
const CATEGORY: Record<TokenType, { label: string; tone: Tone }> = {
  INPUT: { label: 'keyword', tone: 'kw' }, OUTPUT: { label: 'keyword', tone: 'kw' }, WIRE: { label: 'keyword', tone: 'kw' },
  IDENT: { label: 'identifier', tone: 'neutral' },
  CONST: { label: 'constant', tone: 'const' },
  NOT: { label: 'operator', tone: 'accent' }, AND: { label: 'operator', tone: 'accent' }, NAND: { label: 'operator', tone: 'accent' },
  OR: { label: 'operator', tone: 'accent' }, NOR: { label: 'operator', tone: 'accent' }, XOR: { label: 'operator', tone: 'accent' },
  XNOR: { label: 'operator', tone: 'accent' },
  ASSIGN: { label: 'punctuation', tone: 'neutral' }, SEMI: { label: 'punctuation', tone: 'neutral' }, COMMA: { label: 'punctuation', tone: 'neutral' },
  LPAREN: { label: 'punctuation', tone: 'neutral' }, RPAREN: { label: 'punctuation', tone: 'neutral' },
  EOF: { label: 'end', tone: 'neutral' },
}

export default function TokensView({ data }: { data: LexResult }) {
  const link = useSourceLink()
  const [q, setQ] = useState('')
  const [showComments, setShowComments] = useState(false)

  const rows = useMemo(() => {
    const toks = data.tokens.map((t, i) => ({ key: `t${i}`, i, type: t.type as string, lexeme: t.lexeme, span: t.span, tone: CATEGORY[t.type].tone, cat: CATEGORY[t.type].label, value: t.value }))
    const coms = showComments
      ? data.comments.map((c, i) => ({ key: `c${i}`, i: -1, type: 'COMMENT', lexeme: c.text, span: c.span, tone: 'neutral' as Tone, cat: 'comment (discarded)', value: undefined }))
      : []
    const all = [...toks, ...coms].sort((a, b) => a.span.start - b.span.start)
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((r) => r.type.toLowerCase().includes(needle) || r.lexeme.toLowerCase().includes(needle) || r.cat.includes(needle)) : all
  }, [data, q, showComments])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const t of data.tokens) if (t.type !== 'EOF') c[CATEGORY[t.type].label] = (c[CATEGORY[t.type].label] ?? 0) + 1
    return c
  }, [data])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
        <Stat label="tokens" value={data.tokens.length - 1} />
        {Object.entries(counts).map(([k, n]) => <Stat key={k} label={k === 'punctuation' ? (n === 1 ? 'punctuation mark' : 'punctuation marks') : k + (n === 1 ? '' : 's')} value={n} />)}
        <Stat label="comments skipped" value={data.comments.length} />
      </div>
      <Section
        className="flex min-h-0 flex-1 flex-col"
        title="Token stream"
        aside={
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={showComments} onChange={(e) => setShowComments(e.target.checked)} />
              Show comments
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tokens" aria-label="Filter tokens"
                className="h-7 w-40 rounded-md border border-line bg-panel-2 pl-7 pr-2 text-[12.5px] outline-none focus:border-accent" />
            </div>
          </>
        }
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className={cn(th, 'w-12 text-right')}>#</th>
                <th className={th}>Type</th>
                <th className={th}>Lexeme</th>
                <th className={th}>Category</th>
                <th className={cn(th, 'text-right')}>Line:Col</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} {...linkProps(link, r.span)} className="cursor-pointer transition-colors hover:bg-accent-soft">
                  <td className={cn(td, 'tabular text-right font-mono text-[11.5px] text-faint')}>{r.i >= 0 ? r.i : ''}</td>
                  <td className={td}><Badge tone={r.tone} className="font-mono">{r.type}</Badge></td>
                  <td className={cn(td, 'max-w-[220px] truncate font-mono', r.type === 'COMMENT' && 'italic text-faint')}>
                    {r.type === 'EOF' ? <span className="text-faint">⟨end of input⟩</span> : r.lexeme}
                    {r.value !== undefined && <span className="ml-2 text-[11px] text-muted">= {r.value}</span>}
                  </td>
                  <td className={cn(td, 'text-[12px] text-muted')}>{r.cat}</td>
                  <td className={cn(td, 'tabular text-right font-mono text-[12px] text-muted')}>{r.span.line}:{r.span.col}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-6 text-center text-[13px] text-muted">No tokens match “{q}”.</div>}
        </div>
      </Section>
    </div>
  )
}
