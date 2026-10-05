import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { CATEGORIE, CLASSI_ADDETTI } from '../lib/categories'
import type { Meta } from '../lib/data'
import { compatto, n0 } from '../lib/fmt'
import type { Zona } from '../lib/zone'
import { Barra, FlottaBadge, Sezione } from './ui'

type Ordine = 'addetti' | 'ul10' | 'ul50'

export default function Settori({ zona, meta }: { zona: Zona; meta: Meta | null }) {
  const [ordine, setOrdine] = useState<Ordine>('addetti')
  const [aperte, setAperte] = useState<Set<string>>(new Set())
  const valore = (c: { addetti: number; ulClassi: number[] }) =>
    ordine === 'addetti' ? c.addetti : ordine === 'ul10' ? c.ulClassi[1] + c.ulClassi[2] + c.ulClassi[3] : c.ulClassi[2] + c.ulClassi[3]
  const categorie = useMemo(() => [...zona.categorie].sort((a, b) => valore(b) - valore(a)), [zona, ordine]) // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(...categorie.map(valore), 1)
  const etichetta = { addetti: 'Addetti', ul10: 'Unità locali con 10+ addetti', ul50: 'Unità locali con 50+ addetti' }[ordine]

  const toggle = (id: string) =>
    setAperte((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Sezione
      titolo="Settori economici nel raggio"
      sotto="ISTAT, unità locali 2023: ogni sede operativa conta nel comune dove si trova, anche se la sede legale è altrove"
      azioni={
        <div className="flex rounded-lg border p-0.5 text-xs" style={{ borderColor: 'var(--line)' }}>
          {(['addetti', 'ul10', 'ul50'] as Ordine[]).map((o) => (
            <button
              key={o}
              onClick={() => setOrdine(o)}
              className="rounded-md px-2.5 py-1 font-semibold"
              style={ordine === o ? { background: 'var(--brand)', color: 'var(--surface)' } : { color: 'var(--ink-2)' }}
            >
              {{ addetti: 'Addetti', ul10: 'UL 10+', ul50: 'UL 50+' }[o]}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Flotta</th>
              <th style={{ width: '24%' }}>{etichetta}</th>
              <th className="r">Unità locali</th>
              <th className="r">Addetti</th>
              {CLASSI_ADDETTI.map((c) => (
                <th key={c.id} className="r">UL {c.nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorie.map((c) => {
              const aperta = aperte.has(c.id)
              const divisioni = zona.settori.filter((s) => s.categoriaId === c.id)
              return (
                <Fragment key={c.id}>
                  <tr className="cursor-pointer" onClick={() => toggle(c.id)}>
                    <td>
                      <div className="flex items-center gap-1.5 font-semibold">
                        {aperta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {c.nome}
                      </div>
                      <div className="pl-5 text-[11px]" style={{ color: 'var(--muted)' }}>{c.nota}</div>
                    </td>
                    <td><FlottaBadge f={c.flotta} /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><Barra valore={valore(c)} max={max} colore={`var(--flotta-${c.flotta.toLowerCase()})`} titolo={`${n0(valore(c))}`} /></div>
                        <span className="num w-16 text-right font-semibold">{compatto(valore(c))}</span>
                      </div>
                    </td>
                    <td className="r">{n0(c.unitaLocali)}</td>
                    <td className="r">{n0(c.addetti)}</td>
                    {c.ulClassi.map((v, i) => (
                      <td key={i} className="r">{n0(v)}</td>
                    ))}
                  </tr>
                  {aperta &&
                    divisioni.map((s) => (
                      <tr key={s.divisione} style={{ background: 'var(--surface-2)' }}>
                        <td colSpan={2} className="pl-8 text-xs">
                          <span className="num font-semibold">{s.divisione}</span> {meta?.ateco[s.divisione] ?? ''}
                        </td>
                        <td>
                          <Barra valore={valore(s)} max={max} colore="var(--seq-3)" />
                        </td>
                        <td className="r text-xs">{n0(s.unitaLocali)}</td>
                        <td className="r text-xs">{n0(s.addetti)}</td>
                        {s.ulClassi.map((v, i) => (
                          <td key={i} className="r text-xs">{n0(v)}</td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t px-4 py-2 text-[11px]" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
        Esclusi da ISTAT: agricoltura e pubblica amministrazione. Intensità flotta: stima per settore ({CATEGORIE.filter((c) => c.flotta === 'Alta').length} categorie ad alta intensità), non un dato.
      </div>
    </Sezione>
  )
}
