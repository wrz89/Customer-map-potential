import { CLASSI_ADDETTI } from '../lib/categories'
import { compatto, n0, n1, pct } from '../lib/fmt'
import { etichettaAnello } from '../lib/geo'
import type { ComuneZona, Zona } from '../lib/zone'
import { Barra, Sezione, Tabella, type Colonna } from './ui'

export default function Territorio({ zona, evidenziato }: { zona: Zona; evidenziato?: string | null }) {
  const maxAuto = Math.max(...zona.anelli.map((a) => a.autovetture))
  const col: Colonna<ComuneZona>[] = [
    { id: 'nome', label: 'Comune', valore: (z) => z.comune.n, render: (z) => <span className={`whitespace-nowrap ${z.comune.c === evidenziato ? 'font-bold' : 'font-medium'}`} style={z.comune.c === evidenziato ? { color: 'var(--brand-2)' } : undefined}>{z.comune.n} <span style={{ color: 'var(--muted)' }}>{z.comune.p}</span></span> },
    { id: 'dist', label: 'Km', valore: (z) => z.distanzaKm, render: (z) => n1(z.distanzaKm), destra: true },
    { id: 'quota', label: '% nel raggio', valore: (z) => z.quota, render: (z) => pct(z.quota), destra: true },
    { id: 'pop', label: 'Abitanti', valore: (z) => z.totali.pop, render: (z) => n0(z.totali.pop), destra: true },
    { id: 'auto', label: 'Autovetture', valore: (z) => z.totali.autovetture, render: (z) => n0(z.totali.autovetture), destra: true },
    { id: 'merci', label: 'Veicoli merci', valore: (z) => z.totali.autocarri, render: (z) => n0(z.totali.autocarri), destra: true },
    { id: 'pes', label: 'Pesanti e rimorchi', valore: (z) => z.totali.pesanti, render: (z) => n0(z.totali.pesanti), destra: true },
    { id: 'ul', label: 'Unità locali', valore: (z) => z.totali.unitaLocali, render: (z) => n0(z.totali.unitaLocali), destra: true },
    { id: 'add', label: 'Addetti', valore: (z) => z.totali.addetti, render: (z) => n0(z.totali.addetti), destra: true },
    { id: 'ul50', label: 'UL 50+ add.', valore: (z) => z.totali.ulClassi[2] + z.totali.ulClassi[3], render: (z) => n0(z.totali.ulClassi[2] + z.totali.ulClassi[3]), destra: true },
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
                <td className="whitespace-nowrap">Totale {zona.raggioKm} km</td>
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
      <Sezione titolo={`Comuni nel raggio (${zona.comuni.length})`} sotto="Clic sulle intestazioni per ordinare. Il clic su un comune in mappa lo evidenzia qui.">
        <div className="max-h-[560px] overflow-auto">
          <Tabella righe={zona.comuni} colonne={col} chiave={(z) => z.comune.c} ordineIniziale={{ id: 'dist', desc: false }} />
        </div>
      </Sezione>
    </div>
  )
}
