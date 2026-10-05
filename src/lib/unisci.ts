// Completa le attività di OpenStreetMap (posizione esatta, telefono, ma niente partita IVA né addetti)
// con gli elenchi Telemaco / Openapi (partita IVA, ATECO, addetti, ma spesso senza coordinate esatte):
// stessa impresa = un solo record, con i dati migliori di entrambe le fonti.
import { chiaveNome } from './importaDealer'
import { distanzaKm } from './geo'
import { inComune, type Azienda } from './companies'
import { normalizzaNome, somiglianza, tokens } from './match'

/** Somiglianza minima tra i nomi per considerare due record la stessa impresa. */
export const SOGLIA_UNIONE = 0.9

export function unisciConOsm(aziende: Azienda[]): { elenco: Azienda[]; uniti: Set<string> } {
  const osm = aziende.filter((a) => a.fonte === 'osm')
  if (!osm.length) return { elenco: aziende, uniti: new Set() }
  const altre = aziende.filter((a) => a.fonte !== 'osm')
  const nomi = osm.map((o) => normalizzaNome(o.ragioneSociale))
  const perToken = new Map<string, number[]>()
  nomi.forEach((n, i) => {
    for (const t of tokens(n)) {
      if (t.length < 4) continue
      const l = perToken.get(t) ?? []
      l.push(i)
      perToken.set(t, l)
    }
  })
  const usati = new Set<number>()
  const uniti = new Set<string>()
  const elenco = altre.map((a) => {
    if (a.fonte === 'demo') return a
    const nome = normalizzaNome(a.ragioneSociale)
    const candidati = new Set<number>()
    for (const t of tokens(nome)) for (const i of perToken.get(t) ?? []) candidati.add(i)
    let migliore = -1
    let punteggio = 0
    for (const i of candidati) {
      if (usati.has(i)) continue
      const o = osm[i]
      // stesso posto: se la posizione dell'altra è esatta, a pochi metri; se è al centro del comune, stesso comune (quando OSM lo dice)
      if (!inComune(a) && a.lat !== null && a.lon !== null && o.lat !== null && o.lon !== null && distanzaKm(a.lat, a.lon, o.lat, o.lon) > 0.25) continue
      if (inComune(a) && a.comune && o.comune && chiaveNome(a.comune) !== chiaveNome(o.comune)) continue
      const s = somiglianza(nome, nomi[i])
      if (s > punteggio) {
        punteggio = s
        migliore = i
      }
    }
    if (migliore < 0 || punteggio < SOGLIA_UNIONE) return a
    usati.add(migliore)
    uniti.add(a.id)
    const o = osm[migliore]
    return {
      ...a,
      lat: o.lat,
      lon: o.lon,
      posizione: 'indirizzo' as const,
      cercato: true,
      indirizzo: a.indirizzo || o.indirizzo,
      cap: a.cap || o.cap,
      contatto: a.contatto || o.contatto,
    }
  })
  return { elenco: [...elenco, ...osm.filter((_, i) => !usati.has(i))], uniti }
}
