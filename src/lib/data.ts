// Caricamento dei dati statici in public/data, con cache in memoria.

export interface Veicoli {
  anno: number
  autovetture: number
  autocarri: number
  pesanti: number
  motocicli: number
  autobus: number
  altri: number
}

export interface Comune {
  c: string // codice ISTAT
  n: string
  p: string // sigla provincia
  pc: number // codice provincia
  r: string
  lat: number
  lon: number
  km2: number
  pop: number | null
  veh: Veicoli | null
  off?: number | null // unità locali ATECO 45.2 (officine e gommisti), se disponibile
}

export interface Provincia {
  pc: number
  nome: string
  sigla: string
  regione: string
  bbox: [number, number, number, number]
}

export interface Meta {
  ateco: Record<string, string>
  size_classes: string[]
  fonti: Record<string, string | null>
}

// Per comune: divisione ATECO -> [UL tot, addetti tot, UL 0-9, add 0-9, UL 10-49, add 10-49,
// UL 50-249, add 50-249, UL 250+, add 250+]
export type UnitaLocaliComune = Record<string, number[]>

const base = `${import.meta.env.BASE_URL}data`
const cache = new Map<string, Promise<unknown>>()

function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(`${base}/${path}`).then((r) => {
      if (!r.ok) throw new Error(`Dati non disponibili: ${path} (${r.status})`)
      return r.json()
    })
    cache.set(path, p)
    p.catch(() => cache.delete(path))
  }
  return p as Promise<T>
}

export const loadComuni = () => getJson<Comune[]>('comuni.json')
export const loadProvince = () => getJson<Provincia[]>('province.json')
export const loadMeta = () => getJson<Meta>('meta.json')
export const loadGeoProvincia = (pc: number) =>
  getJson<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { c: string }>>(`geo/P_${pc}.json`)
export const loadUnitaLocaliProvincia = (pc: number) =>
  getJson<Record<string, UnitaLocaliComune>>(`ul/P_${pc}.json`)
