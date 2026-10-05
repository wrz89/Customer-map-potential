import { MapPin, Search } from 'lucide-react'
import { useState } from 'react'
import { geocodifica, type Dealer, type RisultatoGeocodifica } from '../lib/store'
import { Avviso, BottoneConferma, Modale } from './ui'

export function DealerForm({ iniziale, preset, onSalva, onElimina, onClose }: {
  iniziale?: Dealer
  /** valori di partenza per un nuovo dealer (es. un punto esplorato sulla mappa) */
  preset?: Partial<Dealer>
  onSalva: (d: Dealer) => void
  onElimina?: () => void
  onClose: () => void
}) {
  const base = iniziale ?? preset
  const [nome, setNome] = useState(base?.nome ?? '')
  const [indirizzo, setIndirizzo] = useState(base?.indirizzo ?? '')
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(base?.lat !== undefined && base?.lon !== undefined ? { lat: base.lat, lon: base.lon } : null)
  const [raggio, setRaggio] = useState(base?.raggioKm ?? 15)
  const [note, setNote] = useState(base?.note ?? '')
  const [risultati, setRisultati] = useState<RisultatoGeocodifica[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [cerco, setCerco] = useState(false)

  async function cerca() {
    setErrore(null)
    setCerco(true)
    try {
      const r = await geocodifica(indirizzo)
      setRisultati(r)
      if (!r.length) setErrore('Indirizzo non trovato. Prova con via, numero civico e comune.')
      if (r.length === 1) setPos({ lat: r[0].lat, lon: r[0].lon })
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setCerco(false)
    }
  }

  const valido = nome.trim() && pos
  return (
    <Modale titolo={iniziale ? 'Modifica dealer' : 'Nuovo dealer'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold">
          Nome
          <input className="input mt-1" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Rossi Gomme · SuperService Pavia" />
        </label>
        <div className="text-xs font-semibold">
          Indirizzo del punto vendita
          <div className="mt-1 flex gap-2">
            <input
              className="input"
              value={indirizzo}
              onChange={(e) => setIndirizzo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cerca()}
              placeholder="Via, numero, comune"
            />
            <button className="btn" onClick={cerca} disabled={!indirizzo.trim() || cerco}>
              <Search size={15} /> {cerco ? '…' : 'Cerca'}
            </button>
          </div>
        </div>
        {risultati.length > 1 && (
          <div className="max-h-40 space-y-1 overflow-auto">
            {risultati.map((r) => (
              <button
                key={`${r.lat},${r.lon}`}
                className="flex w-full items-start gap-2 rounded-lg border p-2 text-left text-xs"
                style={{ borderColor: pos?.lat === r.lat && pos?.lon === r.lon ? 'var(--brand-2)' : 'var(--line)' }}
                onClick={() => setPos({ lat: r.lat, lon: r.lon })}
              >
                <MapPin size={14} className="mt-0.5 shrink-0" />
                {r.nome}
              </button>
            ))}
          </div>
        )}
        {pos && (
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
            Posizione: <span className="num">{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold">
            Latitudine
            <input className="input mt-1" type="number" step="0.0001" value={pos?.lat ?? ''} onChange={(e) => setPos({ lat: Number(e.target.value), lon: pos?.lon ?? 0 })} />
          </label>
          <label className="text-xs font-semibold">
            Longitudine
            <input className="input mt-1" type="number" step="0.0001" value={pos?.lon ?? ''} onChange={(e) => setPos({ lat: pos?.lat ?? 0, lon: Number(e.target.value) })} />
          </label>
        </div>
        <label className="block text-xs font-semibold">
          Raggio predefinito: {raggio} km
          <input type="range" min={5} max={50} step={5} value={raggio} onChange={(e) => setRaggio(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="block text-xs font-semibold">
          Note
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        <div className="flex justify-between pt-2">
          <div>
            {onElimina && (
              <BottoneConferma style={{ color: 'var(--critical)' }} domanda="Sì, elimina" onConferma={onElimina}>
                Elimina
              </BottoneConferma>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>Annulla</button>
            <button
              className="btn btn-primary"
              disabled={!valido}
              onClick={() =>
                pos &&
                onSalva({
                  id: iniziale?.id ?? `d-${Date.now()}`,
                  nome: nome.trim(),
                  indirizzo: indirizzo.trim(),
                  lat: pos.lat,
                  lon: pos.lon,
                  raggioKm: raggio,
                  note: note.trim() || undefined,
                })
              }
            >
              Salva
            </button>
          </div>
        </div>
      </div>
    </Modale>
  )
}
