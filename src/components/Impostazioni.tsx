import { Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { desktop, type StatoDesktop } from '../lib/ambiente'
import { indovinaColonne, leggiTabella, numero } from '../lib/leggiFile'
import { geocodifica, type Dealer, type Impostazioni as Imp } from '../lib/store'
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
      const m = indovinaColonne(intestazioni)
      const colNome = intestazioni.find((h) => /(dealer|nome|ragione|punto)/i.test(h)) ?? m.ragioneSociale
      const colLat = intestazioni.find((h) => /^lat/i.test(h))
      const colLon = intestazioni.find((h) => /^(lon|lng)/i.test(h))
      const colRaggio = intestazioni.find((h) => /raggio/i.test(h))
      if (!colNome || !m.indirizzo) throw new Error(`Servono almeno le colonne Nome e Indirizzo. Colonne lette: ${intestazioni.join(', ')}`)
      const out: Dealer[] = []
      for (const [i, r] of righe.entries()) {
        const indirizzo = [r[m.indirizzo], m.comune ? r[m.comune] : ''].filter(Boolean).join(', ')
        let lat = colLat ? numero(r[colLat]) : null
        let lon = colLon ? numero(r[colLon]) : null
        if (lat === null || lon === null) {
          setStato(`Cerco l'indirizzo ${i + 1} di ${righe.length}: ${indirizzo}`)
          const g = await geocodifica(indirizzo).catch(() => [])
          await new Promise((res) => setTimeout(res, 1100)) // limite Nominatim: 1 richiesta al secondo
          if (!g.length) continue
          lat = g[0].lat
          lon = g[0].lon
        }
        out.push({ id: `d-${Date.now()}-${i}`, nome: r[colNome], indirizzo, lat, lon, raggioKm: (colRaggio && numero(r[colRaggio])) || 15 })
      }
      onImportaDealer(out)
      setStato(`Importati ${out.length} dealer su ${righe.length}${out.length < righe.length ? ': quelli mancanti hanno un indirizzo non trovato' : ''}`)
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
            Importa da Excel o CSV con colonne Nome e Indirizzo (Comune, Lat, Lon e Raggio facoltative): gli indirizzi si cercano da soli, uno al secondo. Esporta per passare l'elenco a un collega.
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
