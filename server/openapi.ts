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
  /** nell'app per PC è net.fetch di Electron: usa proxy e certificati di Windows, come il browser */
  http?: typeof fetch
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

const NOME_HOST = (env: Ambiente) => (env.OPENAPI_SANDBOX === '1' ? 'test.company.openapi.com' : 'company.openapi.com')

/** Rete irraggiungibile: cosa è successo davvero (DNS, certificato, connessione) e cosa controllare. */
export function spiegaRete(e: unknown, env: Ambiente): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string } }
  const motivo = [err?.cause?.code, err?.cause?.message ?? err?.message].filter(Boolean).join(' · ')
  const codice = `${err?.cause?.code ?? ''} ${err?.message ?? ''}`
  let consiglio = 'Controlla la connessione a internet.'
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/.test(codice)) consiglio = 'Il nome del sito non si risolve: controlla internet o il DNS aziendale.'
  else if (/CERT|SSL|TLS|SIGNATURE|SELF_SIGNED/i.test(codice)) consiglio = 'Problema di certificato: tipico di un proxy aziendale che ispeziona il traffico. Chiedi all\'IT di sbloccare il sito.'
  else if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_CONNECTION|ERR_PROXY|ERR_TUNNEL|fetch failed/i.test(codice)) consiglio = 'Probabile proxy o firewall aziendale: chiedi all\'IT di consentire il sito.'
  return `Non riesco a raggiungere Openapi (${NOME_HOST(env)}). ${consiglio}${motivo ? ` Dettaglio: ${motivo}` : ''}`
}

/** Messaggio in italiano per gli errori di Openapi più comuni: cosa è successo e cosa fare. */
export function spiegaErrore(status: number, dettaglio: string, env: Ambiente): string {
  const prova = env.OPENAPI_SANDBOX === '1'
  const ambito = `GET ${NOME_HOST(env)}/IT-search`
  const coppia = prova
    ? 'Con "Ambiente di prova" spuntato serve un token creato per il sandbox.'
    : 'Senza "Ambiente di prova" serve un token di produzione. Se hai solo quello del sandbox, rimetti la spunta.'
  if (status === 401) return `Openapi non riconosce il token (401): è sbagliato, scaduto o incollato incompleto. ${coppia}`
  if (status === 403) return `Il token non ha il permesso per cercare imprese (403). Alla creazione del token serve l'ambito: ${ambito}. ${coppia}`
  if (status === 402) return `Credito insufficiente su Openapi (402). ${prova ? 'Nel sandbox assegna un credito di prova in Preferenze → Sandbox.' : 'Ricarica il portafoglio nella console.'}`
  if (status === 429) return 'Troppe richieste a Openapi (429): aspetta un minuto e riprova.'
  if (status >= 500) return `Openapi non risponde (${status}): riprova tra poco.`
  return `Openapi ${status}: ${dettaglio}`
}

async function chiama(env: Ambiente, p: URLSearchParams) {
  let res: Response
  try {
    res = await (env.http ?? fetch)(`${host(env)}/IT-search?${p}`, {
      headers: { Authorization: `Bearer ${env.OPENAPI_TOKEN}`, Accept: 'application/json' },
    })
  } catch (e) {
    throw new Error(spiegaRete(e, env))
  }
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = { message: text.slice(0, 300) }
  }
  if (!res.ok) {
    const msg = (body as { message?: string })?.message ?? res.statusText
    throw new Error(spiegaErrore(res.status, msg, env))
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
  if (!(r.raggioKm > 0 && r.raggioKm <= 100)) throw new Error('Raggio non valido (da 100 m a 100 km)')
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

/** Prova gratuita del token: una ricerca dryRun (solo conteggio) su Milano, nell'ambiente scelto. */
export async function provaToken(env: Ambiente): Promise<{ ok: boolean; messaggio: string }> {
  if (!env.OPENAPI_TOKEN) return { ok: false, messaggio: 'Nessun token inserito: incollalo qui sopra e salva.' }
  try {
    const p = parametri({ azione: 'stima', lat: 45.4642, lon: 9.19, raggioKm: 1 }, undefined)
    p.set('dryRun', '1')
    const body = await chiama(env, p)
    const s = leggiStima(body)
    const dove = env.OPENAPI_SANDBOX === '1' ? 'ambiente di prova (sandbox)' : 'produzione'
    return { ok: true, messaggio: `Il token funziona in ${dove}.${s.conteggio !== null ? ` Risposta di prova: ${s.conteggio} imprese${s.prezzo !== null ? `, costo stimato ${s.prezzo} €` : ''}.` : ''}` }
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message }
  }
}

/** Con il token Openapi configurato la password è obbligatoria: protegge il credito. */
export function autorizzato(chiave: string | null | undefined, env: Ambiente) {
  if (!env.APP_PASSWORD) return !env.OPENAPI_TOKEN
  return chiave === env.APP_PASSWORD
}
