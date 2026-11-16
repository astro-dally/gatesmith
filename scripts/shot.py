import sys, asyncio
from playwright.async_api import async_playwright
async def main(url, out, w=1440, h=900, theme='dark', actions=''):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1243/chrome-linux64/chrome')
        pg = await b.new_page(viewport={'width': w, 'height': h})
        await pg.add_init_script(f"localStorage.setItem('gatesmith-theme', '{theme}')")
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(url); await pg.wait_for_timeout(1200)
        for a in [x for x in actions.split(';') if x]:
            kind, _, arg = a.partition(':')
            if kind == 'click': await pg.click(arg)
            elif kind == 'key': await pg.keyboard.press(arg)
            elif kind == 'wait': await pg.wait_for_timeout(int(arg))
            elif kind == 'hover': await pg.hover(arg)
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=out)
        print('ERRORS:', errs)
        await b.close()
a = sys.argv
asyncio.run(main(a[1], a[2], int(a[3]), int(a[4]), a[5], a[6] if len(a) > 6 else ''))
