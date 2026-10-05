// Aziende della zona: da Openapi (a pagamento), da un file importato
// (es. estrazione Telemaco) o dimostrative.
import { DEMO } from './ambiente'
import { categoriaDaAteco, type Flotta } from './categories'
import { distanzaKm } from './geo'
import type { Zona } from './zone'

export type Fonte = 'openapi' | 'import' | 'demo'

export interface Azienda {
  id: string
  ragioneSociale: string
  piva: string
  ateco: string
  atecoDescr: string
  categoria: string
  flotta: Flotta | ''
  dipendenti: number | null
  fatturato: number | null
  annoBilancio: number | null
  formaGiuridica: string
  indirizzo: string
  cap: string
  comune: string
  provincia: string
  pec: string
  lat: number | null
  lon: number | null
  distanzaKm: number | null
  fonte: Fonte
}

export function arricchisci(a: Omit<Azienda, 'categoria' | 'flotta' | 'distanzaKm'>, centro: { lat: number; lon: number }): Azienda {
  const cat = categoriaDaAteco(a.ateco)
  return {
    ...a,
    categoria: cat?.nome ?? (a.ateco ? 'Altro' : 'Non classificata'),
    flotta: cat?.flotta ?? '',
    distanzaKm: a.lat !== null && a.lon !== null ? Math.round(distanzaKm(centro.lat, centro.lon, a.lat, a.lon) * 10) / 10 : null,
  }
}

/* ---------- Openapi ---------- */

interface OpenapiRecord {
  id?: string
  companyName?: string
  vatCode?: string
  taxCode?: string
  pec?: string
  address?: { registeredOffice?: { streetName?: string; town?: string; province?: string; zipCode?: string; gps?: { coordinates?: [number, number] } } }
  atecoClassification?: Record<string, { code?: string; description?: string } | undefined>
  detailedLegalForm?: { description?: string }
  balanceSheets?: { last?: { year?: number; employees?: number | null; turnover?: number | null }; all?: { year?: number; employees?: number | null }[] }
}

export function daOpenapi(r: OpenapiRecord, centro: { lat: number; lon: number }): Azienda {
  const sede = r.address?.registeredOffice
  const ac = r.atecoClassification ?? {}
  const ateco = ac.ateco2007 ?? ac.ateco2022 ?? ac.ateco ?? {}
  const bilanci = r.balanceSheets
  // dipendenti: ultimo anno con il dato valorizzato
  const conDip = [...(bilanci?.all ?? [])].filter((b) => b.employees != null).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0]
  const coord = sede?.gps?.coordinates
  return arricchisci(
    {
      id: r.id ?? r.vatCode ?? r.taxCode ?? crypto.randomUUID(),
      ragioneSociale: r.companyName ?? '',
      piva: r.vatCode ?? r.taxCode ?? '',
      ateco: formattaAteco(ateco.code ?? ''),
      atecoDescr: ateco.description ?? '',
      dipendenti: conDip?.employees ?? bilanci?.last?.employees ?? null,
      fatturato: bilanci?.last?.turnover ?? null,
      annoBilancio: conDip?.year ?? bilanci?.last?.year ?? null,
      formaGiuridica: r.detailedLegalForm?.description ?? '',
      indirizzo: sede?.streetName ?? '',
      cap: sede?.zipCode ?? '',
      comune: sede?.town ?? '',
      provincia: sede?.province ?? '',
      pec: r.pec ?? '',
      lat: coord ? coord[1] : null,
      lon: coord ? coord[0] : null,
      fonte: 'openapi',
    },
    centro,
  )
}

export function formattaAteco(code: string): string {
  const d = code.replace(/\D/g, '')
  if (d.length <= 2) return d
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)].filter(Boolean).join('.')
}

export interface StimaOpenapi {
  demo: boolean
  sandbox?: boolean
  conteggio: number | null
  prezzo: number | null
  messaggio?: string
}

export interface FiltriAcquisto {
  minDipendenti?: number
  maxDipendenti?: number
  ateco?: string[]
}

async function post<T>(body: object, chiave: string): Promise<T> {
  if (DEMO) {
    return { demo: true, messaggio: "Nella demo online l'acquisto da Openapi è disattivato: funziona nella versione pubblicata su Vercel con il token. Qui usa i dati dimostrativi o importa un file." } as T
  }
  const res = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-key': chiave },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ errore: `Risposta non valida (${res.status})` }))
  if (!res.ok) throw new Error(json.errore ?? `Errore ${res.status}`)
  return json as T
}

export function stimaOpenapi(centro: { lat: number; lon: number }, raggioKm: number, f: FiltriAcquisto, chiave: string) {
  return post<StimaOpenapi>({ azione: 'stima', lat: centro.lat, lon: centro.lon, raggioKm, ...f }, chiave)
}

export async function acquistaOpenapi(centro: { lat: number; lon: number }, raggioKm: number, f: FiltriAcquisto, chiave: string) {
  const r = await post<{ demo: boolean; aziende?: OpenapiRecord[]; troncato?: boolean }>(
    { azione: 'acquista', lat: centro.lat, lon: centro.lon, raggioKm, ...f },
    chiave,
  )
  return { ...r, aziende: (r.aziende ?? []).map((x) => daOpenapi(x, centro)) }
}

