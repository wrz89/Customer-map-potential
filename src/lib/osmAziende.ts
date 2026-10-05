// Tutte le attività con un nome che OpenStreetMap conosce attorno a un punto:
// negozi, studi, artigiani, locali, scuole, strutture sanitarie, industrie.
// Gratis, ma incompleto: non ci sono addetti né partita IVA (quando c'è il tag ref:vatin la si usa),
// e la copertura varia da zona a zona. Dati © OpenStreetMap contributors (ODbL).
import { CATEGORIE, type Flotta } from './categories'
import type { Azienda } from './companies'
import { distanzaKm } from './geo'

export interface ElementoOsm {
  type?: string
  id?: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Oltre questo raggio le risposte diventano enormi (decine di migliaia di punti): si lavora a zone. */
export const RAGGIO_MAX_OSM_KM = 5

const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const AMENITY =
  'restaurant|cafe|bar|pub|fast_food|ice_cream|food_court|bank|pharmacy|clinic|doctors|dentist|veterinary|car_rental|car_sharing|car_wash|fuel|driving_school|school|kindergarten|college|university|language_school|music_school|post_office|nursing_home|social_facility|coworking_space|funeral_hall|laboratory|childcare|townhall|courthouse|community_centre'
const TURISMO = 'hotel|guest_house|hostel|motel|apartment|camp_site|caravan_site'
const LEISURE = 'fitness_centre|sports_centre|dance|swimming_pool|sauna|amusement_arcade'
const EDIFICI = 'industrial|warehouse|factory|commercial|retail|office'

/** Query Overpass: solo elementi con nome, dentro il raggio. I gommisti restano alla scheda Concorrenza. */
export function queryAttivita(lat: number, lon: number, raggioKm: number): string {
  const a = `(around:${Math.round(raggioKm * 1000)},${lat},${lon})`
  const n = '["name"]'
  return `[out:json][timeout:150];(
nwr["shop"]${n}${a};
nwr["office"]${n}${a};
nwr["craft"]${n}${a};
nwr["amenity"~"^(${AMENITY})$"]${n}${a};
nwr["tourism"~"^(${TURISMO})$"]${n}${a};
nwr["leisure"~"^(${LEISURE})$"]${n}${a};
nwr["healthcare"]${n}${a};
nwr["man_made"="works"]${n}${a};
nwr["industrial"]${n}${a};
nwr["building"~"^(${EDIFICI})$"]${n}${a};
);out center tags;`
}

/* ---------- classificazione ---------- */

interface Classe {
  cat: string // id in CATEGORIE
  flotta?: Flotta // se diversa da quella della categoria
  descr: string
}

const MESTIERI_EDILI = /^(electrician|plumber|hvac|carpenter|builder|roofer|painter|plasterer|tiler|glaziery|joiner|stonemason|scaffolder|insulation|floorer|metal_construction|window_construction|locksmith|handicraft|building_metal|chimney_sweeper|paver|stand_builder|construction)$/
const MESTIERI_AUTO = /^(car_repair|car_painter|car|tyres|motorcycle|bicycle_repair)$/
const PROF_FINANZA = /^(insurance|financial|financial_advisor|estate_agent|tax_advisor|accountant|notary)$/
const PROF_TRASPORTI = /^(logistics|courier|moving_company|transport|freight_forwarder|taxi)$/

const PAROLE: [RegExp, string][] = [
  [/\b(autonoleggio|noleggio)\w*/i, 'noleggio'],
  [/\b(autotrasport|trasport|logistic|spedizion|corrier|traslochi)\w*/i, 'trasporti'],
  [/\b(edil|costruzion|impiant|elettric|idraul|termoidraul|serrament|ristruttur|imbianch)\w*/i, 'edilizia'],
  [/\b(avvocat|studio legale|commercialist|notaio|geometra|architett|ingegner|consulen)\w*/i, 'professioni'],
]

export function classificaOsm(tags: Record<string, string>): Classe | null {
  const { shop, office, craft, amenity, tourism, leisure, healthcare, man_made: manMade, building } = tags
  let c: Classe | null = null
  if (shop) {
    if (shop === 'vacant' || shop === 'no' || shop === 'yes' && !tags.name) return null
    if (shop === 'tyres') return null // concorrenza
    if (/^(car|car_repair|car_parts|motorcycle|truck|caravan|van|motorcycle_repair)$/.test(shop)) c = { cat: 'auto', descr: `Negozio: ${shop}` }
    else if (shop === 'wholesale' || shop === 'trade') c = { cat: 'ingrosso', descr: `Ingrosso: ${shop}` }
    else c = { cat: 'dettaglio', descr: `Negozio: ${shop}` }
  } else if (office) {
    if (PROF_FINANZA.test(office)) c = { cat: 'finanza', descr: `Ufficio: ${office}` }
    else if (PROF_TRASPORTI.test(office)) c = { cat: 'trasporti', descr: `Ufficio: ${office}` }
    else if (office === 'construction_company') c = { cat: 'edilizia', descr: 'Impresa edile' }
    else if (/^(government|diplomatic|ngo|association|political_party|religion|foundation|union|educational_institution|quango)$/.test(office)) c = { cat: 'altri', descr: `Ente: ${office}` }
    else c = { cat: 'professioni', descr: `Ufficio: ${office}` }
  } else if (craft) {
    if (craft === 'tyres') return null
    if (MESTIERI_AUTO.test(craft)) c = { cat: 'auto', descr: `Artigiano: ${craft}` }
    else if (MESTIERI_EDILI.test(craft)) c = { cat: 'edilizia', descr: `Artigiano: ${craft}` }
    else c = { cat: 'manifattura', descr: `Artigiano: ${craft}` }
  } else if (amenity) {
    if (amenity === 'car_rental' || amenity === 'car_sharing') c = { cat: 'noleggio', descr: 'Noleggio veicoli' }
    else if (amenity === 'car_wash') c = { cat: 'auto', descr: 'Autolavaggio' }
    else if (amenity === 'fuel') c = { cat: 'auto', descr: 'Distributore di carburante' }
    else if (amenity === 'driving_school') c = { cat: 'istruzione', flotta: 'Alta', descr: 'Autoscuola' }
    else if (amenity === 'post_office') c = { cat: 'trasporti', descr: 'Ufficio postale' }
    else if (amenity === 'bank') c = { cat: 'finanza', descr: 'Banca' }
    else if (/^(restaurant|cafe|bar|pub|fast_food|ice_cream|food_court)$/.test(amenity)) c = { cat: 'ricettivo', descr: `Locale: ${amenity}` }
    else if (/^(clinic|doctors|dentist|veterinary|nursing_home|social_facility|laboratory)$/.test(amenity)) c = { cat: 'sanita', descr: `Sanità: ${amenity}` }
    else if (/^(school|kindergarten|college|university|language_school|music_school|childcare)$/.test(amenity)) c = { cat: 'istruzione', descr: `Istruzione: ${amenity}` }
    else if (amenity === 'pharmacy') c = { cat: 'dettaglio', descr: 'Farmacia' }
    else if (/^(townhall|courthouse|community_centre)$/.test(amenity)) c = { cat: 'altri', descr: `Ente: ${amenity}` }
    else c = { cat: 'professioni', descr: `Servizio: ${amenity}` }
  } else if (tourism) {
    c = { cat: 'ricettivo', descr: `Ricettivo: ${tourism}` }
  } else if (healthcare) {
    c = { cat: 'sanita', descr: `Sanità: ${healthcare}` }
  } else if (leisure) {
    c = { cat: 'altri', descr: `Tempo libero: ${leisure}` }
  } else if (manMade === 'works' || tags.industrial || (building && /^(industrial|factory)$/.test(building))) {
    c = { cat: 'manifattura', descr: 'Industria' }
  } else if (building === 'warehouse') {
    c = { cat: 'trasporti', descr: 'Magazzino' }
  } else if (building && /^(commercial|retail|office)$/.test(building)) {
    c = { cat: 'professioni', descr: `Edificio: ${building}` }
  }
  if (!c) return null
  // il nome dice a volte più del tag: "Autotrasporti Rossi" è un trasportatore anche se mappato come ufficio
  if (c.cat === 'professioni' || c.cat === 'dettaglio' || c.cat === 'manifattura' || c.cat === 'altri') {
    const nome = tags.name ?? ''
    const p = PAROLE.find(([re]) => re.test(nome))
    if (p && !(p[1] === 'professioni' && c.cat === 'professioni')) return { ...c, cat: p[1] }
  }
  return c
}

/* ---------- conversione ---------- */

const piva = (tags: Record<string, string>) => (tags['ref:vatin'] ?? tags['vat'] ?? '').replace(/^IT/i, '').replace(/\D/g, '')

/** Elementi Overpass → aziende. Toglie i doppioni (stesso nome a meno di 40 m: nodo dentro il proprio edificio). */
export function convertiAttivita(elementi: ElementoOsm[], centro: { lat: number; lon: number }, raggioKm: number): Azienda[] {
  const out: Azienda[] = []
  const visti = new Set<string>()
  for (const el of elementi) {
    const tags = el.tags
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    const nome = tags?.name?.trim()
    if (!tags || !nome || lat === undefined || lon === undefined) continue
    const d = distanzaKm(centro.lat, centro.lon, lat, lon)
    if (d > raggioKm) continue
    const cl = classificaOsm(tags)
    if (!cl) continue
    // chiave per i doppioni: nome normalizzato + cella di circa 40 m
    const k = `${nome.toLowerCase().replace(/[^a-z0-9]/g, '')}|${Math.round(lat * 2500)}|${Math.round(lon * 2000)}`
    if (visti.has(k)) continue
    visti.add(k)
    const cat = CATEGORIE.find((x) => x.id === cl.cat)!
    const strada = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
    out.push({
      id: `osm-${el.type ?? 'n'}-${el.id ?? `${lat},${lon}`}`,
      ragioneSociale: nome,
      piva: piva(tags),
      ateco: '',
      atecoDescr: cl.descr,
      categoria: cat.nome,
      flotta: cl.flotta ?? cat.flotta,
      dipendenti: null,
      fatturato: null,
      annoBilancio: null,
      formaGiuridica: '',
      indirizzo: strada,
      cap: tags['addr:postcode'] ?? '',
      comune: tags['addr:city'] ?? '',
      provincia: '',
      pec: '',
      lat,
      lon,
      distanzaKm: Math.round(d * 100) / 100,
      fonte: 'osm',
      posizione: 'indirizzo',
      cercato: true,
      contatto: tags.phone ?? tags['contact:phone'] ?? tags.website ?? tags['contact:website'] ?? '',
    })
  }
  return out.sort((a, b) => (a.distanzaKm ?? 0) - (b.distanzaKm ?? 0))
}

/* ---------- richiesta ---------- */

export interface RisultatoAttivita {
  aziende: Azienda[]
  /** elementi grezzi ricevuti, prima di togliere doppioni e attività senza classe */
  ricevuti: number
}

export async function cercaAttivitaOsm(
  lat: number,
  lon: number,
  raggioKm: number,
  http: typeof fetch = fetch,
  server: string[] = SERVER,
): Promise<RisultatoAttivita> {
  if (raggioKm > RAGGIO_MAX_OSM_KM) throw new Error(`Con OpenStreetMap il raggio massimo è ${RAGGIO_MAX_OSM_KM} km: oltre, la risposta è troppo grande. Restringi il raggio o lavora a zone.`)
  const q = queryAttivita(lat, lon, raggioKm)
  let ultimoErrore = ''
  for (const url of server) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 170000)
      const res = await http(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { elements?: ElementoOsm[]; remark?: string }
      if (j.remark && /timed out|out of memory|runtime error/i.test(j.remark)) throw new Error('il server è sovraccarico')
      const el = j.elements ?? []
      return { aziende: convertiAttivita(el, { lat, lon }, raggioKm), ricevuti: el.length }
    } catch (e) {
      ultimoErrore = (e as Error).name === 'AbortError' ? 'tempo scaduto' : (e as Error).message
    }
  }
  throw new Error(`OpenStreetMap non risponde (${ultimoErrore}). Riprova tra qualche minuto, o con un raggio più piccolo.`)
}
