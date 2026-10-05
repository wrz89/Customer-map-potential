import { describe, expect, it } from 'vitest'
import { indirizzoCompleto, leggiRigheDealer, nomeProprio, normalizzaCap, ricercheDealer } from '../src/lib/importaDealer'

// formato dell'elenco della rete: Ragione Sociale | Indirizzo | Cap | Città
const intestazioni = ['Ragione Sociale', 'Indirizzo', 'Cap', 'Città']
const righe = [
  { 'Ragione Sociale': 'ACERBI PNEUMATICI SRL', Indirizzo: 'Via Cerati, 5/c', Cap: '43100', Città: 'PARMA' },
  { 'Ragione Sociale': 'AdriaGomme srl', Indirizzo: 'Zona Artigianale Zgonik Via Stazione di Prosecco 12', Cap: '34010', Città: 'SGONICO' },
  { 'Ragione Sociale': '', Indirizzo: '', Cap: '', Città: '' },
  { 'Ragione Sociale': 'Gomme Roma', Indirizzo: 'Via Appia 1', Cap: '100', Città: 'ROMA' },
]

describe('import dealer', () => {
  it('legge il formato Ragione Sociale / Indirizzo / Cap / Città', () => {
    const r = leggiRigheDealer(intestazioni, righe)
    expect(r).toHaveLength(3)
    expect(r[0]).toMatchObject({ nome: 'ACERBI PNEUMATICI SRL', via: 'Via Cerati, 5/c', cap: '43100', citta: 'Parma' })
    expect(indirizzoCompleto(r[0])).toBe('Via Cerati, 5/c, 43100 Parma')
    expect(r[2].cap).toBe('00100')
  })

  it('normalizza città e CAP', () => {
    expect(nomeProprio('SAN DONATO MILANESE')).toBe('San Donato Milanese')
    expect(nomeProprio("SANT'ANGELO LODIGIANO")).toBe("Sant'Angelo Lodigiano")
    expect(nomeProprio('Reggio nell\'Emilia')).toBe("Reggio nell'Emilia")
    expect(normalizzaCap('20090')).toBe('20090')
  })

  it('prova prima la via, poi CAP e comune', () => {
    const [, adria] = leggiRigheDealer(intestazioni, righe)
    const prove = ricercheDealer(adria)
    expect(prove[0]).toMatchObject({ precisione: 'indirizzo', q: { via: adria.via, cap: '34010', citta: 'Sgonico' } })
    expect(prove.some((p) => p.q.via === 'Via Stazione di Prosecco 12')).toBe(true)
    expect(prove.some((p) => p.q.testo === 'Zona Artigianale Sgonico' && p.precisione === 'indirizzo')).toBe(true)
    expect(prove.at(-2)).toMatchObject({ precisione: 'cap', q: { cap: '34010', citta: 'Sgonico' } })
    expect(prove.at(-1)).toMatchObject({ precisione: 'comune', q: { citta: 'Sgonico' } })
  })

  it('spiega le colonne mancanti', () => {
    expect(() => leggiRigheDealer(['Codice', 'Note'], [])).toThrow(/Ragione Sociale, Indirizzo, Cap e Città/)
  })
})
