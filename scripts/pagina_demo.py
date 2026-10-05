"""Trasforma la build demo (dist-demo) in una pagina pubblicabile come artifact su claude.ai.

La piattaforma aggiunge da sola doctype, head e body: la pagina contiene solo titolo,
stili (incorporati) e lo script dell'app, che resta un file accanto alla pagina.
"""
import re
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist-demo"
html = (DIST / "index.html").read_text(encoding="utf-8")

css_href = re.search(r'<link rel="stylesheet"[^>]*href="\./(assets/[^"]+\.css)"', html).group(1)
js_src = re.search(r'<script type="module"[^>]*src="\./(assets/[^"]+\.js)"', html).group(1)
css = (DIST / css_href).read_text(encoding="utf-8")

pagina = f"""<title>Customer Map Potential</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
{css}
</style>
<div id="root"></div>
<script type="module" src="./{js_src}"></script>
"""
(DIST / "pagina.html").write_text(pagina, encoding="utf-8")
print(f"Scritta {DIST / 'pagina.html'} ({len(pagina) // 1024} KB), script {js_src}")

# La piattaforma rifiuta il carattere U+FFFD letterale nei file pubblicati: in ExcelJS
# compare solo dentro stringhe, dove la sequenza di escape è equivalente.
for js in (DIST / "assets").glob("*.js"):
    testo = js.read_text(encoding="utf-8")
    if "�" in testo:
        js.write_text(testo.replace("�", "\\uFFFD"), encoding="utf-8")
        print(f"Sostituito U+FFFD in {js.name}")
