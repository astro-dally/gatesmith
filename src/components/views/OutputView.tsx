import { useMemo, useState } from 'react'
import { CircuitBoard, FileCode2, RotateCcw } from 'lucide-react'
import type { CompileResult } from '@/compiler/pipeline'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Section, Empty } from './common'
import { CircuitView } from './CircuitView'
import TruthTableView, { FunctionsView } from './TruthTableView'
import VerilogView from './VerilogView'

const zeros = (names: string[]) => Object.fromEntries(names.map((n) => [n, 0 as 0 | 1]))

export default function OutputView({ result, fitKey }: { result: CompileResult; fitKey: string }) {
  const cg = result.codegen.data!
  const opt = result.optimizer.data!
  const table = cg.truthTable
  const names = table.inputs
  const namesKey = names.join(',')

  const [state, setState] = useState(() => ({ key: namesKey, inputs: zeros(names) }))
  if (state.key !== namesKey) setState({ key: namesKey, inputs: zeros(names) }) // new circuit → reset inputs
  const [preview, setPreview] = useState<number | null>(null)

  const fromRow = (row: number) => Object.fromEntries(names.map((n, i) => [n, ((row >> (names.length - 1 - i)) & 1) as 0 | 1]))
  const shown = preview !== null && table.rows ? fromRow(preview) : state.inputs
  const activeRow = names.reduce((acc, n) => (acc << 1) | (state.inputs[n] ?? 0), 0)
  const wireNames = useMemo(() => new Set(opt.after.wires), [opt])

  return (
    <Tabs defaultValue="circuit" className="flex h-full min-h-0 flex-col">
      <TabsList className="mb-3 self-start">
        <TabsTrigger value="circuit"><CircuitBoard />Circuit and truth table</TabsTrigger>
        <TabsTrigger value="verilog"><FileCode2 />Verilog</TabsTrigger>
      </TabsList>
      <TabsContent value="circuit" className="min-h-0 flex-1 space-y-3 overflow-auto pr-0.5 outline-none">
        <Section
          title={<span className="flex items-center gap-2">Circuit <span className="font-normal text-muted">{opt.netlist.gateCount} gate{opt.netlist.gateCount === 1 ? '' : 's'} after optimisation</span></span>}
          aside={
            <>
              {preview !== null && <span className="text-[12px] text-accent">previewing row {preview}</span>}
              <Button size="sm" variant="ghost" onClick={() => setState({ key: namesKey, inputs: zeros(names) })} disabled={names.length === 0}>
                <RotateCcw />Reset inputs
              </Button>
            </>
          }
        >
          <div className="relative h-[clamp(260px,42vh,460px)]">
            {cg.circuit ? (
              <CircuitView
                layout={cg.circuit}
                netlist={opt.netlist}
                inputs={shown}
                onToggle={(n) => { setPreview(null); setState((s) => ({ ...s, inputs: { ...s.inputs, [n]: (s.inputs[n] ? 0 : 1) as 0 | 1 } })) }}
                wireNames={wireNames}
                fitKey={fitKey}
              />
            ) : (
              <Empty icon={<CircuitBoard />} title="Circuit too large to draw">The netlist has {opt.netlist.nodes.length} nodes. Use the Verilog output instead.</Empty>
            )}
          </div>
          <footer className="border-t border-line px-3.5 py-2 text-[12px] text-muted">
            Click an input pad (or focus it and press Space) to toggle it. Scroll with Ctrl to zoom, drag to pan.
          </footer>
        </Section>
        <TruthTableView
          table={table}
          activeRow={activeRow}
          onHoverRow={setPreview}
          onPickRow={(r) => { setPreview(null); setState({ key: namesKey, inputs: fromRow(r) }) }}
        />
        <FunctionsView table={table} />
      </TabsContent>
      <TabsContent value="verilog" className="min-h-0 flex-1 overflow-auto outline-none">
        <VerilogView verilog={cg.verilog} />
      </TabsContent>
    </Tabs>
  )
}
