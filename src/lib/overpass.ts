// Richieste a Overpass (dati OpenStreetMap). I server pubblici sono gratuiti e a volte sovraccarichi:
// si prova più server, poi si riprova dopo una breve pausa. Le ricerche per rettangolo (bbox) pesano
// molto meno di quelle per raggio (around); la distanza esatta si controlla poi nel programma.

export const SERVER_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/** Rettangolo "sud,ovest,nord,est" che contiene il cerchio. */
export function bbox(lat: number, lon: number, raggioKm: number): string {
  const dLat = raggioKm / 111.32
  const dLon = raggioKm / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)))
  const f = (x: number) => x.toFixed(5)
  return `${f(lat - dLat)},${f(lon - dLon)},${f(lat + dLat)},${f(lon + dLon)}`
}

export interface OpzioniOverpass {
  http?: typeof fetch
  server?: string[]
  /** attesa massima per ogni server */
  scadenzaMs?: number
  /** quante volte si ripercorre l'elenco dei server prima di arrendersi */
  giri?: number
  pausaMs?: number
}

const messaggio = (e: unknown) => {
  const err = e as Error
  if (err?.name === 'AbortError') return 'tempo scaduto'
  const m = err?.message ?? String(e)
  const http = m.match(/^HTTP (\d+)/)
  if (http && /^(429|502|503|504)$/.test(http[1])) return `server sovraccarico (HTTP ${http[1]})`
  return m
}

export async function interrogaOverpass<T = { elements?: unknown[] }>(query: string, o: OpzioniOverpass = {}): Promise<T> {
  const { http = fetch, server = SERVER_OVERPASS, scadenzaMs = 60000, giri = 2, pausaMs = 4000 } = o
  let ultimo = ''
  for (let giro = 0; giro < giri; giro++) {
    if (giro) await new Promise((ok) => setTimeout(ok, pausaMs))
    for (const url of server) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), scadenzaMs)
      try {
        const res = await http(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = (await res.json()) as T & { remark?: string }
        if (j.remark && /timed out|out of memory|runtime error/i.test(j.remark)) throw new Error('server sovraccarico (richiesta troppo grande)')
        return j
      } catch (e) {
        ultimo = messaggio(e)
      } finally {
        clearTimeout(t)
      }
    }
  }
  throw new Error(`OpenStreetMap non risponde: ${ultimo}. I server pubblici sono gratuiti e a volte sovraccarichi: riprova tra qualche minuto.`)
}
