"""Customer Map Potential: app locale.

Avvio:  doppio clic su "Avvia Customer Map.bat" (Windows) oppure  python server.py
Serve l'app su http://localhost:8790 e fa da tramite verso Openapi: il token resta
in impostazioni.txt sul PC e non passa mai dal browser.

Solo libreria standard di Python 3.9+: niente da installare.
"""
from __future__ import annotations

import json
import mimetypes
import socket
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORTA = 8790  # fissa: i dati salvati nel browser sono legati a questo indirizzo
CARTELLA = Path(__file__).resolve().parent
APP = CARTELLA / "app"
IMPOSTAZIONI = CARTELLA / "impostazioni.txt"
INDIRIZZO = f"http://localhost:{PORTA}/"
HOST_AMMESSI = {f"localhost:{PORTA}", f"127.0.0.1:{PORTA}"}
LIMITE_PAGINA = 1000
MAX_RECORD = 5000

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")


def leggi_impostazioni() -> dict[str, str]:
    """File di testo con righe CHIAVE=valore; le righe con # sono commenti."""
    out: dict[str, str] = {}
    if IMPOSTAZIONI.exists():
        for riga in IMPOSTAZIONI.read_text(encoding="utf-8-sig").splitlines():
            riga = riga.strip()
            if riga and not riga.startswith("#") and "=" in riga:
                k, v = riga.split("=", 1)
                out[k.strip()] = v.strip()
    return out


# ---------------- Openapi (stessa logica di server/openapi.ts) ----------------


def leggi_stima(body) -> tuple[float | None, float | None]:
    conteggio = prezzo = None

    def visita(o):
        nonlocal conteggio, prezzo
        if isinstance(o, dict):
            for k, v in o.items():
                key = k.lower()
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    if conteggio is None and any(t in key for t in ("count", "total", "record", "results", "numero")):
                        conteggio = v
                    if prezzo is None and any(t in key for t in ("price", "cost", "prezzo", "amount")):
                        prezzo = v
                elif isinstance(v, (dict, list)):
                    visita(v)
        elif isinstance(o, list):
            for x in o:
                visita(x)

    visita(body.get("data", body) if isinstance(body, dict) else body)
    return conteggio, prezzo


def parametri(r: dict, ateco: str | None) -> dict[str, str]:
    p = {
        "lat": str(r["lat"]),
        "long": str(r["lon"]),
        "radius": str(round(float(r["raggioKm"]) * 1000)),
        "activityStatus": "ATTIVA",
    }
    if ateco:
        p["atecoCode"] = ateco
    if r.get("minDipendenti"):
        p["minEmployees"] = str(int(r["minDipendenti"]))
    if r.get("maxDipendenti"):
        p["maxEmployees"] = str(int(r["maxDipendenti"]))
    return p


