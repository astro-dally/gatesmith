import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'

import { ToastContext } from './toast-context'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const [id, setId] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    setId((n) => n + 1)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 1800)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center">
        <AnimatePresence>
          {message && (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 rounded-lg border border-line-strong bg-panel px-3 py-2 text-[13px] shadow-soft"
            >
              <CheckCircle2 className="size-4 text-high" />
              {message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
