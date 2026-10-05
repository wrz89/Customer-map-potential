import { Coins, Database, FileUp, FlaskConical, Search, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { CATEGORIE } from '../lib/categories'
import { acquistaOpenapi, generaDemo, importaElenco, stimaOpenapi, type Azienda, type StimaOpenapi } from '../lib/companies'
import { distKm, eur, n0 } from '../lib/fmt'
import type { Acquisto, Dealer } from '../lib/store'
import type { Zona } from '../lib/zone'
import { Avviso, BottoneConferma, FlottaBadge, Sezione, Tabella, type Colonna } from './ui'

interface Props {
  zona: Zona
  dealer: Dealer
  aziende: Azienda[]
  acquisti: Acquisto[]
  chiaveApp: string
  onNuovoAcquisto: (a: Acquisto) => Promise<void>
  onElimina: (id: string) => Promise<void>
}

export default function Aziende({ zona, dealer, aziende, acquisti, chiaveApp, onNuovoAcquisto, onElimina }: Props) {
  const [minDip, setMinDip] = useState(10)
  const [cats, setCats] = useState<string[]>([])
  const [stima, setStima] = useState<StimaOpenapi | null>(null)
  const [occupato, setOccupato] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // filtri tabella
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [fFlotta, setFFlotta] = useState('')
  const [fMin, setFMin] = useState(0)

  const ateco = useMemo(() => CATEGORIE.filter((c) => cats.includes(c.id)).flatMap((c) => c.divisioni), [cats])
  const filtri = { minDipendenti: minDip || undefined, ateco: ateco.length ? ateco : undefined }

  const nuovoAcquisto = (fonte: Azienda['fonte'], lista: Azienda[], prezzo: number | null, extra?: Partial<Acquisto['filtri']>): Acquisto => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dealerId: dealer.id,
    data: new Date().toISOString(),
    raggioKm: zona.raggioKm,
    centro: zona.centro,
    filtri: { ...filtri, ...extra },
    fonte,
    conteggio: lista.length,
    prezzo,
    aziende: lista,
  })

  async function eseguiStima() {
    setErrore(null)
    setInfo(null)
    setOccupato('stima')
    try {
      const s = await stimaOpenapi(zona.centro, zona.raggioKm, filtri, chiaveApp)
      setStima(s)
      if (s.demo) setInfo(s.messaggio ?? 'Openapi non configurato')
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setOccupato(null)
    }
  }

  async function eseguiAcquisto() {
    if (!stima || stima.demo) return
    setErrore(null)
    setOccupato('acquisto')
    try {
      const r = await acquistaOpenapi(zona.centro, zona.raggioKm, filtri, chiaveApp)
      await onNuovoAcquisto(nuovoAcquisto('openapi', r.aziende, stima.prezzo))
      setInfo(`Acquistate ${r.aziende.length} aziende${r.troncato ? ' (risultato troncato al massimo consentito: restringi i filtri)' : ''}.`)
      setStima(null)
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setOccupato(null)
    }
  }

  async function eseguiDemo() {
    setOccupato('demo')
    const lista = generaDemo(zona, minDip || 10)
    await onNuovoAcquisto(nuovoAcquisto('demo', lista, 0))
    setInfo(`Generate ${lista.length} aziende DIMOSTRATIVE a partire dai conteggi ISTAT. Non sono aziende reali: servono a provare mappa, tabelle ed Excel.`)
    setOccupato(null)
  }

  async function importa(file: File) {
    setErrore(null)
    setOccupato('import')
    try {
      const lista = await importaElenco(file, zona)
      await onNuovoAcquisto(nuovoAcquisto('import', lista, null))
      const senza = lista.filter((a) => a.lat === null).length
      const daCercare = lista.filter((a) => a.posizione === 'comune' && a.indirizzo.trim()).length
      setInfo(
        `Importate ${lista.length} aziende da ${file.name}.${senza ? ` ${senza} sono in comuni fuori dalla zona e non le conto.` : ''}` +
          (zona.raggioKm <= 3 && daCercare
            ? ` Con un raggio di ${distKm(zona.raggioKm)} cerco l'indirizzo esatto delle imprese dei comuni nella zona, circa una al secondo: compaiono in mappa e nelle distanze man mano.`
            : ''),
      )
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setOccupato(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const filtrate = useMemo(() => {
    const qq = q.trim().toUpperCase()
    return aziende.filter(
      (a) =>
        (!qq || a.ragioneSociale.toUpperCase().includes(qq) || a.comune.toUpperCase().includes(qq) || a.piva.includes(qq)) &&
        (!fCat || a.categoria === fCat) &&
        (!fFlotta || a.flotta === fFlotta) &&
        (!fMin || (a.dipendenti ?? 0) >= fMin),
    )
  }, [aziende, q, fCat, fFlotta, fMin])

  const categorieTrovate = useMemo(() => [...new Set(aziende.map((a) => a.categoria))].sort(), [aziende])
  const demoPresente = aziende.some((a) => a.fonte === 'demo')

  const colonne: Colonna<Azienda>[] = [
    { id: 'nome', label: 'Ragione sociale', valore: (a) => a.ragioneSociale, render: (a) => <div><div className="font-semibold">{a.ragioneSociale}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{a.piva}{a.fonte === 'demo' ? ' · DEMO' : ''}</div></div> },
    { id: 'cat', label: 'Categoria', valore: (a) => a.categoria, render: (a) => <div><div>{a.categoria}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{a.ateco} {a.atecoDescr}</div></div> },
    { id: 'flotta', label: 'Flotta', valore: (a) => ({ Alta: 3, Media: 2, Bassa: 1, '': 0 })[a.flotta], render: (a) => <FlottaBadge f={a.flotta} /> },
    { id: 'dip', label: 'Dipendenti', valore: (a) => a.dipendenti, render: (a) => n0(a.dipendenti), destra: true },
    { id: 'fatt', label: 'Fatturato', valore: (a) => a.fatturato, render: (a) => (a.fatturato ? `${n0(a.fatturato / 1000)} k€` : '–'), destra: true },
    { id: 'comune', label: 'Comune', valore: (a) => a.comune, render: (a) => <div><div>{a.comune} {a.provincia && <span style={{ color: 'var(--muted)' }}>{a.provincia}</span>}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{a.indirizzo}</div></div> },
    { id: 'dist', label: 'Distanza', valore: (a) => a.distanzaKm, render: (a) => distKm(a.distanzaKm), destra: true },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-[15px] font-bold">
            <Coins size={18} style={{ color: 'var(--accent)' }} /> Acquista i nominativi della zona
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
            Registro Imprese tramite Openapi: aziende attive con sede legale entro {distKm(zona.raggioKm)}, con ATECO, dipendenti, fatturato e PEC. Prima si stima il costo, poi si conferma.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Dipendenti minimi
              <select className="input mt-1" value={minDip} onChange={(e) => { setMinDip(Number(e.target.value)); setStima(null) }}>
                {[0, 3, 5, 10, 20, 50, 100, 250].map((v) => (
                  <option key={v} value={v}>{v === 0 ? 'Nessun minimo' : `${v} o più`}</option>
                ))}
              </select>
            </label>
            <div className="text-xs font-semibold">
              Categorie (vuoto = tutte)
              <div className="mt-1 flex flex-wrap gap-1">
                {CATEGORIE.filter((c) => c.flotta !== 'Bassa').map((c) => {
                  const on = cats.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                      style={on ? { background: 'var(--brand)', color: 'var(--surface)', borderColor: 'var(--brand)' } : { borderColor: 'var(--line)', color: 'var(--ink-2)' }}
                      onClick={() => { setCats((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id])); setStima(null) }}
                    >
                      {c.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn" onClick={eseguiStima} disabled={!!occupato}>
              <Search size={15} /> {occupato === 'stima' ? 'Stima in corso…' : 'Stima costo'}
            </button>
            {stima && !stima.demo && (
              <>
                <div className="rounded-lg px-3 py-1.5 text-sm" style={{ background: 'var(--surface-2)' }}>
                  <b className="num">{stima.conteggio === null ? '?' : n0(stima.conteggio)}</b> aziende ·{' '}
                  <b className="num">{stima.prezzo === null ? 'prezzo n.d.' : eur(stima.prezzo)}</b>
                  {stima.sandbox && <span className="ml-1 text-xs" style={{ color: 'var(--muted)' }}>(ambiente di prova)</span>}
                </div>
                {occupato === 'acquisto' ? (
                  <button className="btn btn-accent" disabled>
                    <Coins size={15} /> Acquisto in corso…
                  </button>
                ) : (
                  stima.conteggio !== 0 && (
                    <BottoneConferma className="btn btn-accent" domanda={`Conferma: paga ${stima.prezzo !== null ? eur(stima.prezzo) : 'il prezzo indicato'}`} onConferma={eseguiAcquisto}>
                      <Coins size={15} /> Acquista
                    </BottoneConferma>
                  )
                )}
              </>
            )}
          </div>
          {ateco.length > 0 && (
            <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Con le categorie selezionate si fa una ricerca per ogni codice ATECO ({ateco.length} codici). Se la stima torna a zero, prova senza categorie e filtra dopo l'acquisto.
            </p>
          )}
        </div>
        <div className="card flex flex-col gap-3 p-4">
          <div className="text-[15px] font-bold">Altre fonti</div>
          <div>
            <button className="btn w-full justify-center" onClick={() => fileRef.current?.click()} disabled={!!occupato}>
              <FileUp size={15} /> Importa Excel o CSV
            </button>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Estrazione Telemaco o altro elenco: servono almeno ragione sociale e comune. Riconosce da solo P.IVA, ATECO, addetti, indirizzo.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importa(e.target.files[0])} />
          </div>
          <div>
            <button className="btn w-full justify-center" onClick={eseguiDemo} disabled={!!occupato}>
              <FlaskConical size={15} /> Genera dati dimostrativi
            </button>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Aziende finte, coerenti con i numeri ISTAT della zona. Per provare l'app senza spendere.
            </p>
          </div>
        </div>
      </div>

      {errore && <Avviso tipo="errore">{errore}</Avviso>}
      {info && <Avviso tipo="ok">{info}</Avviso>}
      {demoPresente && <Avviso tipo="warn">Nell'elenco ci sono aziende DIMOSTRATIVE. Eliminale dal registro prima di dare il file al dealer.</Avviso>}

      {acquisti.length > 0 && (
        <Sezione titolo="Registro acquisti e import" sotto="Salvati in questo browser, per non ricomprare la stessa zona">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fonte</th>
                  <th className="r">Raggio</th>
                  <th>Filtri</th>
                  <th className="r">Aziende</th>
                  <th className="r">Costo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {acquisti.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.data).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td><span className="inline-flex items-center gap-1"><Database size={13} /> {{ openapi: 'Openapi', import: 'File importato', demo: 'Dimostrativo' }[a.fonte]}</span></td>
                    <td className="r">{distKm(a.raggioKm)}</td>
                    <td className="text-xs">{a.filtri.minDipendenti ? `${a.filtri.minDipendenti}+ dipendenti` : 'tutti'}{a.filtri.ateco?.length ? ` · ${a.filtri.ateco.length} ATECO` : ''}</td>
                    <td className="r">{n0(a.conteggio)}</td>
                    <td className="r">{a.prezzo === null ? '–' : eur(a.prezzo)}</td>
                    <td className="r">
                      <BottoneConferma className="btn !px-2 !py-1" title="Elimina dal registro" domanda="Elimina" onConferma={() => onElimina(a.id)}>
                        <Trash2 size={14} />
                      </BottoneConferma>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sezione>
      )}

      <Sezione
        titolo={`Aziende nel raggio (${n0(filtrate.length)}${filtrate.length !== aziende.length ? ` di ${n0(aziende.length)}` : ''})`}
        sotto="Indirizzo e coordinate della sede legale"
        azioni={
          <>
            <input className="input !w-44" placeholder="Cerca nome, comune, P.IVA" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input !w-48" value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="">Tutte le categorie</option>
              {categorieTrovate.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="input !w-32" value={fFlotta} onChange={(e) => setFFlotta(e.target.value)}>
              <option value="">Ogni flotta</option>
              <option>Alta</option>
              <option>Media</option>
              <option>Bassa</option>
            </select>
            <select className="input !w-36" value={fMin} onChange={(e) => setFMin(Number(e.target.value))}>
              {[0, 10, 20, 50, 100, 250].map((v) => (
                <option key={v} value={v}>{v ? `${v}+ dipendenti` : 'Ogni dimensione'}</option>
              ))}
            </select>
          </>
        }
      >
        <div className="max-h-[620px] overflow-auto">
          <Tabella
            righe={filtrate}
            colonne={colonne}
            chiave={(a) => a.id}
            ordineIniziale={{ id: 'dip', desc: true }}
            vuoto="Nessuna azienda: stima e acquista i nominativi, importa un file o genera i dati dimostrativi."
          />
        </div>
      </Sezione>
    </div>
  )
}
