// Import dell'elenco dealer da Excel/CSV.
// Formato tipico della rete: Ragione Sociale | Indirizzo | Cap | Città (Provincia, Lat, Lon, Raggio facoltative).
import { numero, type Righe } from './leggiFile'
import { leggiRaggio } from './raggio'

export type Precisione = 'indirizzo' | 'cap' | 'comune'

export interface RigaDealer {
  nome: string
  via: string
  cap: string
  citta: string
  provincia: string
  lat: number | null
  lon: number | null
  raggioKm: number | null
}

export interface Ricerca {
  via?: string
  cap?: string
  citta?: string
  testo?: string
}

const trova = (intestazioni: string[], re: RegExp) => intestazioni.find((h) => re.test(h.trim()))

/** "PARMA" → "Parma", "SAN DONATO MILANESE" → "San Donato Milanese"; lascia stare chi usa già le minuscole. */
export function nomeProprio(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
}

/** Excel trasforma 00100 in 100: si rimettono gli zeri iniziali. */
export function normalizzaCap(s: string): string {
  const c = s.replace(/\D/g, '')
  return c && c.length <= 5 ? c.padStart(5, '0') : ''
}

/** Raggio dal file: la colonna può essere in km (predefinito) o in metri se il titolo dice "metri" o "(m)". */
function raggioDaCella(valore: string, titolo: string): number | null {
  const n = leggiRaggio(/km/i.test(valore) || /m(etri)?\b/i.test(valore) ? valore : `${valore} ${/\(m\)|metri|\bm$/i.test(titolo.trim()) ? 'm' : 'km'}`)
  return n
}

export function colonneDealer(intestazioni: string[]) {
  const col = {
    nome: trova(intestazioni, /(ragione\s*sociale|denominazione|dealer|^nome|punto\s*vendita|centro|rag\.?\s*soc)/i),
    via: trova(intestazioni, /(indirizzo|^via$|address)/i),
    cap: trova(intestazioni, /^c\.?a\.?p\.?$|postale/i),
    citta: trova(intestazioni, /(citt[aà]|comune|localit[aà]|city)/i),
    provincia: trova(intestazioni, /(^prov|provincia|^pr$|^sigla)/i),
    lat: trova(intestazioni, /^lat/i),
    lon: trova(intestazioni, /^(lon|lng)/i),
    raggio: trova(intestazioni, /raggio/i),
  }
  if (!col.nome || (!col.via && !col.citta && !(col.lat && col.lon))) {
    throw new Error(
      `Il file deve avere le colonne Ragione Sociale, Indirizzo, Cap e Città (Cap e Città aiutano a trovare l'indirizzo). Colonne lette: ${intestazioni.join(', ')}`,
    )
  }
  return col
}

export function leggiRigheDealer(intestazioni: string[], righe: Righe): RigaDealer[] {
  const col = colonneDealer(intestazioni)
  const v = (r: Record<string, string>, k?: string) => (k ? (r[k] ?? '').trim() : '')
  return righe
    .map((r) => ({
      nome: v(r, col.nome).replace(/\s+/g, ' '),
      via: v(r, col.via).replace(/\s+/g, ' '),
      cap: normalizzaCap(v(r, col.cap)),
      citta: nomeProprio(v(r, col.citta)),
      provincia: v(r, col.provincia).toUpperCase(),
      lat: col.lat ? numero(v(r, col.lat)) : null,
      lon: col.lon ? numero(v(r, col.lon)) : null,
      raggioKm: col.raggio ? raggioDaCella(v(r, col.raggio), col.raggio) : null,
    }))
    .filter((r) => r.nome)
}

/** Indirizzo leggibile: "Via Cerati, 5/c, 43100 Parma (PR)" */
export function indirizzoCompleto(r: RigaDealer): string {
  const luogo = [r.cap, r.citta].filter(Boolean).join(' ') + (r.provincia && r.provincia.length === 2 ? ` (${r.provincia})` : '')
  return [r.via, luogo].filter((x) => x.trim()).join(', ')
}

/**
 * Ricerche da provare in ordine, dalla più precisa alla più larga.
 * Gli indirizzi della rete sono spesso scritti a mano ("Zona Artigianale ... Via ..."):
 * se la via non si trova, il dealer si mette almeno nel CAP o nel comune, segnalandolo.
 */
