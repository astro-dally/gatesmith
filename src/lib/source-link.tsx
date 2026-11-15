import { createContext, useContext } from 'react'
import type { Span } from '@/compiler/errors'

/** Lets any view link back to the source: hover highlights, click selects. */
export interface SourceLink {
  hover: (span: Span | null) => void
  select: (span: Span) => void
  /** Span of the statement on a given source line (used by IR rows and gates). */
  spanForLine: (line: number) => Span | null
}

export const SourceLinkContext = createContext<SourceLink>({
  hover: () => {},
  select: () => {},
  spanForLine: () => null,
})

export const useSourceLink = () => useContext(SourceLinkContext)

/** Props that wire an element's hover/click to a span. */
export function linkProps(link: SourceLink, span: Span | null | undefined) {
  if (!span) return {}
  return {
    onMouseEnter: () => link.hover(span),
    onMouseLeave: () => link.hover(null),
    onClick: () => link.select(span),
  }
}
