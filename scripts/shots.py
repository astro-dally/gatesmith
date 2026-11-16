"""Batch screenshots: python3 scripts/shots.py <base_url> <outdir> <scenario>..."""
import sys, asyncio, json
from playwright.async_api import async_playwright
CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'

async def load_example(pg, name):
    await pg.get_by_role('button', name='Load an example').click()
    await pg.get_by_role('menuitem').filter(has_text=name).first.click()
    await pg.wait_for_timeout(500)

async def run(pg, steps):
    for st in steps:
        k, v = st[0], st[1] if len(st) > 1 else None
        if k == 'example': await load_example(pg, v)
        elif k == 'phase': await pg.get_by_role('navigation', name='Compiler phases').get_by_role('button').filter(has_text=v).click(); await pg.wait_for_timeout(450)
        elif k == 'click': await pg.click(v); await pg.wait_for_timeout(300)
        elif k == 'text': await pg.get_by_text(v, exact=True).first.click(); await pg.wait_for_timeout(300)
        elif k == 'hover': await pg.hover(v); await pg.wait_for_timeout(300)
        elif k == 'key': await pg.keyboard.press(v); await pg.wait_for_timeout(350)
        elif k == 'wait': await pg.wait_for_timeout(int(v))
        elif k == 'type':
            await pg.click('.cm-content'); await pg.keyboard.press('Control+a'); await pg.keyboard.type(v); await pg.wait_for_timeout(600)

async def main(base, outdir, scenarios):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        for sc in scenarios:
            name, w, h, theme, steps = sc['name'], sc.get('w', 1440), sc.get('h', 900), sc.get('theme', 'dark'), sc.get('steps', [])
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=sc.get('dpr', 1))
            await pg.add_init_script(f"localStorage.setItem('gatesmith-theme', '{theme}')")
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.goto(base); await pg.wait_for_timeout(900)
            try:
                await run(pg, steps)
            except Exception as e:
                errs.append(f'STEP FAILED: {e}')
            await pg.wait_for_timeout(sc.get('settle', 600))
            await pg.screenshot(path=f'{outdir}/{name}.png')
            print(name, 'errors:', errs)
            await pg.close()
        await b.close()

asyncio.run(main(sys.argv[1], sys.argv[2], json.loads(open(sys.argv[3]).read())))
