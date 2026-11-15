import {
  BookOpen, Check, Cpu, ChevronDown, Copy, Download, Footprints, Keyboard, Moon, Play, Sun, AlertTriangle, CircuitBoard, Sparkles,
} from 'lucide-react'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Tip } from './ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { EXAMPLES, type Example } from '@/examples'
import type { Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface Props {
  exampleId: string | null
  onExample: (ex: Example) => void
  onCompile: () => void
  live: boolean
  onLive: (v: boolean) => void
  stepMode: boolean
  onStepMode: (v: boolean) => void
  theme: Theme
  onTheme: () => void
  onShortcuts: () => void
  canExportSvg: boolean
  canExportCode: boolean
  onDownloadSvg: () => void
  onCopyVerilog: () => void
  onCopyIR: () => void
  pending: boolean
}

const GROUP_ICON = { 'Basic gates': Cpu, Circuits: CircuitBoard, Optimizer: Sparkles, Errors: AlertTriangle } as const

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-panel-3" />
        <path d="M9 9h7a7 7 0 0 1 0 14H9z" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
        <path d="M4 13h5M4 19h5M23 16h5" stroke="var(--high)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[14px] font-semibold tracking-tight">Gatesmith</div>
        <div className="hidden text-[11px] text-muted sm:block">Logic gate compiler</div>
      </div>
    </div>
  )
}

export function TopBar(p: Props) {
  const current = EXAMPLES.find((e) => e.id === p.exampleId)
  const groups = ['Basic gates', 'Circuits', 'Optimizer', 'Errors'] as const
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel/70 px-4 py-2.5 backdrop-blur-md">
      <Logo />
      <div className="mx-2 hidden h-6 w-px bg-line md:block" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="max-w-[240px]" aria-label="Load an example">
            <BookOpen />
            <span className="truncate">{current ? current.name : 'Examples'}</span>
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          {groups.map((g, gi) => {
            const Icon = GROUP_ICON[g]
            return (
              <div key={g}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="flex items-center gap-1.5"><Icon className="size-3.5" />{g === 'Errors' ? 'Error demos' : g}</DropdownMenuLabel>
                {EXAMPLES.filter((e) => e.group === g).map((ex) => (
                  <DropdownMenuItem key={ex.id} onSelect={() => p.onExample(ex)} className="items-start">
                    <Check className={cn('mt-0.5 shrink-0', ex.id === p.exampleId ? 'opacity-100 text-accent' : 'opacity-0')} />
                    <div className="min-w-0">
                      <div className="truncate">{ex.name}</div>
                      <div className="truncate text-[11.5px] text-muted">{ex.blurb}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tip label="Compile now" shortcut="Ctrl+Enter">
        <Button variant="primary" onClick={p.onCompile}>
          <Play className={cn(p.pending && 'animate-pulse')} />
          Compile
        </Button>
      </Tip>

      <Tip label="Recompile as you type (debounced)">
        <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-muted hover:text-fg">
          <Switch checked={p.live} onCheckedChange={p.onLive} aria-label="Live compile" />
          Live
        </label>
      </Tip>

      <Tip label="Walk through the pipeline one phase at a time" shortcut="Alt+S">
        <Button variant={p.stepMode ? 'primary' : 'ghost'} onClick={() => p.onStepMode(!p.stepMode)} aria-pressed={p.stepMode}>
          <Footprints />
          <span className="hidden sm:inline">Step through</span>
        </Button>
      </Tip>

      <div className="ml-auto flex items-center gap-1">
        <Tip label="Download circuit as SVG">
          <Button variant="ghost" size="icon" onClick={p.onDownloadSvg} disabled={!p.canExportSvg} aria-label="Download circuit as SVG">
            <Download />
          </Button>
        </Tip>
        <Tip label="Copy Verilog">
          <Button variant="ghost" size="sm" className="h-8" onClick={p.onCopyVerilog} disabled={!p.canExportCode} aria-label="Copy Verilog">
            <Copy /> <span className="hidden lg:inline">Verilog</span>
          </Button>
        </Tip>
        <Tip label="Copy optimised three-address code">
          <Button variant="ghost" size="sm" className="h-8" onClick={p.onCopyIR} disabled={!p.canExportCode} aria-label="Copy IR">
            <Copy /> <span className="hidden lg:inline">IR</span>
          </Button>
        </Tip>
        <div className="mx-1 h-5 w-px bg-line" />
        <Tip label="Keyboard shortcuts" shortcut="?">
          <Button variant="ghost" size="icon" onClick={p.onShortcuts} aria-label="Keyboard shortcuts">
            <Keyboard />
          </Button>
        </Tip>
        <Tip label={p.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} shortcut="Alt+T">
          <Button variant="ghost" size="icon" onClick={p.onTheme} aria-label="Toggle theme">
            {p.theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </Tip>
      </div>
    </header>
  )
}