/* ---------- Dati dimostrativi ---------- */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COGNOMI = ['Rossi', 'Bianchi', 'Colombo', 'Ferrari', 'Galli', 'Brambilla', 'Fumagalli', 'Sala', 'Cattaneo', 'Villa', 'Riva', 'Ferri', 'Mariani', 'Bassi', 'Lombardi', 'Gatti', 'Pozzi', 'Rinaldi', 'Moretti', 'Fontana', 'Barbieri', 'Conti', 'Marchetti', 'Bertoni']
const PAROLE: Record<string, string[]> = {
  '49': ['Autotrasporti', 'Trasporti', 'Logistica'], '52': ['Logistica', 'Magazzini Generali'], '53': ['Express', 'Corrieri'],
  '41': ['Costruzioni', 'Edilizia'], '42': ['Opere Stradali', 'Scavi'], '43': ['Impianti', 'Termoidraulica', 'Elettroimpianti'],
  '45': ['Autosalone', 'Car Service', 'Carrozzeria'], '46': ['Distribuzione', 'Forniture', 'Commerciale'],
  '81': ['Servizi Pulizia', 'Multiservizi'], '80': ['Vigilanza'], '77': ['Noleggio Veicoli', 'Rent'],
  '86': ['Centro Medico', 'Poliambulatorio'], '87': ['RSA', 'Residenza'], '88': ['Cooperativa Sociale'],
  '38': ['Ecologia', 'Ambiente Servizi'], '35': ['Energia'], '47': ['Market', 'Store'],
}
const FORME = ['S.r.l.', 'S.p.A.', 'S.n.c.', 'S.r.l.']

/** Genera aziende plausibili a partire dai conteggi ISTAT della zona (solo per prova). */
export function generaDemo(zona: Zona, minDipendenti = 10): Azienda[] {
  const out: Azienda[] = []
  const usati = new Set<string>()
  const rand = rng(Math.round(zona.centro.lat * 1e4) ^ Math.round(zona.centro.lon * 1e4) ^ zona.raggioKm)
  const classi: [number, number, number][] = [
    [1, 0, 9], [2, 10, 49], [3, 50, 249], [4, 250, 1200],
  ]
  for (const z of zona.comuni) {
    if (!z.ul) continue
    for (const [div, v] of Object.entries(z.ul)) {
      if (!/^\d{2}$/.test(div)) continue
      for (const [ci, lo, hi] of classi) {
        if (hi < minDipendenti) continue
        const atteso = v[ci * 2] * z.quota
        let n = Math.floor(atteso)
        if (rand() < atteso - n) n++
        for (let i = 0; i < n; i++) {
          const cognome = COGNOMI[Math.floor(rand() * COGNOMI.length)]
          const parole = PAROLE[div] ?? ['Industrie', 'Servizi', 'Group']
          const secondo = rand() < 0.6 ? ` & ${COGNOMI[Math.floor(rand() * COGNOMI.length)]}` : ''
          let nome = `${parole[Math.floor(rand() * parole.length)]} ${cognome}${secondo} ${FORME[Math.floor(rand() * FORME.length)]}`
          if (usati.has(nome)) nome = `${nome.replace(/ \S+$/, '')} ${usati.size} ${FORME[0]}`
          usati.add(nome)
          const dip = Math.max(minDipendenti, Math.round(lo + (hi - lo) * rand() ** 2))
          const ang = rand() * Math.PI * 2
          const dist = Math.sqrt(rand()) * Math.min(3, Math.sqrt(z.comune.km2) / 2)
          const lat = z.comune.lat + (dist / 111) * Math.sin(ang)
          const lon = z.comune.lon + (dist / (111 * Math.cos((z.comune.lat * Math.PI) / 180))) * Math.cos(ang)
          if (distanzaKm(zona.centro.lat, zona.centro.lon, lat, lon) > zona.raggioKm) continue
          const piva = String(Math.floor(rand() * 1e11)).padStart(11, '0')
          out.push(
            arricchisci(
              {
                id: `demo-${piva}`,
                ragioneSociale: nome.toUpperCase(),
                piva,
                ateco: `${div}.${String(Math.floor(rand() * 9) + 1).padStart(2, '0')}`,
                atecoDescr: '',
                dipendenti: dip,
                fatturato: Math.round(dip * (80000 + rand() * 170000)),
                annoBilancio: 2024,
                formaGiuridica: '',
                indirizzo: `VIA ${COGNOMI[Math.floor(rand() * COGNOMI.length)].toUpperCase()} ${Math.floor(rand() * 120) + 1}`,
                cap: '',
                comune: z.comune.n.toUpperCase(),
                provincia: z.comune.p,
                pec: '',
                lat,
                lon,
                fonte: 'demo',
              },
              zona.centro,
            ),
          )
        }
      }
    }
  }
  return out.sort((a, b) => (b.dipendenti ?? 0) - (a.dipendenti ?? 0))
}
