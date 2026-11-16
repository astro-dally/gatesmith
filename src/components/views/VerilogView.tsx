import { Copy, Download } from 'lucide-react'
import { Button } from '../ui/button'
import { Section } from './common'
import { copyText, downloadText } from '@/lib/utils'
import { useToast } from '@/lib/toast-context'

const KW = /\b(module|endmodule|input|output|wire|assign)\b/g

function highlight(line: string) {
  if (line.trimStart().startsWith('//')) return <span className="italic text-syn-comment">{line}</span>
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(KW)) {
    parts.push(line.slice(last, m.index))
    parts.push(<span key={m.index} className="text-syn-kw">{m[0]}</span>)
    last = m.index! + m[0].length
  }
  parts.push(line.slice(last))
  return parts.map((p, i) => typeof p === 'string'
    ? <span key={`s${i}`}>{p.split(/([~&|^]|1'b[01])/).map((q, j) => /^([~&|^]|1'b[01])$/.test(q) ? <span key={j} className={q.startsWith('1') ? 'text-syn-const' : 'text-syn-op'}>{q}</span> : q)}</span>
    : p)
}

export default function VerilogView({ verilog }: { verilog: string }) {
  const toast = useToast()
  return (
    <Section
      title="Verilog module"
      aside={
        <>
          <Button size="sm" variant="secondary" onClick={async () => { if (await copyText(verilog)) toast('Verilog copied') }}><Copy />Copy</Button>
          <Button size="sm" variant="secondary" onClick={() => { downloadText('circuit.v', verilog); toast('Downloaded circuit.v') }}><Download />circuit.v</Button>
        </>
      }
    >
      <pre className="overflow-auto p-4 font-mono text-[13px] leading-relaxed">
        {verilog.split('\n').map((l, i) => (
          <div key={i} className="flex gap-4">
            <span className="tabular w-6 shrink-0 select-none text-right text-faint">{i + 1}</span>
            <span>{highlight(l)}</span>
          </div>
        ))}
      </pre>
      <footer className="border-t border-line px-3.5 py-2 text-[12px] text-muted">
        Synthesisable, combinational Verilog-2001. Shared gates become internal wires; everything else is inlined.
      </footer>
    </Section>
  )
}
