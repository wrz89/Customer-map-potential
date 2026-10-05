// Proxy verso Openapi Company (IT-search). Gira solo lato server: il token
// non arriva mai al browser. Usato dalla funzione Vercel (api/companies.ts)
// e dal server di sviluppo (vite.config.ts).

export interface RichiestaAziende {
  azione: 'stima' | 'acquista'
  lat: number
  lon: number
  raggioKm: number
  ateco?: string[]
  minDipendenti?: number
  maxDipendenti?: number
  maxRecord?: number
}

export interface Ambiente {
  OPENAPI_TOKEN?: string
  OPENAPI_SANDBOX?: string
  APP_PASSWORD?: string
}

const LIMITE_PAGINA = 1000
const MAX_RECORD_DEFAULT = 5000

function host(env: Ambiente) {
  return env.OPENAPI_SANDBOX === '1' ? 'https://test.company.openapi.com' : 'https://company.openapi.com'
}

function parametri(r: RichiestaAziende, ateco: string | undefined) {
  const p = new URLSearchParams({
    lat: String(r.lat),
    long: String(r.lon),
    radius: String(Math.round(r.raggioKm * 1000)),
    activityStatus: 'ATTIVA',
  })
  if (ateco) p.set('atecoCode', ateco)
  if (r.minDipendenti) p.set('minEmployees', String(r.minDipendenti))
  if (r.maxDipendenti) p.set('maxEmployees', String(r.maxDipendenti))
  return p
}

async function chiama(env: Ambiente, p: URLSearchParams) {
  const res = await fetch(`${host(env)}/IT-search?${p}`, {
    headers: { Authorization: `Bearer ${env.OPENAPI_TOKEN}`, Accept: 'application/json' },
  })
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = { message: text.slice(0, 300) }
  }
  if (!res.ok) {
    const msg = (body as { message?: string })?.message ?? res.statusText
    throw new Error(`Openapi ${res.status}: ${msg}`)
  }
  return body as { data: unknown; success?: boolean; message?: string }
}

/** Estrae conteggio e prezzo dalla risposta dryRun, qualunque sia la forma esatta. */
export function leggiStima(body: unknown): { conteggio: number | null; prezzo: number | null } {
  let conteggio: number | null = null
  let prezzo: number | null = null
  const visita = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o)) {
      const key = k.toLowerCase()
      if (typeof v === 'number') {
        if (conteggio === null && /(count|total|record|results|numero)/.test(key)) conteggio = v
        if (prezzo === null && /(price|cost|prezzo|amount)/.test(key)) prezzo = v
      } else if (typeof v === 'object') visita(v)
    }
  }
  visita((body as { data?: unknown })?.data ?? body)
  return { conteggio, prezzo }
}

export async function gestisci(r: RichiestaAziende, env: Ambiente) {
  if (!env.OPENAPI_TOKEN) {
    return { demo: true, messaggio: 'Token Openapi non configurato: l\'app usa dati dimostrativi.' }
  }
  if (!(r.raggioKm > 0 && r.raggioKm <= 100)) throw new Error('Raggio non valido (1-100 km)')
  const codici = r.ateco?.length ? r.ateco : [undefined]

  if (r.azione === 'stima') {
    const righe = []
    for (const a of codici) {
      const p = parametri(r, a)
      p.set('dryRun', '1')
      // stesso livello di dettaglio dell'acquisto, così il prezzo stimato è quello vero
      p.set('dataEnrichment', 'advanced')
      const body = await chiama(env, p)
      righe.push({ ateco: a ?? null, ...leggiStima(body), grezzo: body.data })
    }
    const conteggio = righe.every((x) => x.conteggio !== null) ? righe.reduce((s, x) => s + (x.conteggio ?? 0), 0) : null
    const prezzo = righe.every((x) => x.prezzo !== null) ? righe.reduce((s, x) => s + (x.prezzo ?? 0), 0) : null
    return { demo: false, sandbox: env.OPENAPI_SANDBOX === '1', conteggio, prezzo, righe }
  }

  const max = Math.min(r.maxRecord ?? MAX_RECORD_DEFAULT, 20000)
  const aziende: unknown[] = []
  for (const a of codici) {
    for (let skip = 0; aziende.length < max; skip += LIMITE_PAGINA) {
      const p = parametri(r, a)
      p.set('dataEnrichment', 'advanced')
      p.set('limit', String(Math.min(LIMITE_PAGINA, max - aziende.length)))
      if (skip) p.set('skip', String(skip))
      const body = await chiama(env, p)
      const page = Array.isArray(body.data) ? body.data : []
      aziende.push(...page)
      if (page.length < LIMITE_PAGINA) break
    }
  }
  return { demo: false, sandbox: env.OPENAPI_SANDBOX === '1', aziende, troncato: aziende.length >= max }
}

/** Con il token Openapi configurato la password è obbligatoria: protegge il credito. */
export function autorizzato(chiave: string | null | undefined, env: Ambiente) {
  if (!env.APP_PASSWORD) return !env.OPENAPI_TOKEN
  return chiave === env.APP_PASSWORD
}
