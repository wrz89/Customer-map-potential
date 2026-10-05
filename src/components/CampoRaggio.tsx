import { useEffect, useState } from 'react'
import { distKm } from '../lib/fmt'
import { RAGGI_RAPIDI, RAGGIO_MAX_KM, RAGGIO_MIN_KM, leggiRaggio } from '../lib/raggio'

const mostra = (km: number) => String(Math.round(km * 1000))

/**
 * Raggio in metri: si scrive il numero (500, 1500, "2 km") e si conferma con Invio o uscendo dal campo,
 * oppure si sceglie uno dei raggi rapidi. I km restano il valore salvato.
 */
export function CampoRaggio({ valoreKm, onChange, compatto = false }: { valoreKm: number; onChange: (km: number) => void; compatto?: boolean }) {
  const [testo, setTesto] = useState(mostra(valoreKm))
  const [errore, setErrore] = useState(false)
  useEffect(() => {
    setTesto(mostra(valoreKm))
    setErrore(false)
  }, [valoreKm])

  function conferma() {
    const km = leggiRaggio(testo)
    if (km === null) {
      setErrore(true)
      return
    }
    setErrore(false)
    setTesto(mostra(km))
    if (km !== valoreKm) onChange(km)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-lg border px-2 py-1" style={{ borderColor: errore ? 'var(--warn)' : 'var(--line)', background: 'var(--surface-2)' }}>
        <input
          className="num w-16 bg-transparent text-right text-sm font-bold outline-none"
          inputMode="numeric"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onBlur={conferma}
          onKeyDown={(e) => {
            if (e.key === 'Enter') conferma()
            if (e.key === 'Escape') setTesto(mostra(valoreKm))
          }}
          aria-label="Raggio in metri"
          title={`Raggio in metri, da ${RAGGIO_MIN_KM * 1000} a ${RAGGIO_MAX_KM * 1000}. Puoi scrivere anche "2 km".`}
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>metri</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {RAGGI_RAPIDI.filter((r) => !compatto || r === 0.5 || r === 1 || r === 5 || r === 15 || r === 50).map((r) => (
          <button
            key={r}
            type="button"
            className="rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
            style={Math.abs(r - valoreKm) < 1e-6 ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : { borderColor: 'var(--line)', color: 'var(--ink-2)' }}
            onClick={() => onChange(r)}
          >
            {distKm(r)}
          </button>
        ))}
      </div>
      {errore && <span className="text-[11px]" style={{ color: 'var(--warn)' }}>Scrivi un numero di metri, per esempio 500</span>}
    </div>
  )
}
