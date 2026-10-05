// Concorrenza da OpenStreetMap, interrogata al momento per la zona aperta e
// salvata nel browser per 30 giorni. Stesse regole di scripts/build_data.py.
import { distanzaKm } from './geo'
import type { Azienda } from './companies'
import type { Concorrente } from './zone'

// Reti riconosciute dal nome o dal marchio; il gruppo solo dove l'appartenenza è certa
const RETI: [string, string, RegExp][] = [
  ['SuperService', 'Goodyear', /super\s*-?\s*service/i],
  ['Driver Center', 'Pirelli', /\bdriver\s*-?\s*cent(er|re)\b|\bpirelli\b/i],
  ['First Stop', 'Bridgestone', /first\s*-?\s*stop/i],
  ['Euromaster', 'Michelin', /euromaster/i],
  ['BestDrive', 'Continental', /best\s*-?\s*drive/i],
  ['Point S', '', /\bpoint\s*-?\s*s\b/i],
  ['Vulco', '', /\bvulco\b/i],
  ['Vianor', '', /\bvianor\b/i],
  ['Bosch Car Service', 'Bosch', /bosch\s*car/i],
  ['Speedy', '', /\bspeedy\b/i],
  ['Norauto', '', /\bnorauto\b/i],
  ['Midas', '', /\bmidas\b/i],
  ['Eurorepar', '', /euro\s*-?\s*repar/i],
]
const PAROLE_GOMME = /gomm|pneumat|tyre|\btire|gommist/i

export function classificaOfficina(tags: Record<string, string>): { gommista: boolean; rete: string; gruppo: string } {
  const testo = ['brand', 'name', 'operator', 'network'].map((k) => tags[k] ?? '').join(' ')
  const r = RETI.find(([, , re]) => re.test(testo))
  const gommista = tags.shop === 'tyres' || tags.craft === 'tyres' || tags['service:tyres'] === 'yes' || PAROLE_GOMME.test(testo)
  return { gommista, rete: r?.[0] ?? '', gruppo: r?.[1] ?? '' }
}

const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const GIORNI_VALIDITA = 30

interface ElementoOsm {
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export interface RisultatoConcorrenza {
  concorrenti: Concorrente[]
  data: string
  daCache: boolean
  fonte: 'osm'
}

const chiave = (lat: number, lon: number, r: number) => `cmp.osm.v2.${lat.toFixed(3)}.${lon.toFixed(3)}.${r}`

export function convertiElementi(el: ElementoOsm[], lat: number, lon: number, raggioKm: number): Concorrente[] {
  const out: Concorrente[] = []
  for (const e of el) {
    const la = e.lat ?? e.center?.lat
    const lo = e.lon ?? e.center?.lon
    if (la === undefined || lo === undefined) continue
    const d = distanzaKm(lat, lon, la, lo)
    if (d > raggioKm) continue
    const tags = e.tags ?? {}
    out.push({ lat: la, lon: lo, ...classificaOfficina(tags), nome: tags.name ?? tags.brand ?? '', distanzaKm: Math.round(d * 100) / 100, fonte: 'osm' })
  }
  return out.sort((a, b) => a.distanzaKm - b.distanzaKm)
}

function salva(k: string, r: RisultatoConcorrenza) {
  try {
    localStorage.setItem(k, JSON.stringify(r))
  } catch {
    /* spazio pieno: si usa senza salvare */
  }
}

/** Officine mappate in OpenStreetMap: gratis, copertura parziale. Salvate 30 giorni. */
export async function caricaConcorrenzaOsm(lat: number, lon: number, raggioKm: number, forza = false): Promise<RisultatoConcorrenza> {
  const k = chiave(lat, lon, raggioKm)
  if (!forza) {
    try {
      const c = JSON.parse(localStorage.getItem(k) ?? 'null') as RisultatoConcorrenza | null
      if (c && Date.now() - new Date(c.data).getTime() < GIORNI_VALIDITA * 864e5) return { ...c, daCache: true }
    } catch {
      /* storage non disponibile */
    }
  }
  const m = Math.round(raggioKm * 1000)
  const q = `[out:json][timeout:90];(nwr["shop"="tyres"](around:${m},${lat},${lon});nwr["shop"="car_repair"](around:${m},${lat},${lon});nwr["craft"="tyres"](around:${m},${lat},${lon}););out center tags;`
  let ultimoErrore = ''
  for (const url of SERVER) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 70000)
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { elements: ElementoOsm[] }
      const r: RisultatoConcorrenza = { concorrenti: convertiElementi(j.elements, lat, lon, raggioKm), data: new Date().toISOString(), daCache: false, fonte: 'osm' }
      salva(k, r)
      return r
    } catch (e) {
      ultimoErrore = (e as Error).message
    }
  }
  throw new Error(`OpenStreetMap non risponde (${ultimoErrore}). Riprova tra qualche minuto.`)
}

/** ATECO 45.20.40: riparazione e sostituzione di pneumatici (gommisti iscritti al Registro Imprese) */
export const ATECO_GOMMISTI = ['452040']

/** Gommisti dal Registro Imprese (Openapi o file Telemaco) come concorrenti. */
export function daRegistro(aziende: Azienda[], lat: number, lon: number, raggioKm: number): Concorrente[] {
  const out: Concorrente[] = []
  for (const a of aziende) {
    if (a.lat === null || a.lon === null) continue
    const d = distanzaKm(lat, lon, a.lat, a.lon)
    if (d > raggioKm) continue
    const c = classificaOfficina({ name: a.ragioneSociale })
    out.push({ lat: a.lat, lon: a.lon, gommista: true, rete: c.rete, gruppo: c.gruppo, nome: a.ragioneSociale, distanzaKm: Math.round(d * 100) / 100, fonte: 'registro', indirizzo: [a.indirizzo, a.comune].filter(Boolean).join(', '), piva: a.piva, centroComune: a.fonte === 'import' })
  }
  return out.sort((x, y) => x.distanzaKm - y.distanzaKm)
}

/** Unisce Registro e OpenStreetMap: un punto OSM a meno di 150 m da un gommista del Registro è lo stesso. */
export function unisciConcorrenti(registro: Concorrente[], osm: Concorrente[]): Concorrente[] {
  if (!registro.length) return osm
  const vicini = (a: Concorrente, b: Concorrente) => distanzaKm(a.lat, a.lon, b.lat, b.lon) < 0.15
  const reg = registro.filter((r) => !r.centroComune)
  return [...registro, ...osm.filter((o) => !reg.some((r) => vicini(r, o)))].sort((a, b) => a.distanzaKm - b.distanzaKm)
}
