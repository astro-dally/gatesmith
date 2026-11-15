import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '@/examples'
import { compile } from '@/compiler/pipeline'

describe('bundled examples', () => {
  it('ships at least 10 examples', () => expect(EXAMPLES.length).toBeGreaterThanOrEqual(10))

  for (const ex of EXAMPLES) {
    it(`${ex.name} produces exactly ${ex.expect.length ? ex.expect.join(', ') : 'no diagnostics'}`, () => {
      const r = compile(ex.source)
      expect(r.diagnostics.map((d) => d.code).sort()).toEqual([...ex.expect].sort())
      if (ex.expect.every((c) => c.startsWith('W'))) {
        expect(r.codegen.status).not.toBe('skipped')
        expect(r.codegen.data!.truthTable.equivalence.equivalent).toBe(true)
      } else {
        expect(r.codegen.status).toBe('skipped')
      }
    })
  }
})
