import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { FileCode2 } from 'lucide-react'
import { compile, type CompileResult } from '@/compiler/pipeline'
import type { Diagnostic, PhaseName, Span } from '@/compiler/errors'
import { DEFAULT_EXAMPLE, EXAMPLES, type Example } from '@/examples'
import { TopBar } from '@/components/TopBar'
import { Editor } from '@/components/Editor'
import { PipelineStepper } from '@/components/PipelineStepper'
import { PhasePanel } from '@/components/PhasePanel'
import { ProblemsPanel } from '@/components/ProblemsPanel'
import { StepThrough } from '@/components/StepThrough'
import { ShortcutsDialog } from '@/components/ShortcutsDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SourceLinkContext, type SourceLink } from '@/lib/source-link'
import { ToastProvider } from '@/lib/toast'
import { useToast } from '@/lib/toast-context'
import { useTheme } from '@/lib/theme'
import { PHASE_META, phaseIndex } from '@/lib/phases'
import { copyText, downloadText } from '@/lib/utils'

const LIVE_DELAY = 220

/** Where to look first after a compile: the first phase with errors, else the outputs. */
function bestPhase(r: CompileResult): PhaseName {
  return PHASE_META.find((m) => r[m.id].status === 'error')?.id ?? 'codegen'
}

