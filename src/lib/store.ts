// Dati salvati nel browser: dealer, impostazioni, acquisti e liste clienti.
import { DEMO } from './ambiente'
import type { Azienda } from './companies'
import type { Cliente } from './match'

export interface Dealer {
  id: string
  nome: string
  indirizzo: string
  lat: number
  lon: number
  raggioKm: number
  note?: string
  /** come è stata trovata la posizione all'import: se non 'indirizzo', va controllata sulla mappa */
  posizione?: 'indirizzo' | 'cap' | 'comune'
}

const K_DEALER = 'cmp.dealer.v1'
const K_IMPOST = 'cmp.impostazioni.v1'

const DEALER_ESEMPIO: Dealer[] = [
  { id: 'esempio-pavia', nome: 'SuperService Pavia (esempio)', indirizzo: 'Pavia, centro', lat: 45.1847, lon: 9.1582, raggioKm: 15, note: 'Punto di esempio: sostituisci con l\'indirizzo reale del dealer' },
  // nella demo qualche punto in più, per vedere gli altri SuperService sulla mappa
  ...(DEMO
    ? [
        { id: 'esempio-milano-sud', nome: 'SuperService Milano Sud (esempio)', indirizzo: 'Rozzano, centro', lat: 45.381, lon: 9.155, raggioKm: 10 },
        { id: 'esempio-lodi', nome: 'SuperService Lodi (esempio)', indirizzo: 'Lodi, centro', lat: 45.3138, lon: 9.5037, raggioKm: 15 },
        { id: 'esempio-vigevano', nome: 'SuperService Vigevano (esempio)', indirizzo: 'Vigevano, centro', lat: 45.3168, lon: 8.8574, raggioKm: 15 },
        { id: 'esempio-bergamo', nome: 'SuperService Bergamo (esempio)', indirizzo: 'Bergamo, centro', lat: 45.6983, lon: 9.6773, raggioKm: 15 },
      ]
    : []),
]

function leggi<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : def
  } catch {
    return def
  }
}
function scrivi(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* spazio pieno o storage bloccato: l'app continua a funzionare in memoria */
  }
}

export const caricaDealer = () => leggi<Dealer[]>(K_DEALER, DEALER_ESEMPIO)
export const salvaDealer = (d: Dealer[]) => scrivi(K_DEALER, d)

export interface Impostazioni {
  chiaveApp: string
}
export const caricaImpostazioni = () => leggi<Impostazioni>(K_IMPOST, { chiaveApp: '' })
export const salvaImpostazioni = (i: Impostazioni) => scrivi(K_IMPOST, i)

/* ---------- IndexedDB per aziende acquistate e liste clienti ---------- */

export interface Acquisto {
  id: string
  dealerId: string
  data: string
  raggioKm: number
  centro: { lat: number; lon: number }
  filtri: { minDipendenti?: number; maxDipendenti?: number; ateco?: string[] }
  fonte: Azienda['fonte']
  /** 'concorrenza' = gommisti concorrenti, esclusi dall'elenco clienti potenziali */
  scopo?: 'clienti' | 'concorrenza'
  conteggio: number
  prezzo: number | null
  aziende: Azienda[]
}

export interface ListaClienti {
  dealerId: string
  nomeFile: string
  data: string
  clienti: Cliente[]
}

const DB = 'customer-map-potential'
let dbP: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbP) {
    dbP = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => {
        const d = r.result
        d.createObjectStore('acquisti', { keyPath: 'id' }).createIndex('dealer', 'dealerId')
        d.createObjectStore('clienti', { keyPath: 'dealerId' })
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbP
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const req = fn(d.transaction(store, mode).objectStore(store))
        req.onsuccess = () => res(req.result as T)
        req.onerror = () => rej(req.error)
      }),
  )
}

export const salvaAcquisto = (a: Acquisto) => tx<IDBValidKey>('acquisti', 'readwrite', (s) => s.put(a))
export const eliminaAcquisto = (id: string) => tx<undefined>('acquisti', 'readwrite', (s) => s.delete(id))
export const acquistiDealer = (dealerId: string) =>
  tx<Acquisto[]>('acquisti', 'readonly', (s) => s.index('dealer').getAll(dealerId)).catch(() => [] as Acquisto[])
export const tuttiAcquisti = () => tx<Acquisto[]>('acquisti', 'readonly', (s) => s.getAll()).catch(() => [] as Acquisto[])
export const salvaClienti = (l: ListaClienti) => tx<IDBValidKey>('clienti', 'readwrite', (s) => s.put(l))
export const caricaClienti = (dealerId: string) =>
  tx<ListaClienti | undefined>('clienti', 'readonly', (s) => s.get(dealerId)).catch(() => undefined)
export const eliminaClienti = (dealerId: string) => tx<undefined>('clienti', 'readwrite', (s) => s.delete(dealerId))

/* ---------- Geocodifica indirizzo dealer (OpenStreetMap Nominatim) ---------- */

export interface RisultatoGeocodifica {
  nome: string
  lat: number
  lon: number
}

/** Ricerca a campi separati (via, CAP, comune): più affidabile del testo libero per gli elenchi Excel. */
export async function geocodificaCampi(q: { via?: string; cap?: string; citta?: string; testo?: string }): Promise<RisultatoGeocodifica[]> {
  if (q.testo) return geocodifica(q.testo)
  const u = new URL('https://nominatim.openstreetmap.org/search')
  if (q.via) u.searchParams.set('street', q.via)
  if (q.cap) u.searchParams.set('postalcode', q.cap)
  if (q.citta) u.searchParams.set('city', q.citta)
  u.searchParams.set('country', 'Italia')
  u.searchParams.set('format', 'jsonv2')
  u.searchParams.set('limit', '1')
  u.searchParams.set('accept-language', 'it')
  const r = await fetch(u)
  if (!r.ok) throw new Error('Ricerca indirizzo non disponibile')
  const j = (await r.json()) as { display_name: string; lat: string; lon: string }[]
  return j.map((x) => ({ nome: x.display_name, lat: Number(x.lat), lon: Number(x.lon) }))
}

export async function geocodifica(q: string): Promise<RisultatoGeocodifica[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search')
  u.searchParams.set('q', q)
  u.searchParams.set('format', 'jsonv2')
  u.searchParams.set('countrycodes', 'it')
  u.searchParams.set('limit', '5')
  u.searchParams.set('accept-language', 'it')
  const r = await fetch(u)
  if (!r.ok) throw new Error('Ricerca indirizzo non disponibile')
  const j = (await r.json()) as { display_name: string; lat: string; lon: string }[]
  return j.map((x) => ({ nome: x.display_name, lat: Number(x.lat), lon: Number(x.lon) }))
}
