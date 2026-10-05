import { CLASSI_ADDETTI } from '../lib/categories'
import { GRUPPI_EURO, quoteEuro, quotaVecchie } from '../lib/eta'
import { compatto, distKm, eur, n0, pct } from '../lib/fmt'
import { etichettaAnello } from '../lib/geo'
import type { ComuneZona, Zona } from '../lib/zone'
import { useRef, useState } from 'react'
import { acquistaOpenapi, importaElenco, stimaOpenapi, type Azienda, type StimaOpenapi } from '../lib/companies'
import { ATECO_GOMMISTI } from '../lib/concorrenza'
import type { Acquisto, Dealer } from '../lib/store'
import { Avviso, Barra, BottoneConferma, Sezione, Tabella, type Colonna } from './ui'

// scala ordinata dello stesso blu: più scuro = più vecchio
const COLORI_ETA = ['#184f95', '#2a78d6', '#5598e7', '#86b6ef']

function Concorrenza({ zona, dealer, chiaveApp, acquisti, onAggiornaOsm, onNuovoAcquisto, onElimina }: {
  zona: Zona
  dealer: Dealer
  chiaveApp: string
  acquisti: Acquisto[]
  onAggiornaOsm?: () => void
  onNuovoAcquisto: (a: Acquisto) => Promise<void>
  onElimina: (id: string) => Promise<void>
}) {
  const info = zona.infoConcorrenza
  const fileRef = useRef<HTMLInputElement>(null)
  const [stima, setStima] = useState<StimaOpenapi | null>(null)
  const [occupato, setOccupato] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'errore' | 'info'; testo: string } | null>(null)
  const filtri = { ateco: ATECO_GOMMISTI }

  const registra = (fonte: Acquisto['fonte'], aziende: Azienda[], prezzo: number | null): Acquisto => ({
    id: `conc-${Date.now()}`,
    dealerId: dealer.id,
    data: new Date().toISOString(),
    raggioKm: zona.raggioKm,
    centro: zona.centro,
    filtri,
    fonte,
    scopo: 'concorrenza',
    conteggio: aziende.length,
    prezzo,
    aziende,
  })

  async function stimaRegistro() {
    setMsg(null)
    setOccupato('stima')
    try {
      const r = await stimaOpenapi(zona.centro, zona.raggioKm, filtri, chiaveApp)
      if (r.demo) setMsg({ tipo: 'info', testo: r.messaggio ?? 'Openapi non configurato: inserisci il token in impostazioni.txt' })
      else setStima(r)
    } catch (e) {
      setMsg({ tipo: 'errore', testo: (e as Error).message })
    } finally {
      setOccupato(null)
    }
  }

  async function acquistaRegistro() {
    setOccupato('acquisto')
    try {
      const r = await acquistaOpenapi(zona.centro, zona.raggioKm, filtri, chiaveApp)
      await onNuovoAcquisto(registra('openapi', r.aziende, stima?.prezzo ?? null))
      setMsg({ tipo: 'ok', testo: `Acquistati ${r.aziende.length} gommisti dal Registro Imprese.` })
      setStima(null)
    } catch (e) {
      setMsg({ tipo: 'errore', testo: (e as Error).message })
    } finally {
      setOccupato(null)
    }
  }

  async function importa(file: File) {
    setOccupato('import')
    try {
      const lista = await importaElenco(file, zona)
      await onNuovoAcquisto(registra('import', lista, null))
      const nelRaggio = lista.filter((a) => a.lat !== null).length
      setMsg({ tipo: 'ok', testo: `Importati ${lista.length} gommisti da ${file.name}: ${nelRaggio} sono in comuni della zona e compaiono al centro del loro comune.` })
    } catch (e) {
      setMsg({ tipo: 'errore', testo: (e as Error).message })
    } finally {
      setOccupato(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const gomm = zona.concorrenti.filter((c) => c.gommista)
  const catene = gomm.filter((c) => c.rete && c.rete !== 'SuperService')
  const reti = new Map<string, { gruppo: string; n: number; vicino: number }>()
  for (const c of gomm) {
    const k = c.rete || 'Indipendenti o rete non indicata'
    const r = reti.get(k) ?? { gruppo: c.gruppo, n: 0, vicino: Infinity }
    r.n++
    r.vicino = Math.min(r.vicino, c.distanzaKm)
    reti.set(k, r)
  }
  const righe = [...reti.entries()].sort((a, b) => b[1].n - a[1].n)
  const perAnello = zona.limitiAnelli.map((lim, i) => {
    const da = i ? zona.limitiAnelli[i - 1] : 0
    return gomm.filter((c) => c.distanzaKm > da && c.distanzaKm <= lim).length
  })
  const fonti = [
    info?.registro ? `Registro Imprese ${n0(info.registro)}` : null,
    info?.stato === 'ok' ? `OpenStreetMap ${n0(info.osm)}${info.data ? ` del ${new Date(info.data).toLocaleDateString('it-IT')}` : ''}` : null,
  ].filter(Boolean)

  return (
    <Sezione
      titolo="Concorrenza nel raggio"
      sotto={fonti.length ? `Fonti: ${fonti.join(' · ')}` : 'Gommisti e officine concorrenti'}
      azioni={
        onAggiornaOsm && info?.stato !== 'assente' ? (
          <button className="btn !py-1 text-xs" onClick={onAggiornaOsm} disabled={info?.stato === 'carico'}>
            {info?.stato === 'carico' ? 'Carico OpenStreetMap…' : 'Aggiorna OpenStreetMap'}
          </button>
        ) : undefined
      }
    >
      <div className="grid gap-3 border-b p-4 lg:grid-cols-2" style={{ borderColor: 'var(--line)' }}>
        <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
          <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>Elenco completo dal Registro Imprese</div>
          {info?.registro
            ? 'Dati del Registro Imprese caricati: sono la base della concorrenza.'
            : "OpenStreetMap conosce circa un gommista su dieci. L'elenco completo sono le imprese con ATECO 45.20.40, riparazione e sostituzione di pneumatici."}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn !py-1 text-xs" onClick={stimaRegistro} disabled={!!occupato}>
              {occupato === 'stima' ? 'Stima…' : 'Stima con Openapi'}
            </button>
            {stima && (
              <>
                <span className="rounded-lg px-2 py-1" style={{ background: 'var(--surface-2)' }}>
                  <b>{stima.conteggio === null ? '?' : n0(stima.conteggio)}</b> gommisti · <b>{stima.prezzo === null ? 'prezzo n.d.' : eur(stima.prezzo)}</b>
                </span>
                {stima.conteggio !== 0 && (
                  <BottoneConferma className="btn btn-accent !py-1 text-xs" domanda={`Conferma: paga ${stima.prezzo !== null ? eur(stima.prezzo) : 'il prezzo indicato'}`} onConferma={acquistaRegistro}>
                    {occupato === 'acquisto' ? 'Acquisto…' : 'Acquista'}
                  </BottoneConferma>
                )}
              </>
            )}
            <button className="btn !py-1 text-xs" onClick={() => fileRef.current?.click()} disabled={!!occupato}>
              Importa elenco Telemaco
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importa(e.target.files[0])} />
          </div>
          {msg && <div className="mt-2"><Avviso tipo={msg.tipo}>{msg.testo}</Avviso></div>}
          {info?.stato === 'errore' && <div className="mt-2"><Avviso tipo="warn">OpenStreetMap: {info.errore}</Avviso></div>}
        </div>
        {acquisti.length > 0 && (
          <div className="text-xs">
            <div className="mb-1 text-sm font-semibold">Elenchi caricati</div>
            {acquisti.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 border-b py-1" style={{ borderColor: 'var(--line)' }}>
                <span>
                  {new Date(a.data).toLocaleDateString('it-IT')} · {a.fonte === 'openapi' ? 'Openapi' : 'File importato'} · {n0(a.conteggio)} gommisti{a.prezzo ? ` · ${eur(a.prezzo)}` : ''}
                </span>
                <BottoneConferma className="btn !px-2 !py-0.5 text-xs" domanda="Elimina" title="Elimina elenco" onConferma={() => onElimina(a.id)}>
                  ✕
                </BottoneConferma>
              </div>
            ))}
          </div>
        )}
      </div>
      {info?.stato === 'assente' && !zona.concorrenti.length ? (
        <div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>Nella demo online OpenStreetMap non si interroga. Puoi importare un elenco Telemaco.</div>
      ) : info?.stato === 'carico' && !zona.concorrenti.length ? (
        <div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>Carico la concorrenza della zona…</div>
      ) : !zona.concorrenti.length ? (
        <div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>Nessun gommista trovato in questa zona.</div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Gommisti</span><b className="num">{n0(gomm.length)}</b></div>
            <div className="flex justify-between"><span>di cui catene concorrenti</span><b className="num">{n0(catene.length)}</b></div>
            <div className="flex justify-between"><span>Altre officine mappate</span><b className="num">{n0(zona.concorrenti.length - gomm.length)}</b></div>
            <div className="flex justify-between"><span>Officine ISTAT, ATECO 45.2</span><b className="num">{n0(zona.totale.officine)}</b></div>
            <div className="flex justify-between"><span>Autovetture per gommista</span><b className="num">{gomm.length ? n0(zona.totale.autovetture / gomm.length) : '–'}</b></div>
            <div className="border-t pt-2 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
              Gommisti per fascia: {zona.limitiAnelli.map((_, i) => `${etichettaAnello(i, zona.limitiAnelli)} ${perAnello[i]}`).join(' · ')}
            </div>
            {!info?.registro && (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Solo OpenStreetMap: i numeri sono sottostimati.</div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Rete</th><th>Gruppo</th><th className="r">Punti</th><th className="r">Il più vicino</th></tr>
              </thead>
              <tbody>
                {righe.map(([rete, r]) => (
                  <tr key={rete}>
                    <td className="font-medium">{rete}</td>
                    <td style={{ color: 'var(--ink-2)' }}>{r.gruppo || '–'}</td>
                    <td className="r">{n0(r.n)}</td>
                    <td className="r">{distKm(r.vicino)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>La rete si riconosce dal nome: un affiliato registrato con la sola ragione sociale risulta indipendente.</div>
          </div>
        </div>
      )}
    </Sezione>
  )
}

export default function Territorio({ zona, evidenziato, onAggiornaOsm, dealer, chiaveApp, acquistiConcorrenza, onNuovoAcquisto, onElimina }: {
  zona: Zona
  evidenziato?: string | null
  onAggiornaOsm?: () => void
  dealer: Dealer
  chiaveApp: string
  acquistiConcorrenza: Acquisto[]
  onNuovoAcquisto: (a: Acquisto) => Promise<void>
  onElimina: (id: string) => Promise<void>
}) {
  const maxAuto = Math.max(...zona.anelli.map((a) => a.autovetture))
  const col: Colonna<ComuneZona>[] = [
    { id: 'nome', label: 'Comune', valore: (z) => z.comune.n, render: (z) => <span className={`whitespace-nowrap ${z.comune.c === evidenziato ? 'font-bold' : 'font-medium'}`} style={z.comune.c === evidenziato ? { color: 'var(--brand-2)' } : undefined}>{z.comune.n} <span style={{ color: 'var(--muted)' }}>{z.comune.p}</span></span> },
    { id: 'dist', label: 'Distanza', valore: (z) => z.distanzaKm, render: (z) => distKm(z.distanzaKm), destra: true },
    { id: 'quota', label: '% nel raggio', valore: (z) => z.quota, render: (z) => pct(z.quota), destra: true },
    { id: 'pop', label: 'Abitanti', valore: (z) => z.totali.pop, render: (z) => n0(z.totali.pop), destra: true },
    { id: 'auto', label: 'Autovetture', valore: (z) => z.totali.autovetture, render: (z) => n0(z.totali.autovetture), destra: true },
    { id: 'merci', label: 'Veicoli merci', valore: (z) => z.totali.autocarri, render: (z) => n0(z.totali.autocarri), destra: true },
    { id: 'pes', label: 'Pesanti e rimorchi', valore: (z) => z.totali.pesanti, render: (z) => n0(z.totali.pesanti), destra: true },
    { id: 'ul', label: 'Unità locali', valore: (z) => z.totali.unitaLocali, render: (z) => n0(z.totali.unitaLocali), destra: true },
    { id: 'add', label: 'Addetti', valore: (z) => z.totali.addetti, render: (z) => n0(z.totali.addetti), destra: true },
    { id: 'ul50', label: 'UL 50+ add.', valore: (z) => z.totali.ulClassi[2] + z.totali.ulClassi[3], render: (z) => n0(z.totali.ulClassi[2] + z.totali.ulClassi[3]), destra: true },
    { id: 'vecchie', label: 'Auto Euro 0-3', valore: (z) => quotaVecchie(z.comune.veh?.euro), render: (z) => pct(quotaVecchie(z.comune.veh?.euro)), destra: true },
    { id: 'off', label: 'Officine', valore: (z) => z.totali.officine, render: (z) => n0(z.totali.officine), destra: true },
    { id: 'apo', label: 'Auto per officina', valore: (z) => (z.comune.off ? (z.comune.veh?.autovetture ?? 0) / z.comune.off : null), render: (z) => (z.comune.off ? n0((z.comune.veh?.autovetture ?? 0) / z.comune.off) : '–'), destra: true },
  ]
  return (
    <div className="space-y-4">
      <Sezione titolo="Fasce di distanza" sotto="Valori ripartiti in proporzione alla superficie di ogni comune che cade nella fascia">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fascia</th>
                <th className="r">Abitanti</th>
                <th style={{ width: '18%' }}>Autovetture</th>
                <th className="r">Veicoli merci</th>
                <th className="r">Pesanti e rimorchi</th>
                <th className="r">Motocicli</th>
                <th className="r">Unità locali</th>
                <th className="r">Addetti</th>
                {CLASSI_ADDETTI.slice(1).map((c) => (
                  <th key={c.id} className="r">UL {c.nome}</th>
                ))}
                <th className="r">Officine</th>
              </tr>
            </thead>
            <tbody>
              {zona.anelli.map((t, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap font-semibold">{etichettaAnello(i, zona.limitiAnelli)}</td>
                  <td className="r">{n0(t.pop)}</td>
                  <td>
                    <div className="flex min-w-[170px] items-center gap-2">
                      <div className="flex-1">
                        <Barra valore={t.autovetture} max={maxAuto} titolo={`${n0(t.autovetture)} autovetture`} />
                      </div>
                      <span className="num w-16 text-right">{compatto(t.autovetture)}</span>
                    </div>
                  </td>
                  <td className="r">{n0(t.autocarri)}</td>
                  <td className="r">{n0(t.pesanti)}</td>
                  <td className="r">{n0(t.motocicli)}</td>
                  <td className="r">{n0(t.unitaLocali)}</td>
                  <td className="r">{n0(t.addetti)}</td>
                  {[1, 2, 3].map((k) => (
                    <td key={k} className="r">{n0(t.ulClassi[k])}</td>
                  ))}
                  <td className="r">{n0(t.officine)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td className="whitespace-nowrap">Totale {distKm(zona.raggioKm)}</td>
                <td className="r">{n0(zona.totale.pop)}</td>
                <td className="r">{n0(zona.totale.autovetture)}</td>
                <td className="r">{n0(zona.totale.autocarri)}</td>
                <td className="r">{n0(zona.totale.pesanti)}</td>
                <td className="r">{n0(zona.totale.motocicli)}</td>
                <td className="r">{n0(zona.totale.unitaLocali)}</td>
                <td className="r">{n0(zona.totale.addetti)}</td>
                {[1, 2, 3].map((k) => (
                  <td key={k} className="r">{n0(zona.totale.ulClassi[k])}</td>
                ))}
                <td className="r">{n0(zona.totale.officine)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Sezione>
      <Sezione
        titolo="Età del parco auto"
        sotto={`Autovetture per classe Euro, anno di immatricolazione indicativo. Fonte ISTAT su dati ACI-PRA ${zona.annoVeicoli ?? ''}`}
      >
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-2)' }}>
            {GRUPPI_EURO.map((g, i) => (
              <span key={g.nome} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_ETA[i] }} />
                {g.nome}, {g.periodo}
              </span>
            ))}
          </div>
          {[...zona.anelli.map((a, i) => ({ nome: etichettaAnello(i, zona.limitiAnelli), euro: a.euro })), { nome: `Totale ${distKm(zona.raggioKm)}`, euro: zona.totale.euro }].map((r) => {
            const q = quoteEuro(r.euro)
            return (
              <div key={r.nome} className="grid grid-cols-[90px_1fr] items-center gap-3 text-xs sm:grid-cols-[110px_1fr_220px]">
                <div className="whitespace-nowrap font-semibold">{r.nome}</div>
                <div className="flex h-4 gap-[2px] overflow-hidden rounded">
                  {q.map((v, i) => (
                    <div key={i} title={`${GRUPPI_EURO[i].nome}: ${pct(v)}`} style={{ width: `${v * 100}%`, background: COLORI_ETA[i] }} />
                  ))}
                </div>
                <div className="num col-span-2 flex justify-between gap-2 sm:col-span-1" style={{ color: 'var(--ink-2)' }}>
                  {q.map((v, i) => (
                    <span key={i}>{pct(v)}</span>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Più auto vecchie: clienti attenti al prezzo e più manutenzione. Più Euro 6: gomme di misura più grande e clienti più propensi a servizi e assicurazione.
          </div>
        </div>
      </Sezione>
      <Concorrenza zona={zona} dealer={dealer} chiaveApp={chiaveApp} acquisti={acquistiConcorrenza} onAggiornaOsm={onAggiornaOsm} onNuovoAcquisto={onNuovoAcquisto} onElimina={onElimina} />
      <Sezione titolo={`Comuni nel raggio (${zona.comuni.length})`} sotto="Clic sulle intestazioni per ordinare. Il clic su un comune in mappa lo evidenzia qui.">
        <div className="max-h-[560px] overflow-auto">
          <Tabella righe={zona.comuni} colonne={col} chiave={(z) => z.comune.c} ordineIniziale={{ id: 'dist', desc: false }} />
        </div>
      </Sezione>
    </div>
  )
}