export function ricercheDealer(r: RigaDealer): { q: Ricerca; precisione: Precisione }[] {
  const out: { q: Ricerca; precisione: Precisione }[] = []
  if (r.via) {
    out.push({ q: { via: r.via, cap: r.cap || undefined, citta: r.citta || undefined }, precisione: 'indirizzo' })
    // la sola parte da "Via ..." in poi, se prima c'è altro (zona industriale, località)
    const m = r.via.match(/\b(via|viale|v\.le|piazza|p\.zza|corso|c\.so|largo|strada|str\.|vicolo|località|loc\.)\s.+$/i)
    if (m && m.index) out.push({ q: { via: m[0], citta: r.citta || undefined, cap: r.cap || undefined }, precisione: 'indirizzo' })
    out.push({ q: { testo: indirizzoCompleto(r) }, precisione: 'indirizzo' })
    // "Zona Artigianale Zgonik Via ...": la zona industriale del comune è già una buona posizione
    const zona = r.via.match(/^(zona\s+(artigianale|industriale|commerciale|produttiva)|area\s+(artigianale|industriale)|z\.\s?[ia]\.)/i)
    if (zona && r.citta) out.push({ q: { testo: `${zona[0].replace(/^z\.\s?i\./i, 'Zona Industriale').replace(/^z\.\s?a\./i, 'Zona Artigianale')} ${r.citta}` }, precisione: 'indirizzo' })
  }
  if (r.cap && r.citta) out.push({ q: { cap: r.cap, citta: r.citta }, precisione: 'cap' })
  if (r.citta) out.push({ q: { citta: r.citta }, precisione: 'comune' })
  else if (r.cap) out.push({ q: { cap: r.cap }, precisione: 'cap' })
  return out
}

/* ---------- posizione immediata: comune dai dati ISTAT già nel programma ---------- */

export const chiaveNome = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// nomi d'uso diversi dal nome ufficiale ISTAT
const ALIAS: Record<string, string> = {
  reggioemilia: 'reggionellemilia',
  reggiocalabria: 'reggiodicalabria',
  bolzano: 'bolzanobozen',
}

export interface ComuneMinimo {
  n: string
  p: string
  lat: number
  lon: number
}

/** Indice nome → comuni: nome ufficiale, più le parti dei nomi doppi ("Sgonico-Zgonik", "Bolzano/Bozen"). */
export function indiceComuni<T extends ComuneMinimo>(comuni: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  const metti = (k: string, c: T) => {
    if (!k) return
    const l = m.get(k)
    if (!l) m.set(k, [c])
    else if (!l.includes(c)) l.push(c)
  }
  for (const c of comuni) metti(chiaveNome(c.n), c)
  for (const c of comuni) {
    for (const parte of c.n.split(/[/-]/)) {
      const k = chiaveNome(parte)
      if (k.length > 3 && !m.has(k)) metti(k, c)
    }
  }
  return m
}

/** Il comune della riga: per nome, e tra gli omonimi per provincia. */
export function trovaComune<T extends ComuneMinimo>(r: Pick<RigaDealer, 'citta' | 'provincia'>, indice: Map<string, T[]>): T | null {
  const tra = r.citta.match(/\(([A-Za-z]{2})\)\s*$/)
  const prov = (tra?.[1] ?? r.provincia).toUpperCase()
  let k = chiaveNome(r.citta.replace(/\([^)]*\)\s*$/, ''))
  k = ALIAS[k] ?? k
  const l = indice.get(k)
  if (!l?.length) return null
  return (prov.length === 2 && l.find((c) => c.p === prov)) || l[0]
}

/* ---------- posizione esatta, in sottofondo ---------- */

export type Cercatore = (q: Ricerca) => Promise<{ lat: number; lon: number } | null>

/**
 * Prova solo le ricerche "a indirizzo" (massimo tre): il comune lo abbiamo già.
 * Tra una richiesta in rete e l'altra si aspetta (limite del servizio: una al secondo);
 * le ricerche già in memoria non aspettano.
 */
export async function affinaPosizione(r: RigaDealer, cerca: Cercatore, inMemoria: (q: Ricerca) => boolean, attesa = 1100) {
  const prove = ricercheDealer(r).filter((t) => t.precisione === 'indirizzo' && !t.q.testo?.includes(','))
  for (const [i, t] of prove.entries()) {
    if (i && !inMemoria(t.q)) await new Promise((ok) => setTimeout(ok, attesa))
    const p = await cerca(t.q)
    if (p) return p
  }
  return null
}

/** Riga dell'import ricostruita dai campi salvati nel dealer. */
export const rigaDaDealer = (d: { nome: string; via?: string; cap?: string; citta?: string }): RigaDealer => ({
  nome: d.nome,
  via: d.via ?? '',
  cap: d.cap ?? '',
  citta: d.citta ?? '',
  provincia: '',
  lat: null,
  lon: null,
  raggioKm: null,
})
