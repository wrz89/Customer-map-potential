// Import dell'elenco dealer da Excel/CSV.
// Formato tipico della rete: Ragione Sociale | Indirizzo | Cap | Città (Provincia, Lat, Lon, Raggio facoltative).
import { numero, type Righe } from './leggiFile'

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
      raggioKm: col.raggio ? numero(v(r, col.raggio)) : null,
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
