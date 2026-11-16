"""Assembles GUIDE.md from docs/GUIDE.template.md, generated data and live test counts,
then renders GUIDE.pdf (pandoc → HTML → wkhtmltopdf).
Run after: npx vite-node scripts/gen-guide-data.ts"""
import json, re, subprocess, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / 'docs/GUIDE.template.md').read_text()

res = subprocess.run(['npx', 'vitest', 'run', '--reporter=json', '--outputFile=/tmp/vitest.json'], cwd=root, capture_output=True, text=True)
data = json.loads(pathlib.Path('/tmp/vitest.json').read_text())
counts = {pathlib.Path(f['name']).name.split('.')[0]: len(f['assertionResults']) for f in data['testResults']}
counts['total'] = data['numTotalTests']
assert data['numFailedTests'] == 0, 'tests failing'

def sub(m):
    key = m.group(1)
    if key == 'mermaid': return (root / 'docs/pipeline.mmd').read_text().strip()
    if key.startswith('t-'): return str(counts[key[2:]])
    return (root / f'docs/generated/{key}.md').read_text().strip()
guide = re.sub(r'\{\{([\w-]+)\}\}', sub, tpl)
assert '{{' not in guide
(root / 'GUIDE.md').write_text(guide)
print('GUIDE.md written', len(guide.split()), 'words; tests', counts)

# PDF: swap the Mermaid block for the pre-rendered PNG.
pdf_md = re.sub(r'```mermaid\n.*?```', '![Pipeline architecture](docs/pipeline.png){width=62%}', guide, flags=re.S)
# Give the wide edge-case table its own column widths.
pdf_md = pdf_md.replace('## 6. Edge cases handled\n', '## 6. Edge cases handled\n\n<div class="edge">\n', 1)
pdf_md = pdf_md.replace('\nAdditional robustness:', '\n</div>\n\nAdditional robustness:', 1)
(root / 'docs/.guide-pdf.md').write_text(pdf_md)
css = (root / 'docs/guide.css')
subprocess.run(['pandoc', 'docs/.guide-pdf.md', '-f', 'gfm+attributes', '-t', 'html5', '-s', '--metadata', 'title=Gatesmith: Project Report',
                '--css', str(css), '--embed-resources', '--resource-path', str(root), '-o', 'docs/.guide.html'], cwd=root, check=True)
html = (root / 'docs/.guide.html').read_text()
html = html.replace('<header id="title-block-header">', '<header id="title-block-header" style="display:none">')
(root / 'docs/.guide.html').write_text(html)
subprocess.run(['wkhtmltopdf', '--quiet', '--enable-local-file-access', '-s', 'A4', '-T', '16mm', '-B', '16mm', '-L', '14mm', '-R', '14mm',
                '--footer-center', '[page] / [topage]', '--footer-font-size', '8', '--footer-font-name', 'Helvetica',
                'docs/.guide.html', 'GUIDE.pdf'], cwd=root, check=True)
for f in ['docs/.guide-pdf.md', 'docs/.guide.html']: (root / f).unlink()
print('GUIDE.pdf written')
