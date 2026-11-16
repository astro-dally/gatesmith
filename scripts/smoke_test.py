"""
Browser smoke test (Playwright, Python).

Usage:
  npm run build
  python3 -m http.server 4173 --directory dist &
  npx vite-node scripts/dump-examples.ts /tmp/examples.json
  python3 scripts/smoke_test.py http://localhost:4173/ /tmp/examples.json

Set CHROME=/path/to/chrome to use a specific browser binary.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
EXAMPLES = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'examples.json'))
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome')

passed, failed = [], []

def check(name, cond, detail=''):
    (passed if cond else failed).append(name if cond else f'{name}: {detail}')

async def status(pg, phase):
    return await pg.get_attribute(f'[data-phase={phase}]', 'data-status')

async def load(pg, name):
    await pg.get_by_role('button', name='Load an example').click()
    await pg.get_by_role('menuitem').filter(has_text=name).first.click()
    await pg.wait_for_timeout(250)

async def main():
    async with async_playwright() as p:
        launch = {'executable_path': CHROME} if os.path.exists(CHROME) else {}
        browser = await p.chromium.launch(**launch)
        pg = await browser.new_page(viewport={'width': 1440, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto(BASE)
        await pg.wait_for_selector('[data-phase=codegen]')

        # 1. Every bundled example compiles to exactly its expected diagnostics.
        for ex in EXAMPLES:
            await load(pg, ex['name'])
            panel = pg.locator('section[aria-label=Problems]')
            n = int(await panel.get_attribute('data-errors')) + int(await panel.get_attribute('data-warnings'))
            check(f"example '{ex['name']}' diagnostics", n == len(ex['expect']), f'got {n}, want {len(ex["expect"])}')
            only_warnings = all(c.startswith('W') for c in ex['expect'])
            cg = await status(pg, 'codegen')
            check(f"example '{ex['name']}' codegen gating", (cg != 'skipped') == only_warnings, f'codegen={cg}')

        # 2. Live evaluation: toggling c on the spec example flips `out` from 1 to 0.
        await load(pg, 'Specification example')
        await pg.click('[data-phase=codegen]')
        out = pg.locator('svg[aria-label^="Circuit diagram"] text').filter(has_text='out').locator('xpath=following-sibling::*[1]')
        before = await out.text_content()
        await pg.click("[aria-label^='Input c ']")
        await pg.wait_for_timeout(900)
        after = await out.text_content()
        check('circuit toggle propagates', (before, after) == ('1', '0'), f'{before} -> {after}')
        rows = await pg.locator('tbody tr').count()
        check('truth table has 8 rows', rows == 8, str(rows))

        # 3. Step-through mode walks phases with Next.
        await pg.keyboard.press('Alt+KeyS')
        await pg.get_by_role('button', name='Next').click()
        txt = await pg.locator('[aria-label="Step-through explanation"]').text_content()
        check('step-through shows step 2', 'Step 2 of 6' in txt, txt[:60])
        await pg.keyboard.press('Alt+KeyS')

        # 4. Typing a syntax error in the editor updates diagnostics live.
        await pg.click('.cm-content')
        await pg.keyboard.press('Control+End')
        await pg.keyboard.type('\nout2 = a AND ;')
        await pg.wait_for_timeout(700)
        check('live compile reports parser error', await status(pg, 'parser') == 'error')
        check('editor shows lint marker', await pg.locator('.cm-lintRange-error').count() > 0)

        # 5. Ctrl+Enter compiles; empty source shows the empty state.
        await pg.keyboard.press('Control+a')
        await pg.keyboard.press('Delete')
        await pg.keyboard.press('Control+Enter')
        await pg.wait_for_timeout(800)
        await pg.click('[data-phase=codegen]')
        check('empty source empty state', await pg.get_by_text('Nothing to generate yet').count() == 1)

        # 6. Above 10 inputs: friendly message instead of a table.
        names = ', '.join(f'i{k}' for k in range(12))
        await pg.click('.cm-content')
        await pg.keyboard.type(f'input {names};\noutput y;\ny = ' + ' XOR '.join(f'i{k}' for k in range(12)) + ';')
        await pg.keyboard.press('Control+Enter')
        await pg.wait_for_timeout(700)
        check('12 inputs: table capped', await pg.get_by_text('12 inputs is too many rows to list').count() == 1)

        # 7. Verilog tab, theme toggle and shortcuts dialog.
        await load(pg, 'Half adder')
        await pg.get_by_role('tab', name='Verilog').click()
        check('verilog rendered', await pg.get_by_text('endmodule').count() >= 1)
        dark_before = await pg.evaluate("document.documentElement.classList.contains('dark')")
        await pg.keyboard.press('Alt+KeyT')
        dark_after = await pg.evaluate("document.documentElement.classList.contains('dark')")
        check('theme toggles', dark_before != dark_after)
        await pg.locator('body').click(position={'x': 5, 'y': 880})
        await pg.keyboard.press('Shift+Slash')
        check('shortcuts dialog opens', await pg.get_by_role('dialog').count() == 1)

        check('no console or page errors', not errors, '; '.join(errors[:3]))
        await browser.close()

    for x in passed: print('  PASS', x)
    for x in failed: print('  FAIL', x)
    print(f'\n{len(passed)} passed, {len(failed)} failed')
    sys.exit(1 if failed else 0)

asyncio.run(main())
