"""Scarica da OpenStreetMap gommisti e officine d'Italia, a riquadri di 1 grado.

Uscita: data/raw/osm_officine.json (elenco grezzo, poi elaborato da build_data.py).
Dati OpenStreetMap, licenza ODbL: citare "© OpenStreetMap contributors".
Ogni riquadro scaricato resta in data/raw/osm/: rilanciando, si riprende da dove si era fermi.
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "osm_officine.json"
CACHE = ROOT / "data" / "raw" / "osm"
# Istanze pubbliche aperte a tutti (overpass.openstreetmap.fr è riservata a usi autorizzati)
SERVER = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


def query(bbox: str) -> str:
    return f"""[out:json][timeout:180][bbox:{bbox}];
(
  nwr["shop"="tyres"];
  nwr["shop"="car_repair"];
  nwr["craft"="tyres"];
);
out center tags;"""


def riquadri() -> list[str]:
    """Riquadri di 1 grado che toccano almeno una provincia italiana."""
    prov = json.loads((ROOT / "public" / "data" / "province.json").read_text(encoding="utf-8"))
    out = []
    for lat in range(35, 48):
        for lon in range(6, 19):
            if any(p["bbox"][1] < lat + 1 and p["bbox"][3] > lat and p["bbox"][0] < lon + 1 and p["bbox"][2] > lon for p in prov):
                out.append(f"{lat},{lon},{lat + 1},{lon + 1}")
    return out


def scarica(bbox: str) -> list:
    cache = CACHE / f"{bbox.replace(',', '_')}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    for tentativo in range(8):
        url = SERVER[tentativo % len(SERVER)]
        try:
            req = urllib.request.Request(
                f"{url}?{urllib.parse.urlencode({'data': query(bbox)})}",
                headers={"User-Agent": "customer-map-potential/1.0 (uso interno)"},
            )
            with urllib.request.urlopen(req, timeout=240) as r:
                corpo = json.loads(r.read())
            if corpo.get("remark") and "error" in corpo["remark"].lower():
                raise RuntimeError(corpo["remark"])
            CACHE.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(corpo["elements"]), encoding="utf-8")
            return corpo["elements"]
        except Exception as e:  # noqa: BLE001
            print(f"  {bbox}: tentativo {tentativo + 1} su {url.split('/')[2]} fallito ({str(e)[:80]})", flush=True)
            time.sleep(8 + tentativo * 8)
    raise SystemExit(f"Impossibile scaricare il riquadro {bbox}: rilancia lo script per riprendere")


def main():
    tutti = {}
    elenco = riquadri()
    for i, bbox in enumerate(elenco, 1):
        el = scarica(bbox)
        for e in el:
            tutti[f"{e['type']}/{e['id']}"] = e
        print(f"{i}/{len(elenco)} {bbox}: {len(el)}", flush=True)
        time.sleep(1)  # cortesia verso il server pubblico
    OUT.write_text(json.dumps(list(tutti.values()), ensure_ascii=False), encoding="utf-8")
    print(f"Totale: {len(tutti)} in {OUT}")


if __name__ == "__main__":
    main()
