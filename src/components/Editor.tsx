import { useEffect, useRef } from 'react'
import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate,
  drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { lintGutter, setDiagnostics, type Diagnostic as CMDiagnostic } from '@codemirror/lint'
import { lex, type TokenType } from '@/compiler/lexer'
import type { Diagnostic, Span } from '@/compiler/errors'

const CLASS_FOR: Partial<Record<TokenType, string>> = {
  INPUT: 'tok-kw', OUTPUT: 'tok-kw', WIRE: 'tok-kw',
  AND: 'tok-op', OR: 'tok-op', NOT: 'tok-op', XOR: 'tok-op', NAND: 'tok-op', NOR: 'tok-op', XNOR: 'tok-op',
  CONST: 'tok-const',
  SEMI: 'tok-punct', COMMA: 'tok-punct', LPAREN: 'tok-punct', RPAREN: 'tok-punct', ASSIGN: 'tok-punct',
}

/** Syntax highlighting powered by the compiler's own lexer: the editor and compiler can never disagree. */
/** Editor chrome driven by the app's CSS variables, so it follows the light/dark theme. */
const chrome = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--fg)' },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid var(--border)', color: 'var(--faint)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
  '.cm-placeholder': { color: 'var(--faint)' },
})

const lexerHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = build(view) }
    update(u: ViewUpdate) { if (u.docChanged) this.decorations = build(u.view) }
  },
  { decorations: (v) => v.decorations },
)

function build(view: EditorView): DecorationSet {
  const src = view.state.doc.toString()
  const { tokens, comments } = lex(src)
  const marks: { from: number; to: number; cls: string }[] = []
  for (const t of tokens) {
    const cls = CLASS_FOR[t.type]
    if (cls && t.span.end > t.span.start) marks.push({ from: t.span.start, to: t.span.end, cls })
  }
  for (const c of comments) marks.push({ from: c.span.start, to: c.span.end, cls: 'tok-comment' })
  marks.sort((a, b) => a.from - b.from)
  const b = new RangeSetBuilder<Decoration>()
  for (const m of marks) b.add(m.from, m.to, Decoration.mark({ class: m.cls }))
  return b.finish()
}

/** A decoration for the span currently hovered in a phase view. */
const setHighlight = StateEffect.define<{ from: number; to: number } | null>()
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        deco = e.value && e.value.to > e.value.from
          ? Decoration.set([Decoration.mark({ class: 'cm-src-highlight' }).range(e.value.from, e.value.to)])
          : Decoration.none
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

export interface EditorProps {
  /** Initial document. */
  value: string
  /** Text to load into the editor, replacing its contents, whenever `version` changes. */
  load: { text: string; version: number } | null
  onChange: (value: string) => void
  onCompile: () => void
  diagnostics: Diagnostic[]
  highlight: Span | null
  /** Changing `nonce` re-applies the selection even for the same span. */
  selection: { span: Span; nonce: number } | null
}

export function Editor({ value, load, onChange, onCompile, diagnostics, highlight, selection }: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const callbacks = useRef({ onChange, onCompile })

  useEffect(() => {
    callbacks.current = { onChange, onCompile }
  }, [onChange, onCompile])

  // Create the editor once.
  useEffect(() => {
    if (!host.current) return
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      lintGutter(),
      chrome,
      lexerHighlight,
      highlightField,
      placeholder('// Describe a circuit, e.g.\ninput a, b;\noutput y;\ny = a AND b;'),
      keymap.of([
        { key: 'Mod-Enter', run: () => { callbacks.current.onCompile(); return true }, preventDefault: true },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
      }),
      EditorView.contentAttributes.of({ 'aria-label': 'Source code editor', spellcheck: 'false' }),
    ]
    const v = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current })
    view.current = v
    return () => { v.destroy(); view.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the initial value only seeds the editor
  }, [])

  // Replace the document only on explicit loads (a new `load.version`).
  // The editor is deliberately *uncontrolled* while typing: pushing every React
  // echo back into it could revert keystrokes that React has not rendered yet.
  useEffect(() => {
    const v = view.current
    if (!v || !load || v.state.doc.toString() === load.text) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: load.text } })
  }, [load])

  // Diagnostics → underline markers and gutter icons.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const len = v.state.doc.length
    const cm: CMDiagnostic[] = diagnostics.map((d) => {
      let from = Math.min(Math.max(0, d.span.start), len)
      let to = Math.min(Math.max(from, d.span.end), len)
      if (to === from) {
        // Zero-width (e.g. at EOF): widen to one visible character.
        if (to < len) to++
        else if (from > 0) from--
      }
      return {
        from, to,
        severity: d.severity,
        source: d.code,
        message: d.suggestion ? `${d.message}\n💡 ${d.suggestion}` : d.message,
      }
    })
    v.dispatch(setDiagnostics(v.state, cm))
  }, [diagnostics])

  // Hover highlight from phase views.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const len = v.state.doc.length
    const effect = highlight
      ? setHighlight.of({ from: Math.min(highlight.start, len), to: Math.min(highlight.end, len) })
      : setHighlight.of(null)
    v.dispatch({
      effects: highlight
        ? [effect, EditorView.scrollIntoView(Math.min(highlight.start, len), { y: 'nearest' })]
        : [effect],
    })
  }, [highlight])

  // Click-to-select from phase views and the Problems panel.
  useEffect(() => {
    const v = view.current
    if (!v || !selection) return
    const len = v.state.doc.length
    const from = Math.min(selection.span.start, len)
    const to = Math.min(Math.max(selection.span.end, from), len)
    v.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) })
    v.focus()
  }, [selection])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