function Workbench() {
  const toast = useToast()
  const [theme, toggleTheme] = useTheme()
  const [source, setSource] = useState(DEFAULT_EXAMPLE.source)
  const [exampleId, setExampleId] = useState<string | null>(DEFAULT_EXAMPLE.id)
  const [result, setResult] = useState<CompileResult>(() => compile(DEFAULT_EXAMPLE.source))
  const [phase, setPhase] = useState<PhaseName>('codegen')
  const [live, setLive] = useState(true)
  const [pending, setPending] = useState(false)
  const [stepMode, setStepMode] = useState(false)
  const [problemsOpen, setProblemsOpen] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [hover, setHover] = useState<Span | null>(null)
  const [selection, setSelection] = useState<{ span: Span; nonce: number } | null>(null)
  const sourceRef = useRef(source)
  const [load, setLoad] = useState<{ text: string; version: number } | null>(null)

  const runCompile = useCallback((src: string, focusBest = false) => {
    const r = compile(src)
    setResult(r)
    setPending(false)
    if (focusBest) setPhase(bestPhase(r))
    return r
  }, [])

  // CodeMirror owns the text, so mirroring it into React is non-urgent: a
  // transition keeps bursts of keystrokes from queueing a chain of synchronous
  // re-renders (which React would otherwise abort as an update loop).
  const onChange = useCallback((v: string) => {
    sourceRef.current = v
    startTransition(() => {
      setSource(v)
      setExampleId((id) => (id && EXAMPLES.find((e) => e.id === id)?.source === v ? id : null))
    })
  }, [])

  // Live compile, debounced. It reads the ref, like "Compile now" does, so a
  // late timer can never overwrite a newer result with older text.
  useEffect(() => {
    if (!live || sourceRef.current === result.source) return
    setPending(true)
    const t = setTimeout(() => {
      if (sourceRef.current !== result.source) runCompile(sourceRef.current)
      else setPending(false)
    }, LIVE_DELAY)
    return () => clearTimeout(t)
  }, [source, live, result.source, runCompile])

  const compileNow = useCallback(() => {
    const r = runCompile(sourceRef.current, true)
    toast(r.ok ? `Compiled in ${r.totalMs.toFixed(1)} ms` : `${r.diagnostics.filter((d) => d.severity === 'error').length} error(s) found`)
  }, [runCompile, toast])

  const loadExample = useCallback((ex: Example) => {
    sourceRef.current = ex.source
    setSource(ex.source)
    setLoad((l) => ({ text: ex.source, version: (l?.version ?? 0) + 1 }))
    setExampleId(ex.id)
    const r = runCompile(ex.source, true)
    if (!r.ok) setProblemsOpen(true)
    if (stepMode) setPhase('lexer')
  }, [runCompile, stepMode])

  const jump = useCallback((d: Diagnostic) => {
    setSelection({ span: d.span, nonce: Date.now() })
  }, [])

  // Statement span by source line, so IR rows and gates can point back at source.
  const lineSpans = useMemo(() => {
    const m = new Map<number, Span>()
    for (const s of result.parser.data?.program.body ?? []) if (!m.has(s.span.line)) m.set(s.span.line, s.span)
    return m
  }, [result])

  const link: SourceLink = useMemo(() => ({
    hover: setHover,
    select: (span) => setSelection({ span, nonce: Date.now() }),
    spanForLine: (line) => lineSpans.get(line) ?? null,
  }), [lineSpans])

  const irFitKey = useMemo(() => result.ir.data?.netlist.nodes.map((n) => n.id).join('|') ?? '', [result])
  const circuitFitKey = useMemo(() => result.optimizer.data?.netlist.nodes.map((n) => n.id).join('|') ?? '', [result])

  const enterStepMode = useCallback((on: boolean) => {
    setStepMode(on)
    if (on) setPhase('lexer')
  }, [])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.closest?.('.cm-editor, input, textarea, select')
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const digit = /^Digit([1-6])$/.exec(e.code)
        if (digit) { e.preventDefault(); setPhase(PHASE_META[Number(digit[1]) - 1].id); return }
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          e.preventDefault()
          setPhase((p) => PHASE_META[Math.max(0, Math.min(5, phaseIndex(p) + (e.code === 'ArrowRight' ? 1 : -1)))].id)
          return
        }
        if (e.code === 'KeyS') { e.preventDefault(); enterStepMode(!stepMode); return }
        if (e.code === 'KeyP') { e.preventDefault(); setProblemsOpen((o) => !o); return }
        if (e.code === 'KeyT') { e.preventDefault(); toggleTheme(); return }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !typing) { e.preventDefault(); compileNow(); return }
      if (e.key === '?' && !typing) { e.preventDefault(); setShortcutsOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compileNow, enterStepMode, stepMode, toggleTheme])

  const cg = result.codegen.data
  const exportSvg = () => {
    if (!cg?.svg) return
    downloadText('circuit.svg', cg.svg, 'image/svg+xml')
    toast('Downloaded circuit.svg')
  }
  const copyVerilog = async () => { if (cg && (await copyText(cg.verilog))) toast('Verilog copied') }
  const copyIR = async () => {
    const o = result.optimizer.data
    if (o && (await copyText(o.text))) toast('Optimised IR copied')
  }

  const lines = source.split('\n').length
  const errorCount = result.diagnostics.filter((d) => d.severity === 'error').length

  return (
    <SourceLinkContext.Provider value={link}>
      <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
        <TopBar
          exampleId={exampleId} onExample={loadExample} onCompile={compileNow}
          live={live} onLive={setLive} stepMode={stepMode} onStepMode={enterStepMode}
          theme={theme} onTheme={toggleTheme} onShortcuts={() => setShortcutsOpen(true)}
          canExportSvg={!!cg?.svg} canExportCode={!!cg}
          onDownloadSvg={exportSvg} onCopyVerilog={copyVerilog} onCopyIR={copyIR}
          pending={pending}
        />

        <main className="grid grid-cols-1 gap-3 p-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(360px,40%)_minmax(0,1fr)] lg:overflow-hidden">
          {/* Editor */}
          <section className="panel flex h-[46vh] min-h-[280px] flex-col lg:h-auto" aria-label="Source editor">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3.5">
              <FileCode2 className="size-4 text-muted" />
              <span className="font-mono text-[12.5px]">{exampleId ? `${exampleId}.lgd` : 'untitled.lgd'}</span>
              <span className="ml-auto text-[12px] text-muted">
                {lines} line{lines === 1 ? '' : 's'} · {pending ? 'compiling…' : errorCount ? <span className="text-err">{errorCount} error{errorCount > 1 ? 's' : ''}</span> : <span className="text-high">compiled</span>}
              </span>
            </header>
            <div className="min-h-0 flex-1">
              <Editor value={DEFAULT_EXAMPLE.source} load={load} onChange={onChange} onCompile={compileNow} diagnostics={result.diagnostics} highlight={hover} selection={selection} />
            </div>
          </section>

          {/* Pipeline */}
          <div className="flex min-h-[70vh] min-w-0 flex-col gap-3 lg:min-h-0">
            <AnimatePresence>
              {stepMode && <StepThrough result={result} phase={phase} onPhase={setPhase} onClose={() => setStepMode(false)} />}
            </AnimatePresence>
            <div className="panel shrink-0 px-2 pb-2.5 pt-3">
              <PipelineStepper result={result} selected={phase} onSelect={setPhase} pending={pending} />
            </div>
            <PhasePanel result={result} phase={phase} onJump={jump} onPhase={setPhase} irFitKey={irFitKey} circuitFitKey={circuitFitKey} />
          </div>
        </main>

        <div className="shrink-0 px-3 pb-3">
          <ProblemsPanel
            diagnostics={result.diagnostics}
            open={problemsOpen}
            onToggle={() => setProblemsOpen((o) => !o)}
            onJump={jump}
            onHover={(d) => setHover(d ? d.span : null)}
          />
        </div>
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </SourceLinkContext.Provider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <TooltipProvider>
        <Workbench />
      </TooltipProvider>
    </ToastProvider>
  )
}
