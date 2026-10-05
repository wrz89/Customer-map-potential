// Concorrenza da OpenStreetMap, interrogata al momento per la zona aperta e
// salvata nel browser per 30 giorni. Stesse regole di scripts/build_data.py.
import { distanzaKm } from './geo'
import { bbox, interrogaOverpass, type OpzioniOverpass } from './overpass'
import { inComune, type Azienda } from './companies'
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

const GIORNI_VALIDITA = 30

interface ElementoOsm {
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export interface AreaOsm {
  lat: number
  lon: number
  raggioKm: number
}

export interface RisultatoConcorrenza {
  /** tutte le officine dell'area caricata, distanza dal centro dell'area */
  concorrenti: Concorrente[]
  data: string
  daCache: boolean
  fonte: 'osm'
  area?: AreaOsm
}

// v3: la ricerca comprende anche craft=car_repair (officine mappate come artigiani); le copie vecchie si ignorano
const PREFISSO = 'cmp.osm.v3.'
const chiave = (lat: number, lon: number, r: number) => `${PREFISSO}${lat.toFixed(3)}.${lon.toFixed(3)}.${r}`

/** Si carica un'area più larga di quella chiesta: spostare un po' il centro o allargare il raggio non rifà la richiesta. */
export const raggioDaCaricare = (raggioKm: number) => Math.min(75, Math.max(5, Math.round(raggioKm * 1.5 * 10) / 10))

/** Il cerchio chiesto sta tutto dentro l'area già caricata? */
export const areaCopre = (area: AreaOsm, lat: number, lon: number, raggioKm: number) => distanzaKm(area.lat, area.lon, lat, lon) + raggioKm <= area.raggioKm + 1e-6

/** Le officine di un'area, riferite al centro e al raggio attuali. */
export function filtraConcorrenti(tutti: Concorrente[], lat: number, lon: number, raggioKm: number): Concorrente[] {
  const out: Concorrente[] = []
  for (const c of tutti) {
    const d = distanzaKm(lat, lon, c.lat, c.lon)
    if (d <= raggioKm) out.push({ ...c, distanzaKm: Math.round(d * 100) / 100 })
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

/** Cerca nella memoria del browser un'area recente che copra il cerchio chiesto (anche salvata da versioni precedenti). */
function dallaMemoria(lat: number, lon: number, raggioKm: number): RisultatoConcorrenza | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      const m = k.startsWith(PREFISSO) ? k.slice(PREFISSO.length).match(/^(-?\d+\.\d+)\.(-?\d+\.\d+)\.(.+)$/) : null
      if (!m) continue
      const area: AreaOsm = { lat: Number(m[1]), lon: Number(m[2]), raggioKm: Number(m[3]) }
      if (!areaCopre(area, lat, lon, raggioKm)) continue
      const c = JSON.parse(localStorage.getItem(k) ?? 'null') as RisultatoConcorrenza | null
      if (c && Date.now() - new Date(c.data).getTime() < GIORNI_VALIDITA * 864e5) return { ...c, daCache: true, area }
    }
  } catch {
    /* storage non disponibile */
  }
  return null
}

/** Officine mappate in OpenStreetMap: gratis, copertura parziale. Salvate 30 giorni. */
export async function caricaConcorrenzaOsm(lat: number, lon: number, raggioKm: number, forza = false, opz: OpzioniOverpass = {}): Promise<RisultatoConcorrenza> {
  if (!forza) {
    const c = dallaMemoria(lat, lon, raggioKm)
    if (c) return c
  }
  // prima l'area larga (serve a non rifare la richiesta se il centro si sposta); se i server faticano, solo quella chiesta
  const raggi = [raggioDaCaricare(raggioKm)]
  if (raggi[0] > raggioKm) raggi.push(raggioKm)
  let ultimoErrore: unknown
  for (const rc of raggi) {
    const q = `[out:json][timeout:60][bbox:${bbox(lat, lon, rc)}];(nwr["shop"="tyres"];nwr["shop"="car_repair"];nwr["craft"="car_repair"];nwr["craft"="tyres"];);out center tags;`
    try {
      const j = await interrogaOverpass<{ elements: ElementoOsm[] }>(q, { giri: rc === raggi[0] && raggi.length > 1 ? 1 : 2, ...opz })
      const r: RisultatoConcorrenza = { concorrenti: convertiElementi(j.elements ?? [], lat, lon, rc), data: new Date().toISOString(), daCache: false, fonte: 'osm', area: { lat, lon, raggioKm: rc } }
      salva(chiave(lat, lon, rc), r)
      return r
    } catch (e) {
      ultimoErrore = e
    }
  }
  throw ultimoErrore as Error
}

/** ATECO 45.20.40: riparazione e sostituzione di pneumatici (gommisti iscritti al Registro Imprese) */
export const ATECO_GOMMISTI = ['452040']

/** Gommisti dal Registro Imprese (Openapi o file Telemaco) come concorrenti. */
/**
 * Imprese del Registro come concorrenti. Quelle messe solo al centro del comune (elenchi senza coordinate)
 * contano se il loro comune cade nella zona (`comuniZona`): la distanza dal centro del comune non dice nulla.
 */
export function daRegistro(aziende: Azienda[], lat: number, lon: number, raggioKm: number, comuniZona?: (comune: string) => boolean): Concorrente[] {
  const out: Concorrente[] = []
  for (const a of aziende) {
    if (a.lat === null || a.lon === null) continue
    const d = distanzaKm(lat, lon, a.lat, a.lon)
    if (inComune(a) ? comuniZona && !comuniZona(a.comune) : d > raggioKm) continue
    const c = classificaOfficina({ name: a.ragioneSociale })
    out.push({ lat: a.lat, lon: a.lon, gommista: true, rete: c.rete, gruppo: c.gruppo, nome: a.ragioneSociale, distanzaKm: Math.round(d * 100) / 100, fonte: 'registro', indirizzo: [a.indirizzo, a.comune].filter(Boolean).join(', '), piva: a.piva, centroComune: inComune(a) })
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
