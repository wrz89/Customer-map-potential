import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

/** Una cella dell'indicatore in alto: sobria, su una riga, senza bordi propri (li disegna KpiRiga). */
export function Kpi({ label, valore, sotto, icona }: { label: string; valore: string; sotto?: string; icona?: ReactNode }) {
  return (
    <div className="min-w-0 px-3.5 py-2.5" style={{ background: 'var(--surface)' }} title={`${label}: ${valore}${sotto ? ` · ${sotto}` : ''}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: 'var(--muted)' }}>
        {icona}
        <span className="truncate">{label}</span>
      </div>
      <div className="num mt-0.5 whitespace-nowrap text-[17px] font-semibold leading-tight">{valore}</div>
      <div className="truncate text-[10.5px] leading-snug" style={{ color: 'var(--ink-2)', minHeight: '1.1em' }}>{sotto ?? ''}</div>
    </div>
  )
}

/** Gli indicatori in un unico riquadro, separati da filetti sottili. */
export function KpiRiga({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-4 xl:grid-cols-8"
      style={{ borderColor: 'var(--line)', background: 'var(--line)', boxShadow: 'var(--shadow)' }}
    >
      {children}
    </div>
  )
}

export function Badge({ children, colore }: { children: ReactNode; colore?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
    >
      {colore && <span className="inline-block h-2 w-2 rounded-full" style={{ background: colore }} />}
      {children}
    </span>
  )
}

export function FlottaBadge({ f }: { f: string }) {
  if (!f) return <span style={{ color: 'var(--muted)' }}>–</span>
  return <Badge colore={`var(--flotta-${f.toLowerCase()})`}>{f}</Badge>
}

/** Barra orizzontale semplice con tooltip. */
export function Barra({ valore, max, colore = 'var(--seq-4)', titolo }: { valore: number; max: number; colore?: string; titolo?: string }) {
  const w = max > 0 ? Math.max(0.5, (valore / max) * 100) : 0
  return (
    <div className="h-2.5 w-full rounded-full" style={{ background: 'var(--surface-2)' }} title={titolo}>
      <div className="h-2.5 rounded-full transition-all" style={{ width: `${w}%`, background: colore }} />
    </div>
  )
}

export interface Colonna<T> {
  id: string
  label: string
  valore: (r: T) => string | number | null | undefined
  render?: (r: T) => ReactNode
  destra?: boolean
  larghezza?: number
}

export function Tabella<T>({ righe, colonne, chiave, ordineIniziale, maxRighe = 500, vuoto }: {
  righe: T[]
  colonne: Colonna<T>[]
  chiave: (r: T) => string
  ordineIniziale?: { id: string; desc: boolean }
  maxRighe?: number
  vuoto?: ReactNode
}) {
  const [ordine, setOrdine] = useState(ordineIniziale)
  const ordinate = useMemo(() => {
    if (!ordine) return righe
    const col = colonne.find((c) => c.id === ordine.id)
    if (!col) return righe
    return [...righe].sort((a, b) => {
      const va = col.valore(a)
      const vb = col.valore(b)
      if (va === vb) return 0
      if (va === null || va === undefined || va === '') return 1
      if (vb === null || vb === undefined || vb === '') return -1
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'it')
      return ordine.desc ? -r : r
    })
  }, [righe, colonne, ordine])
  if (!righe.length) return <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>{vuoto ?? 'Nessun dato'}</div>
  return (
    <div>
      <table className="tbl">
        <thead>
          <tr>
            {colonne.map((c) => (
              <th
                key={c.id}
                className={`${c.destra ? 'r' : ''} cursor-pointer select-none`}
                style={c.larghezza ? { width: c.larghezza } : undefined}
                onClick={() => setOrdine((o) => ({ id: c.id, desc: o?.id === c.id ? !o.desc : true }))}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {ordine?.id === c.id && (ordine.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordinate.slice(0, maxRighe).map((r) => (
            <tr key={chiave(r)}>
              {colonne.map((c) => (
                <td key={c.id} className={c.destra ? 'r' : ''}>
                  {c.render ? c.render(r) : (c.valore(r) ?? '–')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ordinate.length > maxRighe && (
        <div className="p-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
          Mostrate {maxRighe} righe su {ordinate.length}. L'export Excel le contiene tutte.
        </div>
      )}
    </div>
  )
}

export function Sezione({ titolo, sotto, azioni, children }: { titolo: string; sotto?: ReactNode; azioni?: ReactNode; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
        <div>
          <h2 className="text-[15px] font-bold">{titolo}</h2>
          {sotto && <div className="text-xs" style={{ color: 'var(--ink-2)' }}>{sotto}</div>}
        </div>
        {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
      </div>
      {children}
    </section>
  )
}

export function Avviso({ tipo = 'info', children }: { tipo?: 'info' | 'warn' | 'errore' | 'ok'; children: ReactNode }) {
  const c = { info: 'var(--seq-4)', warn: 'var(--warn)', errore: 'var(--critical)', ok: 'var(--good)' }[tipo]
  return (
    <div className="rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: c, background: 'var(--surface-2)', borderLeftWidth: 4 }}>
      {children}
    </div>
  )
}

export function Modale({ titolo, onClose, children, largo }: { titolo: string; onClose: () => void; children: ReactNode; largo?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.45)' }} onClick={onClose}>
      <div className={`card max-h-[90vh] w-full overflow-auto ${largo ? 'max-w-3xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-base font-bold">{titolo}</h3>
          <button className="btn !px-2 !py-1" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/** Pulsante a due tempi: il primo clic chiede conferma dentro la pagina, il secondo esegue. */
export function BottoneConferma({ onConferma, children, domanda = 'Confermi?', className = 'btn', title, style }: {
  onConferma: () => void
  children: ReactNode
  domanda?: string
  className?: string
  title?: string
  style?: React.CSSProperties
}) {
  const [chiede, setChiede] = useState(false)
  useEffect(() => {
    if (!chiede) return
    const t = setTimeout(() => setChiede(false), 4000)
    return () => clearTimeout(t)
  }, [chiede])
  return (
    <button
      className={className}
      title={title}
      style={chiede ? { ...style, background: 'var(--critical)', borderColor: 'var(--critical)', color: '#fff' } : style}
      onClick={() => {
        if (chiede) {
          setChiede(false)
          onConferma()
        } else setChiede(true)
      }}
    >
      {chiede ? domanda : children}
    </button>
  )
}
