import { CheckCircle2, CircleHelp, FileUp, Sparkles, Trash2, UserCheck } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Azienda } from '../lib/companies'
import { n0, n1 } from '../lib/fmt'
import { indovinaColonne, leggiTabella } from '../lib/leggiFile'
import { STATI, type Cliente, type EsitoMatch, type StatoMatch } from '../lib/match'
import type { ListaClienti } from '../lib/store'
import { Avviso, BottoneConferma, FlottaBadge, Sezione, Tabella, type Colonna } from './ui'

export const STATO_STILE: Record<StatoMatch, { colore: string; icona: ReactNode; nota: string }> = {
  'Già cliente': { colore: 'var(--muted)', icona: <UserCheck size={14} />, nota: 'Partita IVA presente nella lista clienti' },
  'Probabile cliente': { colore: 'var(--warn)', icona: <CheckCircle2 size={14} />, nota: 'Nome uguale o quasi: controlla a occhio' },
  'Da verificare': { colore: 'var(--serious)', icona: <CircleHelp size={14} />, nota: 'Nome simile o stesso indirizzo' },
  Nuovo: { colore: 'var(--good)', icona: <Sparkles size={14} />, nota: 'Nessuna corrispondenza: potenziale cliente' },
}

export function StatoBadge({ s }: { s: StatoMatch }) {
  const st = STATO_STILE[s]
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ borderColor: st.colore, color: 'var(--ink)' }}>
      <span style={{ color: st.colore }}>{st.icona}</span>
      {s}
    </span>
  )
}

interface Props {
  aziende: Azienda[]
  lista: ListaClienti | undefined
  esiti: Map<string, EsitoMatch>
  onCarica: (nomeFile: string, clienti: Cliente[]) => Promise<void>
  onRimuovi: () => Promise<void>
}

export default function Confronto({ aziende, lista, esiti, onCarica, onRimuovi }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [filtro, setFiltro] = useState<StatoMatch | ''>('')

  async function carica(file: File) {
    setErrore(null)
    setOccupato(true)
    try {
      // se è un export di questa app, si legge il foglio "Clienti dealer"
      const { intestazioni, righe } = await leggiTabella(file, 'Clienti dealer')
      const m = indovinaColonne(intestazioni)
      if (!m.ragioneSociale && !m.piva) throw new Error(`Non trovo né ragione sociale né partita IVA. Colonne lette: ${intestazioni.join(', ')}`)
      const clienti: Cliente[] = righe
        .map((r) => ({
          ragioneSociale: m.ragioneSociale ? r[m.ragioneSociale] : '',
          piva: m.piva ? r[m.piva] : '',
          indirizzo: m.indirizzo ? r[m.indirizzo] : '',
          comune: m.comune ? r[m.comune] : '',
        }))
        .filter((c) => c.ragioneSociale || c.piva)
      if (!clienti.length) throw new Error('Il file non contiene clienti')
      await onCarica(file.name, clienti)
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setOccupato(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const conteggi = useMemo(() => {
    const c = Object.fromEntries(STATI.map((s) => [s, { n: 0, dip: 0 }])) as Record<StatoMatch, { n: number; dip: number }>
    for (const a of aziende) {
      const e = esiti.get(a.id)
      if (!e) continue
      c[e.stato].n++
      c[e.stato].dip += a.dipendenti ?? 0
    }
    return c
  }, [aziende, esiti])

  const righe = useMemo(() => aziende.filter((a) => !filtro || esiti.get(a.id)?.stato === filtro), [aziende, esiti, filtro])

  const colonne: Colonna<Azienda>[] = [
    { id: 'stato', label: 'Stato', valore: (a) => STATI.indexOf(esiti.get(a.id)?.stato ?? 'Nuovo'), render: (a) => <StatoBadge s={esiti.get(a.id)?.stato ?? 'Nuovo'} /> },
    { id: 'nome', label: 'Azienda della zona', valore: (a) => a.ragioneSociale, render: (a) => <div><div className="font-semibold">{a.ragioneSociale}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{a.piva} · {a.comune}</div></div> },
    { id: 'cli', label: 'Cliente abbinato', valore: (a) => esiti.get(a.id)?.cliente?.ragioneSociale ?? '', render: (a) => { const e = esiti.get(a.id); return e?.cliente ? <div><div>{e.cliente.ragioneSociale}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{e.motivo} · somiglianza {Math.round(e.punteggio * 100)}%</div></div> : <span style={{ color: 'var(--muted)' }}>–</span> } },
    { id: 'cat', label: 'Categoria', valore: (a) => a.categoria },
    { id: 'flotta', label: 'Flotta', valore: (a) => a.flotta, render: (a) => <FlottaBadge f={a.flotta} /> },
    { id: 'dip', label: 'Dipendenti', valore: (a) => a.dipendenti, render: (a) => n0(a.dipendenti), destra: true },
    { id: 'dist', label: 'Km', valore: (a) => a.distanzaKm, render: (a) => n1(a.distanzaKm), destra: true },
  ]

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[15px] font-bold">Confronto con i clienti del dealer</div>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
              Carica l'elenco clienti esportato dal gestionale (.xlsx o .csv). Bastano ragione sociale o partita IVA. L'app abbina per partita IVA, poi per nome anche scritto in modo diverso, poi per indirizzo. La lista resta solo in questo browser.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
              In alternativa scarica l'Excel e fai incollare la lista al dealer nel foglio "Clienti dealer": lo Stato si calcola con le formule.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={occupato}>
              <FileUp size={15} /> {lista ? 'Sostituisci lista' : 'Carica lista clienti'}
            </button>
            {lista && (
              <BottoneConferma title="Rimuovi lista" domanda="Rimuovi" onConferma={onRimuovi}>
                <Trash2 size={15} />
              </BottoneConferma>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && carica(e.target.files[0])} />
        </div>
        {lista && (
          <div className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Lista caricata: <b style={{ color: 'var(--ink)' }}>{lista.nomeFile}</b> · {n0(lista.clienti.length)} clienti · {new Date(lista.data).toLocaleDateString('it-IT')}
          </div>
        )}
      </div>
      {errore && <Avviso tipo="errore">{errore}</Avviso>}
      {!aziende.length && <Avviso tipo="info">Prima servono le aziende della zona: vai su Aziende e acquista, importa o genera i dati.</Avviso>}

      {lista && aziende.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATI.map((s) => {
              const st = STATO_STILE[s]
              const on = filtro === s
              return (
                <button
                  key={s}
                  onClick={() => setFiltro(on ? '' : s)}
                  className="card p-4 text-left transition"
                  style={on ? { outline: `2px solid ${st.colore}`, outlineOffset: -1 } : undefined}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span style={{ color: st.colore }}>{st.icona}</span>
                    {s}
                  </div>
                  <div className="mt-1 text-2xl font-bold">{n0(conteggi[s].n)}</div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-2)' }}>
                    {n0(conteggi[s].dip)} dipendenti · {st.nota}
                  </div>
                </button>
              )
            })}
          </div>
          <Sezione titolo={filtro ? `Aziende: ${filtro}` : 'Esito del confronto'} sotto="Clic su un riquadro per filtrare">
            <div className="max-h-[620px] overflow-auto">
              <Tabella righe={righe} colonne={colonne} chiave={(a) => a.id} ordineIniziale={{ id: 'dip', desc: true }} />
            </div>
          </Sezione>
        </>
      )}
    </div>
  )
}
