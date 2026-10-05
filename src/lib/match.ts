// Confronto tra le aziende della zona e la lista clienti del dealer.

export type StatoMatch = 'Già cliente' | 'Probabile cliente' | 'Da verificare' | 'Nuovo'

export const STATI: StatoMatch[] = ['Già cliente', 'Probabile cliente', 'Da verificare', 'Nuovo']

// Forme giuridiche e parole che non distinguono un'azienda dall'altra.
// La stessa normalizzazione è replicata con formule nell'Excel (excel.ts):
// se cambi queste liste, cambiano anche le formule.
export const CARATTERI_TOLTI = ['.', "'", '\u2019', ',']
export const CARATTERI_SPAZIO = ['&', '-', '/', '(', ')', '"', ';', ':']
export const FRASI_GIURIDICHE = [
  'SOCIETA A RESPONSABILITA LIMITATA SEMPLIFICATA',
  'SOCIETA A RESPONSABILITA LIMITATA',
  'SOCIETA PER AZIONI',
  'SOCIETA IN NOME COLLETTIVO',
  'SOCIETA IN ACCOMANDITA SEMPLICE',
  'SOCIETA COOPERATIVA',
  'IN SIGLA',
]
export const FORME_TOKEN = ['SRLS', 'SRL', 'SPA', 'SNC', 'SAS', 'SAPA', 'SCARL', 'SCRL', 'SC', 'SS', 'SOC', 'COOP', 'UNIPERSONALE', 'DITTA']
const FORME_SET = new Set(FORME_TOKEN)

const STOP = new Set(['DI', 'DEL', 'DELLA', 'DEI', 'DE', 'E', 'ED', 'LA', 'IL', 'LO', 'GLI', 'LE', 'C', 'FLLI', 'FRATELLI', 'SOCIETA', 'COOPERATIVA'])

export function normalizzaNome(s: string | null | undefined): string {
  if (!s) return ''
  let x = String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const ch of CARATTERI_TOLTI) x = x.split(ch).join('')
  for (const ch of CARATTERI_SPAZIO) x = x.split(ch).join(' ')
  x = ` ${x.replace(/[^A-Z0-9]+/g, ' ')} `
  for (const f of FRASI_GIURIDICHE) x = x.split(` ${f} `).join(' ')
  return x
    .split(' ')
    .filter((t) => t && !FORME_SET.has(t))
    .join(' ')
}

export function normalizzaPiva(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  const d = String(s).toUpperCase().replace(/^IT/, '').replace(/\D/g, '')
  if (!d) return ''
  return d.length < 11 ? d.padStart(11, '0') : d
}

