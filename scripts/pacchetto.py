"""Crea il pacchetto da scaricare: pacchetto/CustomerMapPotential.zip

Uso:  npm run pacchetto   (compila l'app e poi esegue questo script)
"""
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
LOCALE = ROOT / "locale"
OUT = ROOT / "pacchetto"
NOME = "CustomerMapPotential"

if not (DIST / "index.html").exists():
    raise SystemExit("Prima compila l'app: npm run build")

cartella = OUT / NOME
shutil.rmtree(OUT, ignore_errors=True)
cartella.mkdir(parents=True)
shutil.copytree(DIST, cartella / "app")
for nome in ("server.py", "avvia.sh"):
    shutil.copy2(LOCALE / nome, cartella / nome)
# file che si aprono con il Blocco note o con il prompt di Windows: fine riga Windows
for nome in ("Avvia Customer Map.bat", "impostazioni.txt", "LEGGIMI.txt"):
    testo = (LOCALE / nome).read_text(encoding="utf-8").replace("\r\n", "\n")
    (cartella / nome).write_bytes(testo.replace("\n", "\r\n").encode("utf-8"))

zip_path = OUT / f"{NOME}.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in sorted(cartella.rglob("*")):
        if f.is_file():
            info = zipfile.ZipInfo.from_file(f, f.relative_to(OUT).as_posix())
            if f.name == "avvia.sh":
                info.external_attr = 0o755 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, f.read_bytes(), compresslevel=9)
print(f"Pacchetto: {zip_path} ({zip_path.stat().st_size / 1e6:.1f} MB)")
