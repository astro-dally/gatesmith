import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Tip } from './ui/tooltip'
import { cn } from '@/lib/utils'

interface Props {
  width: number
  height: number
  children: ReactNode
  className?: string
  /** Changing this re-fits the view (e.g. a new circuit). */
  fitKey?: string
  label: string
}

/** SVG canvas with wheel-zoom around the cursor, drag-to-pan and fit-to-view. */
export function PanZoom({ width, height, children, className, fitKey, label }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const fit = useCallback(() => {
    const el = box.current
    if (!el) return
    const { clientWidth: w, clientHeight: h } = el
    const k = Math.min(1.6, Math.max(0.2, Math.min((w - 24) / width, (h - 24) / height)))
    setT({ k, x: (w - width * k) / 2, y: (h - height * k) / 2 })
  }, [width, height])

  useEffect(() => { fit() }, [fit, fitKey])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  // Non-passive wheel listener so the page does not scroll while zooming.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return // plain wheel scrolls the page; pinch / Ctrl+wheel zooms
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      setT((p) => {
        const k = Math.min(4, Math.max(0.15, p.k * Math.exp(-e.deltaY * 0.0015)))
        return { k, x: mx - ((mx - p.x) * k) / p.k, y: my - ((my - p.y) * k) / p.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoom = (f: number) => {
    const el = box.current
    if (!el) return
    const mx = el.clientWidth / 2, my = el.clientHeight / 2
    setT((p) => {
      const k = Math.min(4, Math.max(0.15, p.k * f))
      return { k, x: mx - ((mx - p.x) * k) / p.k, y: my - ((my - p.y) * k) / p.k }
    })
  }

  return (
    <div
      ref={box}
      className={cn('board-grid relative h-full w-full touch-none select-none overflow-hidden', className)}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('[data-interactive]')) return
        drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setT((p) => ({ ...p, x: d.tx + e.clientX - d.x, y: d.ty + e.clientY - d.y }))
      }}
      onPointerUp={() => { drag.current = null }}
      style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
    >
      <svg role="img" aria-label={label} className="absolute inset-0 h-full w-full">
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>{children}</g>
      </svg>
      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-line bg-panel/90 p-0.5 shadow-soft backdrop-blur">
        <Tip label="Zoom out" side="top"><Button size="icon-sm" variant="ghost" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out"><Minus /></Button></Tip>
        <span className="tabular w-10 text-center font-mono text-[11px] text-muted">{Math.round(t.k * 100)}%</span>
        <Tip label="Zoom in" side="top"><Button size="icon-sm" variant="ghost" onClick={() => zoom(1.25)} aria-label="Zoom in"><Plus /></Button></Tip>
        <Tip label="Fit to view" side="top"><Button size="icon-sm" variant="ghost" onClick={fit} aria-label="Fit to view"><Maximize2 /></Button></Tip>
      </div>
    </div>
  )
}
