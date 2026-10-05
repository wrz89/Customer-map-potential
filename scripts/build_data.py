"""Costruisce i dati statici dell'app in public/data.

Fonti, tutte pubbliche e gratuite:
- Confini comunali ISTAT 1/1/2026 (redistribuiti da openpolis/geojson-italy, CC-BY)
- Popolazione residente 1/1/2026, ISTAT (dataflow 22_289_DF_DASH_DCIS_POPRES1_1)
- Unità locali e addetti 2023 per comune, divisione ATECO e classe di addetti,
  ISTAT registro ASIA-UL (dataflow 183_1163_DF_DICA_ASIAULP_TERRIFDATA_7)
- Parco veicolare per comune al 31/12/2024, ISTAT su dati ACI-PRA
  (dataflow 41_993_DCIS_VEICOLIPRA_COM_1)
- Unità locali ATECO 45.2 (manutenzione e riparazione autoveicoli) per comune, ISTAT
  (dataflow 183_1163_DF_DICA_ASIAULP_TERRIFDATA_3)

Uso:  python scripts/build_data.py            (scarica ciò che manca in data/raw)
      python scripts/build_data.py --offline  (usa solo i file già in data/raw)
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"

ISTAT = "https://esploradati.istat.it/SDMXWS/rest"
CSV_ACCEPT = "application/vnd.sdmx.data+csv;version=1.0.0"
SOURCES = {
    "comuni.geojson": (
        "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson",
        None,
    ),
    "popolazione.csv": (
        f"{ISTAT}/data/IT1,22_289_DF_DASH_DCIS_POPRES1_1,1.0/A..JAN.9.TOTAL.99?startPeriod=2026&endPeriod=2026",
        CSV_ACCEPT,
    ),
    "unita_locali.csv": (
        f"{ISTAT}/data/IT1,183_1163_DF_DICA_ASIAULP_TERRIFDATA_7,1.0/A....?startPeriod=2023&endPeriod=2023",
        CSV_ACCEPT,
    ),
    "veicoli.csv": (
        f"{ISTAT}/data/41_993_DCIS_VEICOLIPRA_COM_1/A..VEHICFLEET.?startPeriod=2024&endPeriod=2024",
        CSV_ACCEPT,
    ),
    "officine.csv": (
        f"{ISTAT}/data/IT1,183_1163_DF_DICA_ASIAULP_TERRIFDATA_3,1.0/A..LU.452.?startPeriod=2023&endPeriod=2023",
        CSV_ACCEPT,
    ),
    "territori_it.json": (
        f"{ISTAT}/codelist/IT1/CL_ITTER107",
        "application/vnd.sdmx.structure+json;version=1.0",
    ),
    "ateco_it.json": (
        f"{ISTAT}/codelist/IT1/CL_ATECO_2007",
        "application/vnd.sdmx.structure+json;version=1.0",
    ),
}
SIZE_CLASSES = ["TOTAL", "W0_9", "W10_49", "W50_249", "W_GE250"]
SIMPLIFY_DEG = 0.0006  # circa 50 m: bordi leggibili, file piccoli
GEOD = Geod(ellps="WGS84")


def download(name: str, offline: bool) -> Path:
    path = RAW / name
    if path.exists() and path.stat().st_size > 0:
        return path
    if offline:
        sys.exit(f"Manca {path} e --offline è attivo")
    url, accept = SOURCES[name]
    print(f"Scarico {name} ...", flush=True)
    req = urllib.request.Request(url, headers={"Accept": accept or "*/*", "Accept-Language": "it"})
    RAW.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req, timeout=3600) as r, open(path, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    return path


def r4(x: float) -> float:
    return round(x, 4)


def round_coords(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], 5), round(obj[1], 5)]
        return [round_coords(o) for o in obj]
    return obj


def load_population(path: Path) -> dict[str, int]:
    pop = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = row["REF_AREA"]
            if len(code) == 6 and code.isdigit():
                pop[code] = int(float(row["OBS_VALUE"]))
    return pop


# Codici VEHICLE_TYPE ISTAT -> campi dell'app
VEICOLI = {
    "autovetture": ["1"],
    "autocarri": ["10", "8"],  # autocarri merci e motocarri
    "pesanti": ["11", "12"],  # motrici, trattori stradali, rimorchi e semirimorchi
    "motocicli": ["7"],
    "autobus": ["2"],
    "altri": ["9"],
}


def load_vehicles(path: Path) -> dict[str, dict]:
    raw: dict[str, dict[str, float]] = defaultdict(dict)
    anni: dict[str, int] = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = row["REF_AREA"]
            if not (len(code) == 6 and code.isdigit()) or row["OBS_VALUE"] in ("", None):
                continue
            anno = int(row["TIME_PERIOD"])
            if anno < anni.get(code, 0):
                continue
            if anno > anni.get(code, 0):
                anni[code] = anno
                raw[code] = {}
            raw[code][row["VEHICLE_TYPE"]] = float(row["OBS_VALUE"])
    # classi Euro delle autovetture: codici ISTAT 13 (Euro 0) ... 19 (Euro 6)
    return {
        code: {k: int(sum(v.get(t, 0) for t in tipi)) for k, tipi in VEICOLI.items()}
        | {"euro": [int(v.get(str(13 + i), 0)) for i in range(7)], "anno": anni[code]}
        for code, v in raw.items()
    }


def load_workshops(path: Path) -> dict[str, int]:
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = row["REF_AREA"]
            if len(code) == 6 and code.isdigit() and row["PERS_EMPL_SIZE_CLASS"] == "TOTAL" and row["OBS_VALUE"]:
                out[code] = int(float(row["OBS_VALUE"]))
    return out


def load_local_units(path: Path):
    """Ritorna {comune: {ateco: {classe: [unità locali, addetti]}}}"""
    data: dict = defaultdict(lambda: defaultdict(lambda: {c: [0, 0] for c in SIZE_CLASSES}))
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = row["REF_AREA"]
            if not (len(code) == 6 and code.isdigit()):
                continue
            idx = 0 if row["DATA_TYPE"] == "LU" else 1
            val = row["OBS_VALUE"]
            if val in ("", None):
                continue
            data[code][row["ECON_ACTIVITY_NACE_2007"]][row["PERS_EMPL_SIZE_CLASS"]][idx] = round(float(val))
    return data


def ateco_labels(path: Path) -> dict[str, str]:
    codes = json.loads(path.read_text(encoding="utf-8"))["data"]["codelists"][0]["codes"]
    return {c["id"]: (c.get("name") or "").strip() for c in codes}


# Reti di centri pneumatici e officine riconosciute dal nome o dal marchio in OpenStreetMap.
# Il gruppo è indicato solo dove l'appartenenza è certa.
RETI = [
    ("SuperService", "Goodyear", r"super\s*-?\s*service"),
    ("Driver Center", "Pirelli", r"\bdriver\s*-?\s*cent(er|re)\b|\bpirelli\b"),
    ("First Stop", "Bridgestone", r"first\s*-?\s*stop"),
    ("Euromaster", "Michelin", r"euromaster"),
    ("BestDrive", "Continental", r"best\s*-?\s*drive"),
    ("Point S", "", r"\bpoint\s*-?\s*s\b"),
    ("Vulco", "", r"\bvulco\b"),
    ("Vianor", "", r"\bvianor\b"),
    ("Bosch Car Service", "Bosch", r"bosch\s*car"),
    ("Speedy", "", r"\bspeedy\b"),
    ("Norauto", "", r"\bnorauto\b"),
    ("Midas", "", r"\bmidas\b"),
    ("Eurorepar", "", r"euro\s*-?\s*repar"),
]
PAROLE_GOMME = re.compile(r"gomm|pneumat|tyre|\btire|gommist", re.I)


def classifica_officina(tags: dict) -> tuple[str, str, str]:
    """Ritorna (tipo, rete, gruppo): tipo 'g' gommista, 'o' altra officina."""
    testo = " ".join(tags.get(k, "") for k in ("brand", "name", "operator", "network"))
    rete = gruppo = ""
    for nome, gr, regex in RETI:
        if re.search(regex, testo, re.I):
            rete, gruppo = nome, gr
            break
    gommista = (
        tags.get("shop") == "tyres"
        or tags.get("craft") == "tyres"
        or tags.get("service:tyres") == "yes"
        or bool(PAROLE_GOMME.search(testo))
    )
    return ("g" if gommista else "o"), rete, gruppo


def officine_osm(path: Path, geo_feats: list) -> dict[int, list]:
    """Assegna ogni officina OSM alla provincia del comune in cui cade."""
    if not path.exists():
        print("ATTENZIONE: officine OSM assenti (scripts/scarica_officine_osm.py), niente concorrenza")
        return {}
    from shapely import STRtree
    from shapely.geometry import Point

    geoms = [shape(f["geometry"]) for f in geo_feats]
    prov = [int(f["properties"]["prov_istat_code_num"]) for f in geo_feats]
    albero = STRtree(geoms)
    out: dict[int, list] = defaultdict(list)
    for e in json.loads(path.read_text(encoding="utf-8")):
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lon = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = e.get("tags", {})
        pt = Point(lon, lat)
        dentro = [i for i in albero.query(pt) if geoms[i].contains(pt)]
        if not dentro:
            continue
        tipo, rete, gruppo = classifica_officina(tags)
        nome = tags.get("name") or tags.get("brand") or ""
        out[prov[dentro[0]]].append([round(lat, 5), round(lon, 5), tipo, rete, gruppo, nome])
    return out


def norm_nome(s: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFD", s.split("/")[0]).encode("ascii", "ignore").decode().upper()
    return "".join(ch for ch in s if ch.isalnum())


def alias_codici(geo_codes: dict[str, str], data_codes: set[str], territori: Path) -> dict[str, str]:
    """Collega i comuni dei confini 2026 ai codici usati nei dati ISTAT quando
    differiscono (riforma delle province sarde del 2026: stessi comuni, codici nuovi).
    Abbina per nome, solo tra codici che non trovano corrispondenza diretta."""
    codes = json.loads(territori.read_text(encoding="utf-8"))["data"]["codelists"][0]["codes"]
    orfani = {}
    for c in codes:
        cid = c["id"]
        if len(cid) == 6 and cid.isdigit() and cid in data_codes and cid not in geo_codes:
            orfani.setdefault(norm_nome(c.get("name") or ""), []).append(cid)
    out = {}
    for code, nome in geo_codes.items():
        if code in data_codes:
            continue
        cand = orfani.get(norm_nome(nome), [])
        if len(cand) == 1:
            out[code] = cand[0]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    geo = json.loads(download("comuni.geojson", args.offline).read_text(encoding="utf-8"))
    pop = load_population(download("popolazione.csv", args.offline))
    ul = load_local_units(download("unita_locali.csv", args.offline))
    labels = ateco_labels(download("ateco_it.json", args.offline))
    veh = load_vehicles(download("veicoli.csv", args.offline))
    off = load_workshops(download("officine.csv", args.offline))

    geo_codes = {f["properties"]["com_istat_code"]: f["properties"]["name"] for f in geo["features"]}
    data_codes = set(pop) | set(ul) | set(veh)
    alias = alias_codici(geo_codes, data_codes, download("territori_it.json", args.offline))
    print(f"Comuni ricollegati per nome (codici cambiati): {len(alias)}")
    for nuovo, vecchio in alias.items():
        for tab in (pop, ul, veh, off):
            if vecchio in tab and nuovo not in tab:
                tab[nuovo] = tab[vecchio]

    (OUT / "geo").mkdir(parents=True, exist_ok=True)
    (OUT / "ul").mkdir(parents=True, exist_ok=True)

    comuni = []
    geo_by_prov: dict[int, list] = defaultdict(list)
    ul_by_prov: dict[int, dict] = defaultdict(dict)
    prov_bbox: dict[int, list] = {}
    prov_meta: dict[int, dict] = {}
    divisions_seen: set[str] = set()

    for feat in geo["features"]:
        p = feat["properties"]
        code = p["com_istat_code"]
        prov = int(p["prov_istat_code_num"])
        geom = make_valid(shape(feat["geometry"]))
        area_km2 = abs(GEOD.geometry_area_perimeter(geom)[0]) / 1e6
        pt = geom.representative_point()
        simp = geom.simplify(SIMPLIFY_DEG, preserve_topology=True)
        minx, miny, maxx, maxy = geom.bounds
        bb = prov_bbox.get(prov, [180, 90, -180, -90])
        prov_bbox[prov] = [min(bb[0], minx), min(bb[1], miny), max(bb[2], maxx), max(bb[3], maxy)]
        prov_meta[prov] = {"nome": p["prov_name"], "sigla": p["prov_acr"], "regione": p["reg_name"]}

        v = veh.get(code)
        comuni.append({
            "c": code,
            "n": p["name"],
            "p": p["prov_acr"],
            "pc": prov,
            "r": p["reg_name"],
            "lat": r4(pt.y),
            "lon": r4(pt.x),
            "km2": round(area_km2, 2),
            "pop": pop.get(code),
            "veh": v,
            "off": off.get(code, 0),
        })
        geo_by_prov[prov].append({
            "type": "Feature",
            "properties": {"c": code},
            "geometry": round_coords(mapping(simp)),
        })

        units = ul.get(code)
        if units:
            compact = {}
            for div, classes in units.items():
                divisions_seen.add(div)
                row = []
                for cls in SIZE_CLASSES:
                    row.extend(classes[cls])
                if any(row):
                    compact[div] = row
            ul_by_prov[prov][code] = compact

    for prov, feats in geo_by_prov.items():
        (OUT / "geo" / f"P_{prov}.json").write_text(
            json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")),
            encoding="utf-8",
        )
    for prov, units in ul_by_prov.items():
        (OUT / "ul" / f"P_{prov}.json").write_text(json.dumps(units, separators=(",", ":")), encoding="utf-8")

    off_osm = officine_osm(RAW / "osm_officine.json", geo["features"])
    if off_osm:
        (OUT / "concorrenza").mkdir(parents=True, exist_ok=True)
        for prov, righe in off_osm.items():
            (OUT / "concorrenza" / f"P_{prov}.json").write_text(json.dumps(righe, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        tot = sum(len(r) for r in off_osm.values())
        gomm = sum(1 for r in off_osm.values() for x in r if x[2] == "g")
        print(f"Officine OSM: {tot}, di cui gommisti {gomm}")

    (OUT / "comuni.json").write_text(json.dumps(comuni, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    province = [
        {"pc": k, **prov_meta[k], "bbox": [r4(x) for x in prov_bbox[k]]} for k in sorted(prov_bbox)
    ]
    (OUT / "province.json").write_text(json.dumps(province, ensure_ascii=False), encoding="utf-8")
    ateco = {k: labels.get(k, k) for k in sorted(divisions_seen)}
    meta = {
        "ateco": ateco,
        "size_classes": SIZE_CLASSES,
        "fonti": {
            "confini": "ISTAT, confini comunali al 1/1/2026 (via openpolis/geojson-italy, CC-BY)",
            "popolazione": "ISTAT, popolazione residente al 1/1/2026",
            "unita_locali": "ISTAT, registro ASIA unità locali, anno 2023",
            "veicoli": f"ISTAT su dati ACI-PRA, parco veicolare per comune al 31/12/{max(v['anno'] for v in veh.values())}",
            "officine": "ISTAT, registro ASIA unità locali ATECO 45.2 (manutenzione e riparazione autoveicoli), anno 2023",
            "concorrenza": "© OpenStreetMap contributors (ODbL), gommisti e officine mappati" if (RAW / "osm_officine.json").exists() else None,
        },
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Comuni: {len(comuni)}  province: {len(province)}  con unità locali: {sum(len(u) for u in ul_by_prov.values())}"
          f"  con veicoli: {sum(1 for c in comuni if c['veh'])}  con popolazione: {sum(1 for c in comuni if c['pop'])}")


if __name__ == "__main__":
    main()