export function normalizzaIndirizzo(via: string | null | undefined, comune?: string | null): string {
  const v = normalizzaNome(via)
    .replace(/\b(VIA|VIALE|VLE|PIAZZA|PZZA|PZA|CORSO|CSO|STRADA|STR|LOCALITA|LOC|FRAZIONE|FRAZ)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${v}|${normalizzaNome(comune)}`
}

function tokens(s: string): string[] {
  return s.split(' ').filter((t) => t.length > 1 && !STOP.has(t))
}

function bigrammi(s: string): Map<string, number> {
  const m = new Map<string, number>()
  const x = s.replace(/ /g, '')
  for (let i = 0; i < x.length - 1; i++) {
    const b = x.slice(i, i + 2)
    m.set(b, (m.get(b) ?? 0) + 1)
  }
  return m
}

/** Somiglianza 0-1 tra due nomi già normalizzati: il massimo tra Dice sui bigrammi e copertura dei token. */
export function somiglianza(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const ba = bigrammi(a)
  const bb = bigrammi(b)
  let inter = 0
  let na = 0
  let nb = 0
  for (const v of ba.values()) na += v
  for (const v of bb.values()) nb += v
  for (const [k, v] of ba) inter += Math.min(v, bb.get(k) ?? 0)
  const dice = na + nb ? (2 * inter) / (na + nb) : 0
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (!ta.size || !tb.size) return dice
  let comuni = 0
  for (const t of ta) if (tb.has(t)) comuni++
  // tutte le parole del nome più corto presenti nell'altro
  // (es. "ROSSI TRASPORTI" dentro "AUTOTRASPORTI ROSSI TRASPORTI MARIO")
  const piccolo = Math.min(ta.size, tb.size)
  const copertura = comuni / piccolo
  const jaccard = comuni / (ta.size + tb.size - comuni)
  let perParole = copertura * 0.85 + jaccard * 0.15
  // una sola parola in comune ("ROSSI") non basta per dire "probabile cliente"
  if (piccolo < 2 && jaccard < 1) perParole = Math.min(perParole, 0.8)
  return Math.max(dice, perParole)
}

export interface Cliente {
  ragioneSociale: string
  piva?: string
  indirizzo?: string
  comune?: string
}

export interface Prospect {
  id: string
  ragioneSociale: string
  piva?: string
  indirizzo?: string
  comune?: string
}

export interface EsitoMatch {
  stato: StatoMatch
  punteggio: number
  cliente?: Cliente
  motivo: string
}

export const SOGLIA_PROBABILE = 0.88
export const SOGLIA_VERIFICA = 0.72

export function preparaClienti(clienti: Cliente[]) {
  const perPiva = new Map<string, Cliente>()
  const perIndirizzo = new Map<string, Cliente>()
  const lista = clienti
    .filter((c) => c.ragioneSociale || c.piva)
    .map((c) => {
      const piva = normalizzaPiva(c.piva)
      if (piva) perPiva.set(piva, c)
      if (c.indirizzo) perIndirizzo.set(normalizzaIndirizzo(c.indirizzo, c.comune), c)
      return { c, nome: normalizzaNome(c.ragioneSociale) }
    })
  // indice per token per non confrontare tutto con tutto
  const perToken = new Map<string, number[]>()
  lista.forEach((x, i) => {
    for (const t of tokens(x.nome)) {
      const arr = perToken.get(t) ?? []
      arr.push(i)
      perToken.set(t, arr)
    }
  })
  return { perPiva, perIndirizzo, lista, perToken }
}

export function confronta(p: Prospect, idx: ReturnType<typeof preparaClienti>): EsitoMatch {
  const piva = normalizzaPiva(p.piva)
  if (piva && idx.perPiva.has(piva)) {
    return { stato: 'Già cliente', punteggio: 1, cliente: idx.perPiva.get(piva), motivo: 'Partita IVA uguale' }
  }
  const nome = normalizzaNome(p.ragioneSociale)
  let best = 0
  let bestCliente: Cliente | undefined
  const candidati = new Set<number>()
  for (const t of tokens(nome)) for (const i of idx.perToken.get(t) ?? []) candidati.add(i)
  // con pochi clienti si confronta tutto, con molti solo chi condivide almeno una parola
  const pool = idx.lista.length <= 3000 ? idx.lista.map((_, i) => i) : [...candidati]
  for (const i of pool) {
    const s = somiglianza(nome, idx.lista[i].nome)
    if (s > best) {
      best = s
      bestCliente = idx.lista[i].c
    }
  }
  if (best >= SOGLIA_PROBABILE) {
    return { stato: 'Probabile cliente', punteggio: best, cliente: bestCliente, motivo: best === 1 ? 'Stesso nome' : 'Nome molto simile' }
  }
  if (p.indirizzo) {
    const c = idx.perIndirizzo.get(normalizzaIndirizzo(p.indirizzo, p.comune))
    if (c) return { stato: 'Da verificare', punteggio: Math.max(best, 0.7), cliente: c, motivo: 'Stesso indirizzo' }
  }
  if (best >= SOGLIA_VERIFICA) {
    return { stato: 'Da verificare', punteggio: best, cliente: bestCliente, motivo: 'Nome simile' }
  }
  return { stato: 'Nuovo', punteggio: best, motivo: 'Nessuna corrispondenza' }
}
