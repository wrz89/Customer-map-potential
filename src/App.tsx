import {
  Building2,
  Car,
  Download,
  Factory,
  Layers,
  Moon,
  Pencil,
  Plus,
  Upload,
  Settings,
  Sun,
  Truck,
  Users,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Aziende from './components/Aziende'
import Confronto from './components/Confronto'
import { CampoRaggio } from './components/CampoRaggio'
import { DealerForm } from './components/DealerForm'
import { Impostazioni } from './components/Impostazioni'
import MapView, { type Centro, type Metrica } from './components/MapView'
import Settori from './components/Settori'
import Territorio from './components/Territorio'
import { Avviso, Kpi, KpiRiga } from './components/ui'
import type { Azienda } from './lib/companies'
import { DEMO, salvaFile } from './lib/ambiente'
import { generaDemo, inComune } from './lib/companies'
import { areaCopre, caricaConcorrenzaOsm, daRegistro, filtraConcorrenti, unisciConcorrenti, type AreaOsm } from './lib/concorrenza'
import { loadComuni, loadMeta, type Meta } from './lib/data'
import { quotaVecchie } from './lib/eta'
import { compatto, n0, pct } from './lib/fmt'
import { distanzaKm } from './lib/geo'
import { confronta, preparaClienti, type Cliente, type EsitoMatch } from './lib/match'
import {
  acquistiDealer,
  caricaClienti,
  caricaDealer,
  caricaImpostazioni,
  cercaPosizione,
  eliminaAcquisto,
  giaCercata,
  eliminaClienti,
  salvaAcquisto,
  salvaClienti,
  salvaDealer,
  salvaImpostazioni,
  type Acquisto,
  type Dealer,
  type ListaClienti,
} from './lib/store'
import { affinaPosizione, chiaveNome, indiceComuni, rigaDaDealer } from './lib/importaDealer'
import { calcolaZona, type Concorrente, type Zona } from './lib/zone'

type Tab = 'mappa' | 'territorio' | 'settori' | 'aziende' | 'confronto'
const TABS: { id: Tab; nome: string }[] = [
  { id: 'mappa', nome: 'Mappa' },
  { id: 'territorio', nome: 'Territorio' },
  { id: 'settori', nome: 'Settori' },
  { id: 'aziende', nome: 'Aziende' },
  { id: 'confronto', nome: 'Confronto clienti' },
]

function temaIniziale(): 'light' | 'dark' {
  // una scelta esplicita della pagina che ci ospita vale per prima
  const ospite = document.documentElement.dataset.theme
  if (ospite === 'light' || ospite === 'dark') return ospite
  try {
    const t = localStorage.getItem('cmp.tema')
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* storage non disponibile */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const PRIORITA_FONTE: Record<Azienda['fonte'], number> = { openapi: 4, import: 3, demo: 2, osm: 1 }

export default function App() {
  const [dealer, setDealer] = useState<Dealer[]>(caricaDealer)
  const [selId, setSelId] = useState<string | null>(() => caricaDealer()[0]?.id ?? null)
  const [raggio, setRaggio] = useState<number>(() => caricaDealer()[0]?.raggioKm ?? 15)
  const [zona, setZona] = useState<Zona | null>(null)
  const [calcolo, setCalcolo] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [tab, setTab] = useState<Tab>('mappa')
  const [metrica, setMetrica] = useState<Metrica>('autovetture')
  const [tema, setTema] = useState<'light' | 'dark'>(temaIniziale)
  const [imp, setImp] = useState(caricaImpostazioni)
  const [acquisti, setAcquisti] = useState<Acquisto[]>([])
  const [lista, setLista] = useState<ListaClienti | undefined>()
  const [modale, setModale] = useState<'nuovo' | 'modifica' | 'impostazioni' | null>(null)
  const [cercaDealer, setCercaDealer] = useState('')
  const [comuneEvid, setComuneEvid] = useState<string | null>(null)
  const [esporto, setEsporto] = useState(false)
  // punto esplorato sulla mappa: sostituisce il dealer come centro dell'analisi
  const [esplorato, setEsplorato] = useState<{ lat: number; lon: number; nome: string } | null>(null)
  const [preset, setPreset] = useState<Partial<Dealer> | null>(null)

  const sel = dealer.find((d) => d.id === selId) ?? null
  const centro: Centro | null = esplorato
    ? { ...esplorato, esplorativo: true }
    : sel
      ? { lat: sel.lat, lon: sel.lon, nome: sel.nome, esplorativo: false }
      : null

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    try {
      localStorage.setItem('cmp.tema', tema)
    } catch {
      /* ignora */
    }
  }, [tema])

  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  // calcolo zona (con piccolo ritardo mentre si trascina il cursore del raggio)
  useEffect(() => {
    if (!centro) {
      setZona(null)
      return
    }
    let annullato = false
    setCalcolo(true)
    setErrore(null)
    const t = setTimeout(() => {
      calcolaZona(centro.lat, centro.lon, raggio)
        .then((z) => !annullato && setZona(z))
        .catch((e) => !annullato && setErrore((e as Error).message))
        .finally(() => !annullato && setCalcolo(false))
    }, 250)
    return () => {
      annullato = true
      clearTimeout(t)
    }
  }, [centro?.lat, centro?.lon, raggio]) // eslint-disable-line react-hooks/exhaustive-deps

  const ricaricaDati = useCallback(async (id: string) => {
    const [a, l] = await Promise.all([acquistiDealer(id), caricaClienti(id)])
    setAcquisti(a.sort((x, y) => y.data.localeCompare(x.data)))
    setLista(l)
  }, [])

  useEffect(() => {
    if (selId) ricaricaDati(selId)
  }, [selId, ricaricaDati])

  // concorrenza: OpenStreetMap (gratis, parziale) + gommisti del Registro Imprese acquistati o importati.
  // Si carica un'area più larga della zona e si tiene sempre l'ultimo elenco buono: se il centro si sposta di poco,
  // o la richiesta è lenta o fallisce, i gommisti non spariscono.
  const [osm, setOsm] = useState<{ stato: 'carico' | 'ok' | 'errore' | 'assente'; area?: AreaOsm; tutti: Concorrente[]; data?: string; errore?: string }>({ stato: 'carico', tutti: [] })
  const richiestaOsm = useRef(0)
  const caricandoOsm = useRef(false)
  const tentativoFallito = useRef('')
  const chiaveOsm = (z: Zona) => `${z.centro.lat.toFixed(3)},${z.centro.lon.toFixed(3)},${z.raggioKm}`
  const caricaOsm = useCallback((z: Zona, forza = false) => {
    if (DEMO) return setOsm({ stato: 'assente', tutti: [] })
    const id = ++richiestaOsm.current
    const k = chiaveOsm(z)
    caricandoOsm.current = true
    if (forza) tentativoFallito.current = ''
    setOsm((x) => ({ ...x, stato: 'carico', errore: undefined }))
    caricaConcorrenzaOsm(z.centro.lat, z.centro.lon, z.raggioKm, forza)
      .then((r) => {
        if (id !== richiestaOsm.current) return
        caricandoOsm.current = false
        setOsm({ stato: 'ok', area: r.area, tutti: r.concorrenti, data: r.data })
      })
      .catch((e) => {
        if (id !== richiestaOsm.current) return
        caricandoOsm.current = false
        tentativoFallito.current = k
        setOsm((x) => ({ ...x, stato: 'errore', errore: (e as Error).message }))
      })
  }, [])
  const osmCopreZona = !!zona && !!osm.area && areaCopre(osm.area, zona.centro.lat, zona.centro.lon, zona.raggioKm)
  useEffect(() => {
    // si carica solo se l'area già in mano non copre la zona; dopo un errore si riprova cambiando zona o col pulsante Aggiorna
    if (!zona || osmCopreZona || caricandoOsm.current || tentativoFallito.current === chiaveOsm(zona)) return
    caricaOsm(zona)
  }, [zona, osmCopreZona, osm.stato, caricaOsm])

  // il comune di un'impresa è nella zona? (elenchi importati senza coordinate esatte)
  const indiceZona = useMemo(() => (zona ? indiceComuni(zona.comuni.map((z) => z.comune)) : null), [zona])
  const comuneInZona = useCallback((comune: string) => !indiceZona || indiceZona.has(chiaveNome(comune)), [indiceZona])

  const registro = useMemo(() => {
    if (!zona) return []
    const lista = acquisti.filter((a) => a.scopo === 'concorrenza').flatMap((a) => a.aziende)
    const unici = [...new Map(lista.map((a) => [a.piva || a.id, a])).values()]
    return daRegistro(unici, zona.centro.lat, zona.centro.lon, zona.raggioKm, comuneInZona)
  }, [acquisti, zona, comuneInZona])

  const zonaVista = useMemo<Zona | null>(() => {
    if (!zona) return null
    const osmZona = filtraConcorrenti(osm.tutti, zona.centro.lat, zona.centro.lon, zona.raggioKm)
    const conc = unisciConcorrenti(registro, osmZona)
    return {
      ...zona,
      concorrenti: conc,
      infoConcorrenza: {
        stato: osm.stato,
        data: osm.data,
        errore: osm.errore,
        osm: conc.filter((c) => c.fonte === 'osm').length,
        registro: registro.length,
      },
    }
  }, [zona, osm, registro])

  // demo: al primo calcolo di un dealer si generano le aziende dimostrative, così la mappa è subito piena
  const demoFatti = useRef(new Set<string>())
  useEffect(() => {
    if (!DEMO || !sel || !zona || esplorato || demoFatti.current.has(sel.id)) return
    if (Math.abs(zona.centro.lat - sel.lat) > 1e-6 || Math.abs(zona.centro.lon - sel.lon) > 1e-6) return
    demoFatti.current.add(sel.id)
    acquistiDealer(sel.id).then(async (gia) => {
      if (gia.length) return
      const lista = generaDemo(zona, 10)
      await salvaAcquisto({ id: `demo-${sel.id}`, dealerId: sel.id, data: new Date().toISOString(), raggioKm: zona.raggioKm, centro: zona.centro, filtri: { minDipendenti: 10 }, fonte: 'demo', conteggio: lista.length, prezzo: 0, aziende: lista })
      await ricaricaDati(sel.id)
    })
  }, [zona, sel, esplorato, ricaricaDati])

  function seleziona(d: Dealer) {
    setSelId(d.id)
    setRaggio(d.raggioKm)
    setComuneEvid(null)
    setEsplorato(null)
  }

  async function spostaCentro(lat: number, lon: number, nome?: string) {
    let etichetta = nome
    if (!etichetta) {
      // nome del comune più vicino, senza chiamate esterne
      const comuni = await loadComuni().catch(() => [])
      let best: { n: string; d: number } | null = null
      for (const c of comuni) {
        const d = distanzaKm(lat, lon, c.lat, c.lon)
        if (!best || d < best.d) best = { n: c.n, d }
      }
      etichetta = best ? `vicino a ${best.n}` : 'Punto esplorato'
    }
    setEsplorato({ lat, lon, nome: etichetta })
    setComuneEvid(null)
  }

  function aggiornaDealer(nuovi: Dealer[]) {
    setDealer(nuovi)
    salvaDealer(nuovi)
  }

  // Via esatta dei dealer importati, in sottofondo: uno alla volta, una richiesta al secondo.
  // Intanto il dealer è al centro del comune e si può già analizzare.
  const daAffinare = dealer.filter((d) => d.posizione && d.posizione !== 'indirizzo' && !d.cercato && (d.via || d.citta))
  const prossimoDaAffinare = DEMO ? undefined : daAffinare[0]
  useEffect(() => {
    const d = prossimoDaAffinare
    if (!d) return
    let annullato = false
    const t = setTimeout(async () => {
      const p = await affinaPosizione(rigaDaDealer(d), (q) => cercaPosizione(q).catch(() => null), giaCercata)
      if (annullato) return
      setDealer((prima) => {
        const nuovi = prima.map((x) => (x.id === d.id ? { ...x, ...(p ? { lat: p.lat, lon: p.lon, posizione: 'indirizzo' as const } : {}), cercato: true } : x))
        salvaDealer(nuovi)
        return nuovi
      })
    }, 1100)
    return () => {
      annullato = true
      clearTimeout(t)
    }
  }, [prossimoDaAffinare?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Posizione esatta delle imprese importate (Telemaco): con raggi piccoli il centro del comune non basta.
  // Solo le imprese dei comuni della zona, una al secondo, e solo dopo aver finito con i dealer.
  const acquistiRef = useRef(acquisti)
  acquistiRef.current = acquisti
  const daLocalizzare = useMemo(() => {
    if (DEMO || !zona || zona.raggioKm > 3 || daAffinare.length > 0) return []
    const out: { acqId: string; aziendaId: string; a: Azienda }[] = []
    for (const acq of acquisti)
      for (const a of acq.aziende)
        if (inComune(a) && !a.cercato && a.indirizzo.trim() && comuneInZona(a.comune)) out.push({ acqId: acq.id, aziendaId: a.id, a })
    return out
  }, [acquisti, zona, daAffinare.length, comuneInZona])
  const prossimaAzienda = daLocalizzare[0]
  const chiaveProssima = prossimaAzienda ? `${prossimaAzienda.acqId}|${prossimaAzienda.aziendaId}` : ''
  useEffect(() => {
    const p = prossimaAzienda
    if (!p) return
    let annullato = false
    const t = setTimeout(async () => {
      const riga = rigaDaDealer({ nome: p.a.ragioneSociale, via: p.a.indirizzo, cap: p.a.cap, citta: p.a.comune })
      const pos = await affinaPosizione(riga, (q) => cercaPosizione(q).catch(() => null), giaCercata)
      if (annullato) return
      const acq = acquistiRef.current.find((x) => x.id === p.acqId)
      if (!acq) return
      const nuovo: Acquisto = {
        ...acq,
        aziende: acq.aziende.map((x) =>
          x.id === p.aziendaId ? { ...x, ...(pos ? { lat: pos.lat, lon: pos.lon, posizione: 'indirizzo' as const } : { posizione: 'comune' as const }), cercato: true } : x,
        ),
      }
      setAcquisti((prima) => prima.map((x) => (x.id === nuovo.id ? nuovo : x)))
      salvaAcquisto(nuovo).catch(() => {})
    }, 1100)
    return () => {
      annullato = true
      clearTimeout(t)
    }
  }, [chiaveProssima]) // eslint-disable-line react-hooks/exhaustive-deps

  // aziende del dealer: unione degli acquisti, senza doppioni, dentro il raggio attuale
  const aziende = useMemo(() => {
    if (!sel) return []
    const m = new Map<string, Azienda>()
    for (const acq of acquisti) {
      if (acq.scopo === 'concorrenza') continue
      for (const a of acq.aziende) {
        const k = a.piva || a.id
        const prima = m.get(k)
        if (!prima || PRIORITA_FONTE[a.fonte] > PRIORITA_FONTE[prima.fonte]) m.set(k, a)
      }
    }
    return [...m.values()]
      .map((a) => (a.lat !== null && a.lon !== null && centro && !inComune(a) ? { ...a, distanzaKm: Math.round(distanzaKm(centro.lat, centro.lon, a.lat, a.lon) * 100) / 100 } : a))
      // posizione solo al centro del comune: conta se il comune è nella zona; altrimenti la distanza dal centro
      .filter((a) => {
        if (inComune(a)) return comuneInZona(a.comune)
        // senza coordinate (comune non nella zona): fuori dal raggio
        if (a.lat === null) return !a.comune || comuneInZona(a.comune)
        return a.distanzaKm === null || a.distanzaKm <= raggio
      })
  }, [acquisti, sel, centro?.lat, centro?.lon, raggio, comuneInZona]) // eslint-disable-line react-hooks/exhaustive-deps

  const esiti = useMemo(() => {
    const out = new Map<string, EsitoMatch>()
    if (!lista) return out
    const idx = preparaClienti(lista.clienti)
    const rapido = aziende.length > 3000
    for (const a of aziende) out.set(a.id, confronta({ id: a.id, ragioneSociale: a.ragioneSociale, piva: a.piva, indirizzo: a.indirizzo, comune: a.comune }, idx, rapido))
    return out
  }, [aziende, lista])

  async function esporta() {
    if (!sel || !zona) return
    setEsporto(true)
    try {
      const { creaExcel, nomeFile } = await import('./lib/excel')
      const soggetto: Dealer = esplorato
        ? { ...sel, id: 'esplorato', nome: `Punto esplorato ${esplorato.nome}`, indirizzo: `${esplorato.lat.toFixed(5)}, ${esplorato.lon.toFixed(5)}`, lat: esplorato.lat, lon: esplorato.lon }
        : sel
      const blob = await creaExcel({ dealer: soggetto, zona: zonaVista ?? zona, meta, aziende, clienti: lista?.clienti, esiti: lista ? esiti : undefined })
      await salvaFile(nomeFile(soggetto, raggio), blob)
    } catch (e) {
      const codice = (e as { code?: string }).code
      if (codice !== 'declined') setErrore(`Export non riuscito: ${(e as Error).message ?? codice}`)
    } finally {
      setEsporto(false)
    }
  }

  const dealerFiltrati = dealer.filter((d) => !cercaDealer || `${d.nome} ${d.indirizzo}`.toLowerCase().includes(cercaDealer.toLowerCase()))
  const altri = dealer.filter((d) => d.id !== selId)
  const altriNelRaggio = centro ? (esplorato ? dealer : altri).filter((d) => distanzaKm(centro.lat, centro.lon, d.lat, d.lon) <= raggio) : []
  const kmDalDealer = esplorato && sel ? distanzaKm(sel.lat, sel.lon, esplorato.lat, esplorato.lon) : 0
  const t = zona?.totale

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ---------- barra laterale ---------- */}
      <aside className="flex shrink-0 flex-col border-b lg:h-full lg:w-[228px] lg:border-r lg:border-b-0" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-3 py-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold leading-tight">Customer Map Potential</div>
            <div className="text-[10.5px]" style={{ color: 'var(--muted)' }}>Rete SuperService</div>
          </div>
        </div>
        <div className="px-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: 'var(--muted)' }}>Dealer ({dealer.length})</div>
            <button className="btn !gap-1 !px-1.5 !py-0.5 text-[11px]" onClick={() => setModale('nuovo')}>
              <Plus size={12} /> Nuovo
            </button>
          </div>
          {daAffinare.length > 0 && !DEMO && (
            <div className="mt-1.5 text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }} title="Il servizio gratuito di ricerca indirizzi accetta una richiesta al secondo">
              Cerco la via esatta: ne mancano {daAffinare.length}, circa {Math.max(1, Math.ceil((daAffinare.length * 2) / 60))} min.
            </div>
          )}
          {dealer.length > 6 && <input className="input mt-2 !py-1 text-xs" placeholder="Cerca dealer" value={cercaDealer} onChange={(e) => setCercaDealer(e.target.value)} />}
        </div>
        <nav className="mt-1.5 max-h-48 flex-1 space-y-px overflow-auto px-2 pb-2 lg:max-h-none">
          {dealerFiltrati.map((d) => {
            const on = d.id === selId
            return (
              <button
                key={d.id}
                onClick={() => seleziona(d)}
                className="w-full rounded-md px-2.5 py-1.5 text-left transition hover:bg-[var(--surface-2)]"
                style={on ? { background: 'var(--surface-2)', boxShadow: 'inset 3px 0 0 var(--accent)', color: 'var(--ink)' } : { color: 'var(--ink)' }}
                title={d.posizione && d.posizione !== 'indirizzo' ? `Posizione approssimativa (${d.posizione === 'cap' ? 'centro del CAP' : 'centro del comune'}). ${d.indirizzo}` : d.indirizzo}
              >
                <div className={`truncate text-[12.5px] leading-tight ${on ? 'font-bold' : 'font-medium'}`}>{d.nome}</div>
                <div className="truncate text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>{d.posizione && d.posizione !== 'indirizzo' ? '⚠ ' : ''}{d.indirizzo}</div>
              </button>
            )
          })}
        </nav>
        <div className="flex items-center gap-1.5 border-t px-3 py-2" style={{ borderColor: 'var(--line)' }}>
          <button className="btn flex-1 justify-center !py-1 text-xs" onClick={() => setModale('impostazioni')}>
            <Settings size={13} /> Impostazioni
          </button>
          <button className="btn !px-2 !py-1" onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')} aria-label="Cambia tema" title="Tema chiaro o scuro">
            {tema === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </aside>

      {/* ---------- contenuto ---------- */}
      <main className="flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
        {DEMO && (
          <div className="border-b px-5 py-2 text-xs" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)' }}>Demo.</b> Comuni, veicoli e settori sono dati pubblici reali ISTAT e ACI-PRA. Le aziende sono dimostrative. Acquisto dei nominativi, ricerca indirizzi e mappa stradale di sfondo funzionano nella versione su Vercel.
          </div>
        )}
        {!sel ? (
          <div className="m-auto max-w-md p-8 text-center">
            <div className="text-lg font-bold">Aggiungi il primo dealer</div>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-2)' }}>
              Importa l'elenco dei dealer da Excel (colonne Ragione Sociale, Indirizzo, Cap, Città) oppure inseriscine uno a mano: l'app calcola il potenziale nel raggio scelto.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button className="btn btn-primary" onClick={() => setModale('impostazioni')}>
                <Upload size={15} /> Importa da Excel
              </button>
              <button className="btn" onClick={() => setModale('nuovo')}>
                <Plus size={15} /> Nuovo dealer
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
              <div className="min-w-0">
                {esplorato ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Punto esplorato</span>
                      <h1 className="truncate text-lg font-bold">{esplorato.nome}</h1>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>{n0(kmDalDealer)} km da {sel.nome}</span>
                      <button className="btn !px-2 !py-0.5 text-xs" onClick={() => { setPreset({ nome: '', indirizzo: esplorato.nome, lat: esplorato.lat, lon: esplorato.lon, raggioKm: raggio }); setModale('nuovo') }}>
                        Salva come dealer
                      </button>
                      <button className="btn !px-2 !py-0.5 text-xs" onClick={() => setEsplorato(null)}>
                        Torna a {sel.nome}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-lg font-bold">{sel.nome}</h1>
                      <button className="btn !px-1.5 !py-1" onClick={() => setModale('modifica')} title="Modifica dealer">
                        <Pencil size={13} />
                      </button>
                    </div>
                    <div className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                      {sel.indirizzo}
                      {sel.note ? ` · ${sel.note}` : ''}
                      {altriNelRaggio.length > 0 && <span style={{ color: 'var(--ink-2)' }}> · {altriNelRaggio.length} altri SuperService nel raggio: {altriNelRaggio.map((d) => d.nome).join(', ')}</span>}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Raggio</span>
                <CampoRaggio valoreKm={raggio} onChange={setRaggio} compatto />
              </div>
              <div className="ml-auto flex items-center gap-2">
                {calcolo && <span className="text-xs" style={{ color: 'var(--muted)' }}>Calcolo…</span>}
                {daLocalizzare.length > 0 && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }} title="Il servizio gratuito di ricerca indirizzi accetta una richiesta al secondo">
                    Cerco la posizione di {daLocalizzare.length} imprese, circa {Math.max(1, Math.ceil(daLocalizzare.length / 50))} min…
                  </span>
                )}
                <button className="btn btn-accent" onClick={esporta} disabled={!zona || esporto}>
                  <Download size={15} /> {esporto ? 'Preparo il file…' : 'Scarica Excel'}
                </button>
              </div>
            </header>

            <div className="px-5 pt-4">
              <KpiRiga>
              <Kpi icona={<Users size={12} />} label="Abitanti" valore={compatto(t?.pop)} sotto={zona ? `${zona.comuni.length} comuni` : undefined} />
              <Kpi icona={<Car size={12} />} label="Autovetture" valore={compatto(t?.autovetture)} sotto={t && zona?.annoVeicoli ? `${pct(quotaVecchie(t.euro))} prima del 2006` : undefined} />
              <Kpi icona={<Truck size={12} />} label="Veicoli merci" valore={compatto(t?.autocarri)} sotto={t ? `+ ${compatto(t.pesanti)} pesanti` : undefined} />
              <Kpi icona={<Building2 size={12} />} label="Unità locali" valore={compatto(t?.unitaLocali)} sotto="sedi operative" />
              <Kpi icona={<Users size={12} />} label="Addetti" valore={compatto(t?.addetti)} sotto="nelle unità locali" />
              <Kpi icona={<Factory size={12} />} label="UL 50+ addetti" valore={n0(t ? t.ulClassi[2] + t.ulClassi[3] : null)} sotto={t ? `di cui ${n0(t.ulClassi[3])} oltre 250` : undefined} />
              <Kpi icona={<Wrench size={12} />} label="Officine" valore={n0(t?.officine)} sotto={t && t.officine ? `${n0(t.autovetture / t.officine)} auto ciascuna` : undefined} />
              <Kpi icona={<Layers size={12} />} label="Aziende" valore={n0(aziende.length)} sotto={esplorato ? 'solo quelle già acquistate qui' : aziende.length ? 'acquistate o importate' : 'vai su Aziende'} />
              </KpiRiga>
            </div>

            {raggio < 3 && (
              <div className="px-5 pt-3">
                <Avviso tipo="info">
                  Raggio piccolo: abitanti, auto e addetti sono <b>stime</b>. Il dato ISTAT è per comune e qui si ripartisce per superficie, come se fosse uniforme: nei centri urbani il valore reale è più alto. Aziende e concorrenti sono invece punti reali.
                </Avviso>
              </div>
            )}

            <div className="flex items-center gap-1 overflow-x-auto px-5 pt-4">
              {TABS.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className="whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition"
                  style={tab === tb.id ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'var(--shadow)' } : { color: 'var(--ink-2)' }}
                >
                  {tb.nome}
                  {tb.id === 'aziende' && aziende.length > 0 && <span className="ml-1.5 rounded-full px-1.5 text-[11px]" style={{ background: 'var(--surface-2)' }}>{n0(aziende.length)}</span>}
                </button>
              ))}
            </div>

            {errore && <div className="px-5 pt-3"><Avviso tipo="errore">{errore}</Avviso></div>}

            <div className="min-h-0 flex-1 p-5 pt-3 lg:overflow-auto">
              {/* la mappa resta montata anche nelle altre schede: si nasconde soltanto */}
              {(
                <div className="card relative overflow-hidden" style={{ height: 'max(460px, calc(100vh - 290px))', display: tab === 'mappa' ? undefined : 'none' }}>
                  <MapView
                    zona={zonaVista}
                    centro={centro}
                    altriDealer={esplorato ? dealer : altri}
                    aziende={aziende}
                    esiti={lista ? esiti : undefined}
                    metrica={metrica}
                    onMetrica={setMetrica}
                    tema={tema}
                    visibile={tab === 'mappa'}
                    onSpostaCentro={spostaCentro}
                    onApriComune={(c) => {
                      setComuneEvid(c)
                      setTab('territorio')
                    }}
                    onSelezionaDealer={(id) => {
                      const d = dealer.find((x) => x.id === id)
                      if (d) seleziona(d)
                    }}
                  />
                </div>
              )}
              {tab === 'territorio' && zonaVista && sel && (
                <Territorio
                  zona={zonaVista}
                  evidenziato={comuneEvid}
                  onAggiornaOsm={() => zona && caricaOsm(zona, true)}
                  dealer={sel}
                  chiaveApp={imp.chiaveApp}
                  acquistiConcorrenza={acquisti.filter((a) => a.scopo === 'concorrenza')}
                  onNuovoAcquisto={async (a) => {
                    await salvaAcquisto(a)
                    await ricaricaDati(sel.id)
                  }}
                  onElimina={async (id) => {
                    await eliminaAcquisto(id)
                    await ricaricaDati(sel.id)
                  }}
                />
              )}
              {tab === 'settori' && zona && <Settori zona={zona} meta={meta} />}
              {tab === 'aziende' && zona && (
                <Aziende
                  zona={zona}
                  dealer={sel}
                  aziende={aziende}
                  acquisti={acquisti.filter((a) => a.scopo !== 'concorrenza')}
                  chiaveApp={imp.chiaveApp}
                  onNuovoAcquisto={async (a) => {
                    await salvaAcquisto(a)
                    await ricaricaDati(sel.id)
                  }}
                  onElimina={async (id) => {
                    await eliminaAcquisto(id)
                    await ricaricaDati(sel.id)
                  }}
                />
              )}
              {tab === 'confronto' && (
                <Confronto
                  aziende={aziende}
                  lista={lista}
                  esiti={esiti}
                  onCarica={async (nomeFile: string, clienti: Cliente[]) => {
                    await salvaClienti({ dealerId: sel.id, nomeFile, data: new Date().toISOString(), clienti })
                    await ricaricaDati(sel.id)
                  }}
                  onRimuovi={async () => {
                    await eliminaClienti(sel.id)
                    await ricaricaDati(sel.id)
                  }}
                />
              )}
              {!zona && tab !== 'mappa' && tab !== 'confronto' && <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Calcolo della zona in corso…</div>}
              {meta && tab !== 'mappa' && (
                <div className="mt-4 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Fonti: {Object.values(meta.fonti).filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {modale === 'nuovo' && (
        <DealerForm
          preset={preset ?? undefined}
          onClose={() => {
            setModale(null)
            setPreset(null)
          }}
          onSalva={(d) => {
            aggiornaDealer([...dealer, d])
            seleziona(d)
            setModale(null)
            setPreset(null)
          }}
        />
      )}
      {modale === 'modifica' && sel && (
        <DealerForm
          iniziale={sel}
          onClose={() => setModale(null)}
          onSalva={(d) => {
            aggiornaDealer(dealer.map((x) => (x.id === d.id ? d : x)))
            setRaggio(d.raggioKm)
            setModale(null)
          }}
          onElimina={() => {
            const resto = dealer.filter((x) => x.id !== sel.id)
            aggiornaDealer(resto)
            setSelId(resto[0]?.id ?? null)
            if (resto[0]) setRaggio(resto[0].raggioKm)
            setModale(null)
          }}
        />
      )}
      {modale === 'impostazioni' && (
        <Impostazioni
          imp={imp}
          dealer={dealer}
          onClose={() => setModale(null)}
          onSalva={(i) => {
            setImp(i)
            salvaImpostazioni(i)
          }}
          onImportaDealer={(nuovi) => {
            // stesso nome = stesso dealer: reimportare aggiorna invece di duplicare
            const chiave = (d: Dealer) => d.nome.toLowerCase().replace(/[^a-z0-9]/g, '')
            const nuoviNomi = new Set(nuovi.map(chiave))
            const tutti = [...dealer.filter((d) => !d.id.startsWith('esempio-') && !nuoviNomi.has(chiave(d))), ...nuovi]
            aggiornaDealer(tutti)
            if (nuovi[0]) seleziona(nuovi[0])
          }}
        />
      )}
    </div>
  )
}
