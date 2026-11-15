import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

const SHORTCUTS: [string, string][] = [
  ['Ctrl / ⌘ + Enter', 'Compile now'],
  ['Alt + 1 … 6', 'Open a phase (Lexer … Codegen)'],
  ['Alt + S', 'Toggle step-through mode'],
  ['Alt + ← / →', 'Previous / next phase'],
  ['Alt + P', 'Show or hide the Problems panel'],
  ['Alt + T', 'Toggle light / dark theme'],
  ['Ctrl + wheel', 'Zoom the circuit (drag to pan)'],
  ['Space / Enter', 'Toggle a focused circuit input'],
  ['?', 'Show this list'],
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-[15px] font-semibold">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="mt-1 text-[13px] text-muted">Everything is reachable without a mouse.</DialogDescription>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded-md border border-line-strong bg-panel-2 px-1.5 py-0.5 font-mono text-[12px]">{k}</kbd></dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
