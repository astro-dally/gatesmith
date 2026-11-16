// Writes the bundled examples to JSON for the browser smoke test.
import { writeFileSync } from 'node:fs'
import { EXAMPLES } from '../src/examples'
writeFileSync(process.argv[2] ?? 'examples.json', JSON.stringify(EXAMPLES.map(({ name, expect, source }) => ({ name, expect, source })), null, 2))
