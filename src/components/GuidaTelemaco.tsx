import { Check, ClipboardCopy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PACCHETTI_ATECO, NOME_SOGLIA, codiciPacchetti, costoTelemaco, stimaPacchetto } from '../lib/atecoTelemaco'
import { FLOTTA_COLORE } from '../lib/categories'
import { distKm, eur, n0 } from '../lib/fmt'
import type { Zona } from '../lib/zone'
import { Avviso, Sezione } from './ui'

/** Quali codici ATECO chiedere a Telemaco, e quanto costerà in questa zona. */
export function GuidaTelemaco({ zona }: { zona: Zona }) {
  const [scelti, setScelti] = useState<string[]>(['flotta-mestiere', 'lavora-con-auto'])
  const [copiato, setCopiato] = useState(false)
  // taglia minima per pacchetto: parte dal valore consigliato, la cambi tu
  const [soglie, setSoglie] = useState<Record<string, 0 | 1 | 2>>({})
  const soglia = (p: (typeof PACCHETTI_ATECO)[number]) => soglie[p.id] ?? p.soglia

  const righe = useMemo(() => PACCHETTI_ATECO.map((p) => ({ p, ...stimaPacchetto(zona, p, soglie[p.id] ?? p.soglia) })), [zona, soglie])
  const imprese = righe.filter((r) => scelti.includes(r.p.id)).reduce((s, r) => s + r.imprese, 0)
  const codici = codiciPacchetti(scelti)

  async function copia() {
    try {
      await navigator.clipboard.writeText(codici.join(', '))
      setCopiato(true)
      setTimeout(() => setCopiato(false), 2500)
    } catch {
      /* clipboard non disponibile: i codici restano visibili sotto */
    }
  }

  return (
    <Sezione
      titolo="Quali codici ATECO chiedere a Telemaco"
      sotto="Clienti che usano auto per lavorare, o che lavorano con le auto. L'ATECO dice che mestiere fa l'impresa, non quante auto ha: si sceglie per settore e per taglia."
    >
      <div className="grid gap-2 p-4">
        {righe.map(({ p, imprese: n, parziale }) => {
          const on = scelti.includes(p.id)
          return (
            <div key={p.id} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: on ? 'var(--brand)' : 'var(--line)' }}>
              <input type="checkbox" id={`pk-${p.id}`} className="mt-1" checked={on} onChange={() => setScelti((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FLOTTA_COLORE[p.flotta].light }} />
                  <label htmlFor={`pk-${p.id}`} className="cursor-pointer text-sm font-bold">{p.nome}</label>
                  <select
                    className="rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ borderColor: 'var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)' }}
                    value={soglia(p)}
                    onChange={(e) => setSoglie((x) => ({ ...x, [p.id]: Number(e.target.value) as 0 | 1 | 2 }))}
                    aria-label={`Taglia minima per ${p.nome}`}
                  >
                    {NOME_SOGLIA.map((n, i) => (
                      <option key={n} value={i}>{n}{i === p.soglia ? ' (consigliato)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>{p.perche}</div>
                {p.nota && <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--warn)' }}>{p.nota}</div>}
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer font-semibold" style={{ color: 'var(--ink-2)' }}>Codici ({p.voci.length})</summary>
                  <ul className="mt-1 columns-1 gap-4 sm:columns-2">
                    {p.voci.map((v) => (
                      <li key={v.codice} className="break-inside-avoid"><b className="num">{v.codice}</b> {v.nome}</li>
                    ))}
                  </ul>
                </details>
              </div>
              <div className="shrink-0 text-right text-xs">
                <div className="num text-base font-bold">{parziale ? '≥ ' : ''}{n0(n)}</div>
                <div style={{ color: 'var(--muted)' }}>imprese in zona</div>
              </div>
            </div>
          )
        })}

        <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <div className="text-sm">
            <b className="num">{n0(imprese)}</b> imprese attese entro {distKm(zona.raggioKm)} ·{' '}
            Indirizzi <b className="num">{eur(costoTelemaco(imprese, 'indirizzi'))}</b> · Esteso <b className="num">{eur(costoTelemaco(imprese, 'esteso'))}</b>
          </div>
          <button className="btn ml-auto !py-1 text-xs" onClick={copia} disabled={!codici.length}>
            {copiato ? <Check size={14} /> : <ClipboardCopy size={14} />} {copiato ? 'Copiati' : `Copia ${codici.length} codici`}
          </button>
        </div>
        {imprese > 1500 && (
          <Avviso tipo="warn">
            Elenco grande: {n0(imprese)} imprese costerebbero {eur(costoTelemaco(imprese, 'indirizzi'))} anche solo con gli indirizzi. Restringi il raggio, scegli un solo CAP su Telemaco, oppure compra solo i pacchetti con taglia minima.
          </Avviso>
        )}
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
          Stima dai dati ISTAT delle unità locali per settore e classe di addetti, ripartiti per superficie: è un ordine di grandezza, non il numero esatto di Telemaco. Il costo è 5 € a elenco più 0,02 € (Indirizzi) o 0,12 € (Esteso) a impresa. Su Telemaco imposta anche CAP o comune della zona e la taglia minima scelta.
          Con i soli codici a 2 cifre l'elenco comprende tutto il settore; dove il codice ha un punto (per esempio 77.1) basta quella parte, e il numero indicato con ≥ non la conta.
        </p>
      </div>
    </Sezione>
  )
}
