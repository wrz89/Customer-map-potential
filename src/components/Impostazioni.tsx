import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
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
        <div>
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
        </div>
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