def chiama(imp: dict, p: dict) -> dict:
    host = "https://test.company.openapi.com" if imp.get("OPENAPI_SANDBOX") == "1" else "https://company.openapi.com"
    req = urllib.request.Request(
        f"{host}/IT-search?{urllib.parse.urlencode(p)}",
        headers={"Authorization": f"Bearer {imp['OPENAPI_TOKEN']}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        testo = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(testo).get("message") or e.reason
        except ValueError:
            msg = testo[:300] or e.reason
        raise RuntimeError(f"Openapi {e.code}: {msg}") from None


def gestisci(r: dict, imp: dict) -> dict:
    if not imp.get("OPENAPI_TOKEN"):
        return {"demo": True, "messaggio": "Token Openapi non configurato in impostazioni.txt: l'app usa dati dimostrativi."}
    if not (0 < float(r.get("raggioKm", 0)) <= 100):
        raise ValueError("Raggio non valido (da 100 m a 100 km)")
    codici = r.get("ateco") or [None]
    sandbox = imp.get("OPENAPI_SANDBOX") == "1"
    if r.get("azione") == "stima":
        righe = []
        for a in codici:
            p = parametri(r, a)
            p["dryRun"] = "1"
            p["dataEnrichment"] = "advanced"  # stesso dettaglio dell'acquisto: prezzo vero
            body = chiama(imp, p)
            c, pr = leggi_stima(body)
            righe.append({"ateco": a, "conteggio": c, "prezzo": pr, "grezzo": body.get("data")})
        conteggio = sum(x["conteggio"] for x in righe) if all(x["conteggio"] is not None for x in righe) else None
        prezzo = sum(x["prezzo"] for x in righe) if all(x["prezzo"] is not None for x in righe) else None
        return {"demo": False, "sandbox": sandbox, "conteggio": conteggio, "prezzo": prezzo, "righe": righe}

    massimo = min(int(r.get("maxRecord") or MAX_RECORD), 20000)
    aziende: list = []
    for a in codici:
        skip = 0
        while len(aziende) < massimo:
            p = parametri(r, a)
            p["dataEnrichment"] = "advanced"
            p["limit"] = str(min(LIMITE_PAGINA, massimo - len(aziende)))
            if skip:
                p["skip"] = str(skip)
            pagina = chiama(imp, p).get("data") or []
            aziende.extend(pagina)
            if len(pagina) < LIMITE_PAGINA:
                break
            skip += LIMITE_PAGINA
    return {"demo": False, "sandbox": sandbox, "aziende": aziende, "troncato": len(aziende) >= massimo}


# ---------------- server ----------------


class Gestore(BaseHTTPRequestHandler):
    server_version = "CustomerMap/1.0"

    def log_message(self, fmt, *args):  # niente righe di log per ogni file
        pass

    def _host_valido(self) -> bool:
        # blocca pagine di altri siti che provano a usare l'app locale (DNS rebinding)
        return self.headers.get("Host", "") in HOST_AMMESSI

    def _json(self, codice: int, dati: dict):
        corpo = json.dumps(dati, ensure_ascii=False).encode("utf-8")
        self.send_response(codice)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):
        if not self._host_valido():
            return self._json(403, {"errore": "Richiesta non ammessa"})
        percorso = self.path.split("?")[0]
        if percorso != "/api/companies":
            return self._json(404, {"errore": "Non trovato"})
        origine = self.headers.get("Origin")
        if origine and urllib.parse.urlparse(origine).netloc not in HOST_AMMESSI:
            return self._json(403, {"errore": "Richiesta non ammessa"})
        imp = leggi_impostazioni()
        if imp.get("APP_PASSWORD") and self.headers.get("x-app-key") != imp["APP_PASSWORD"]:
            return self._json(401, {"errore": "Password non valida: inseriscila nelle Impostazioni dell'app"})
        try:
            lunghezza = int(self.headers.get("Content-Length") or 0)
            richiesta = json.loads(self.rfile.read(lunghezza) or b"{}")
            self._json(200, gestisci(richiesta, imp))
        except Exception as e:  # noqa: BLE001 - l'errore va mostrato all'utente
            self._json(502, {"errore": str(e)})

    def do_GET(self):
        if not self._host_valido():
            self.send_error(403)
            return
        percorso = urllib.parse.unquote(self.path.split("?")[0])
        file = (APP / percorso.lstrip("/")).resolve()
        if APP.resolve() not in file.parents and file != APP.resolve():
            self.send_error(403)
            return
        if file.is_dir() or not file.exists():
            file = APP / "index.html"  # una sola pagina
        tipo = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        dati = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dati)))
        cache = "no-cache" if file.name == "index.html" else "public, max-age=3600"
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(dati)


def porta_occupata() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", PORTA)) == 0


def main():
    apri = "--senza-browser" not in sys.argv
    if not (APP / "index.html").exists():
        sys.exit(f"Manca la cartella app accanto a {Path(__file__).name}: scarica di nuovo il pacchetto.")
    if porta_occupata():
        print(f"Customer Map Potential è già acceso: apro {INDIRIZZO}")
        if apri:
            webbrowser.open(INDIRIZZO)
        return
    # solo 127.0.0.1: dagli altri PC della rete l'app non si raggiunge
    server = ThreadingHTTPServer(("127.0.0.1", PORTA), Gestore)
    imp = leggi_impostazioni()
    stato = "dimostrativa (nessun token Openapi)" if not imp.get("OPENAPI_TOKEN") else ("Openapi PROVA" if imp.get("OPENAPI_SANDBOX") == "1" else "Openapi REALE")
    print("Customer Map Potential")
    print(f"  Indirizzo: {INDIRIZZO}")
    print(f"  Modalità aziende: {stato}")
    print("  Per chiudere: chiudi questa finestra (o Ctrl+C).")
    if apri:
        threading.Timer(0.8, lambda: webbrowser.open(INDIRIZZO)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
