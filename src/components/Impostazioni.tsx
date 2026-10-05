import { Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { desktop, type StatoAggiornamento, type StatoDesktop } from '../lib/ambiente'
import { loadComuni } from '../lib/data'
import { indiceComuni, indirizzoCompleto, leggiRigheDealer, ricercheDealer, trovaComune } from '../lib/importaDealer'
import { leggiTabella } from '../lib/leggiFile'
import { cercaPosizione, giaCercata, type Dealer, type Impostazioni as Imp } from '../lib/store'
import { Avviso, Modale } from './ui'

export function Impostazioni({ imp, dealer, onSalva, onImportaDealer, onClose }: {
  imp: Imp
  dealer: Dealer[]
  onSalva: (i: Imp) => void
  onImportaDealer: (d: Dealer[]) => void
  onClose: () => void
}) {
  const [chiave, setChiave] = useState(imp.chiaveApp)
  const [stato, setStato] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function esporta() {
    const blob = new Blob([JSON.stringify(dealer, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'dealer.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importa(file: File) {
    setErrore(null)
    try {
      if (file.name.endsWith('.json')) {
        const d = JSON.parse(await file.text()) as Dealer[]
        onImportaDealer(d)
        setStato(`Importati ${d.length} dealer`)
        return
      }
      const { intestazioni, righe } = await leggiTabella(file)
      const elenco = leggiRigheDealer(intestazioni, righe)
      if (!elenco.length) throw new Error('Nessun dealer nel file: la prima riga deve avere i titoli Ragione Sociale, Indirizzo, Cap, Città')
      // subito al centro del comune (dati già nel programma); la via esatta si cerca dopo, in sottofondo
      const indice = indiceComuni(await loadComuni())
      const out: Dealer[] = []
      const mancanti: string[] = []
      const daCercare: typeof elenco = []
      for (const [i, r] of elenco.entries()) {
        const base = { id: `d-${Date.now()}-${i}`, nome: r.nome, indirizzo: indirizzoCompleto(r), raggioKm: r.raggioKm || 15, via: r.via, cap: r.cap, citta: r.citta }
        const c = r.lat !== null && r.lon !== null ? null : trovaComune(r, indice)
        if (r.lat !== null && r.lon !== null) out.push({ ...base, lat: r.lat, lon: r.lon, posizione: 'indirizzo', cercato: true })
        else if (c) out.push({ ...base, lat: c.lat, lon: c.lon, posizione: 'comune' })
        else daCercare.push(r)
      }
      // città non riconosciute (frazioni, refusi): solo queste si cercano adesso
      for (const [i, r] of daCercare.entries()) {
        setStato(`Cerco ${i + 1} di ${daCercare.length} località non riconosciute: ${r.citta || r.nome}`)
        let trovato: { lat: number; lon: number; precisione: Dealer['posizione'] } | null = null
        for (const t of ricercheDealer(r)) {
          const memoria = giaCercata(t.q)
          const p = await cercaPosizione(t.q).catch(() => null)
          if (!memoria) await new Promise((res) => setTimeout(res, 1100)) // limite del servizio: una richiesta al secondo
          if (p) {
            trovato = { ...p, precisione: t.precisione }
            break
          }
        }
        if (!trovato) {
          mancanti.push(r.nome)
          continue
        }
        out.push({
          id: `d-${Date.now()}-c${i}`, nome: r.nome, indirizzo: indirizzoCompleto(r), raggioKm: r.raggioKm || 15, via: r.via, cap: r.cap, citta: r.citta,
          lat: trovato.lat, lon: trovato.lon, posizione: trovato.precisione, cercato: trovato.precisione === 'indirizzo',
        })
      }
      onImportaDealer(out)
      const daAffinare = out.filter((d) => !d.cercato).length
      setStato(
        [
          `Importati ${out.length} dealer su ${elenco.length}: puoi già lavorare.`,
          daAffinare ? `Per ${daAffinare} cerco ora la via esatta in sottofondo (circa ${Math.max(1, Math.ceil((daAffinare * 2) / 60))} min): intanto stanno al centro del comune, l'avanzamento è sopra l'elenco dei dealer.` : '',
          mancanti.length ? `Non trovati, aggiungili a mano: ${mancanti.join('; ')}.` : '',
        ].filter(Boolean).join(' '),
      )
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Modale titolo="Impostazioni" onClose={onClose}>
      <div className="space-y-5 text-sm">
        {desktop && <OpenapiDesktop />}
        {desktop?.verificaAggiornamenti && <Aggiornamenti />}
        {!desktop && <div>
          <div className="font-bold">Password dell'app</div>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
            Serve solo se hai impostato APP_PASSWORD: nel file impostazioni.txt dell'app locale, o su Vercel. Protegge il credito Openapi.
          </p>
          <div className="mt-2 flex gap-2">
            <input className="input" type="password" value={chiave} onChange={(e) => setChiave(e.target.value)} placeholder="Password" />
            <button className="btn btn-primary" onClick={() => { onSalva({ ...imp, chiaveApp: chiave }); setStato('Password salvata in questo browser') }}>
              Salva
            </button>
          </div>
        </div>}
        <div>
          <div className="font-bold">Elenco dealer</div>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
            Importa da Excel o CSV con le colonne <b>Ragione Sociale, Indirizzo, Cap, Città</b> (Provincia, Lat, Lon e Raggio facoltative). L'import è immediato: ogni dealer va subito nel suo comune, poi la via esatta si cerca da sola in sottofondo mentre lavori. Se una via non si trova, il dealer resta al centro del comune e te lo segnalo. Reimportando lo stesso file i dealer si aggiornano, non si duplicano. Esporta per passare l'elenco a un collega.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Importa
            </button>
            <button className="btn" onClick={esporta}>
              <Download size={15} /> Esporta
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importa(e.target.files[0])} />
        </div>
        {stato && <Avviso tipo="ok">{stato}</Avviso>}
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
      </div>
    </Modale>
  )
}

function OpenapiDesktop() {
  const [stato, setStato] = useState<StatoDesktop | null>(null)
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    desktop?.leggiImpostazioni().then(setStato)
  }, [])
  if (!stato) return null
  return (
    <div>
      <div className="font-bold">Openapi: acquisto dei nominativi</div>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
        Il token si crea su console.openapi.com, servizio Company. Resta su questo PC, cifrato dalla protezione di Windows, e non entra nei file esportati.
      </p>
      <div className="mt-2 text-xs">
        Stato:{' '}
        {stato.haToken ? (
          <b style={{ color: 'var(--good-ink)' }}>token inserito, termina con {stato.tokenFinale}{stato.cifrato ? ', cifrato' : ''}</b>
        ) : (
          <b>nessun token, l'app usa dati dimostrativi</b>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input id="token-openapi" className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={stato.haToken ? 'Incolla un nuovo token per sostituirlo' : 'Incolla il token Openapi'} />
        <button
          className="btn btn-primary"
          disabled={!token.trim()}
          onClick={async () => {
            setStato(await desktop!.salvaImpostazioni({ token }))
            setToken('')
            setMsg('Token salvato')
          }}
        >
          Salva
        </button>
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={stato.sandbox}
          onChange={async (e) => {
            setStato(await desktop!.salvaImpostazioni({ sandbox: e.target.checked }))
            setMsg(e.target.checked ? 'Ambiente di prova attivo: nessun costo' : 'Dati veri attivi: gli acquisti si pagano')
          }}
        />
        <span>
          <b>Ambiente di prova</b>: dati di esempio di Openapi, senza costi. Toglilo per comprare i dati veri.
        </span>
      </label>
      {stato.haToken && (
        <button className="btn mt-2 !py-1 text-xs" onClick={async () => { setStato(await desktop!.salvaImpostazioni({ token: '' })); setMsg('Token rimosso') }}>
          Rimuovi token
        </button>
      )}
      {msg && <div className="mt-2"><Avviso tipo="ok">{msg}</Avviso></div>}
      <div className="mt-3 text-[11px]" style={{ color: 'var(--muted)' }}>Versione {stato.versione} · dati in {stato.cartellaDati}</div>
    </div>
  )
}

function Aggiornamenti() {
  const [s, setS] = useState<StatoAggiornamento | null>(null)
  useEffect(() => {
    desktop?.statoAggiornamento?.().then(setS)
    return desktop?.seguiAggiornamento?.(setS)
  }, [])
  if (!s) return null
  const testo: Record<StatoAggiornamento['fase'], string> = {
    inattivo: 'Controllo automatico all\'avvio e ogni 6 ore',
    verifica: 'Controllo in corso…',
    aggiornato: 'Hai l\'ultima versione',
    download: `Scarico la versione ${s.nuova ?? ''}… ${s.percentuale}%`,
    pronto: `Versione ${s.nuova} pronta: si installa al riavvio`,
    errore: s.messaggio || 'Controllo non riuscito',
  }
  return (
    <div>
      <div className="font-bold">Aggiornamenti</div>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
        Il programma scarica da solo le nuove versioni pubblicate sulla repo GitHub. Dealer, acquisti e liste clienti restano dove sono.
      </p>
      <div className="mt-2 text-xs">
        Versione {s.versione} · <b style={{ color: s.fase === 'errore' ? 'var(--warn)' : s.fase === 'pronto' ? 'var(--good-ink)' : undefined }}>{testo[s.fase]}</b>
      </div>
      {s.fase === 'download' && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
          <div className="h-full" style={{ width: `${s.percentuale}%`, background: 'var(--accent)' }} />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {s.fase === 'pronto' ? (
          <button className="btn btn-primary !py-1 text-xs" onClick={() => desktop!.installaAggiornamento!()}>Riavvia e aggiorna</button>
        ) : (
          <button className="btn !py-1 text-xs" disabled={s.fase === 'verifica' || s.fase === 'download'} onClick={() => desktop!.verificaAggiornamenti!()}>
            Verifica ora
          </button>
        )}
      </div>
    </div>
  )
}

