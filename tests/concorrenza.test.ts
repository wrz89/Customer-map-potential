import { describe, expect, it } from 'vitest'
import { classificaOfficina, convertiElementi } from '../src/lib/concorrenza'

describe('classificaOfficina', () => {
  it('riconosce reti e gruppi dal nome o dal marchio', () => {
    expect(classificaOfficina({ shop: 'tyres', name: 'Driver Center Rossi Gomme' })).toEqual({ gommista: true, rete: 'Driver Center', gruppo: 'Pirelli' })
    expect(classificaOfficina({ shop: 'tyres', brand: 'First Stop' }).gruppo).toBe('Bridgestone')
    expect(classificaOfficina({ shop: 'car_repair', name: 'Bosch Car Service Bianchi' })).toEqual({ gommista: false, rete: 'Bosch Car Service', gruppo: 'Bosch' })
    expect(classificaOfficina({ shop: 'tyres', name: 'Super Service Pneus' }).rete).toBe('SuperService')
  })
  it('distingue gommisti e officine generiche', () => {
    expect(classificaOfficina({ shop: 'car_repair', name: 'Autofficina Verdi' }).gommista).toBe(false)
    expect(classificaOfficina({ shop: 'car_repair', name: 'Gommista Verdi' }).gommista).toBe(true)
    expect(classificaOfficina({ shop: 'car_repair', 'service:tyres': 'yes' }).gommista).toBe(true)
    expect(classificaOfficina({ shop: 'tyres', name: 'Gomme Neri' }).rete).toBe('')
  })
})

describe('convertiElementi', () => {
  it('tiene solo i punti nel raggio e usa il centro per le aree', () => {
    const r = convertiElementi(
      [
        { lat: 45.19, lon: 9.16, tags: { shop: 'tyres', name: 'A' } },
        { center: { lat: 45.2, lon: 9.17 }, tags: { shop: 'car_repair', name: 'B' } },
        { lat: 46.5, lon: 9.2, tags: { shop: 'tyres', name: 'Lontano' } },
      ],
      45.1847,
      9.1582,
      15,
    )
    expect(r.map((x) => x.nome)).toEqual(['A', 'B'])
  })
})

import { daRegistro, unisciConcorrenti } from '../src/lib/concorrenza'
import { arricchisci } from '../src/lib/companies'

const centro = { lat: 45.1847, lon: 9.1582 }
const gommista = (nome: string, lat: number | null, lon: number | null, fonte: 'openapi' | 'import' = 'openapi') =>
  arricchisci({ id: nome, ragioneSociale: nome, piva: '0', ateco: '45.20.40', atecoDescr: '', dipendenti: 2, fatturato: null, annoBilancio: null, formaGiuridica: '', indirizzo: 'Via Roma 1', cap: '', comune: 'PAVIA', provincia: 'PV', pec: '', lat, lon, fonte }, centro)

describe('Registro Imprese come concorrenza', () => {
  it('tiene i gommisti nel raggio e riconosce le reti dal nome', () => {
    const r = daRegistro([gommista('FIRST STOP ROSSI SRL', 45.19, 9.16), gommista('LONTANO SNC', 46.5, 9.2), gommista('SENZA COMUNE', null, null)], centro.lat, centro.lon, 15)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ rete: 'First Stop', gruppo: 'Bridgestone', fonte: 'registro', gommista: true })
  })
  it('un punto OpenStreetMap a meno di 150 m da un gommista del Registro non si conta due volte', () => {
    const reg = daRegistro([gommista('GOMME BIANCHI', 45.19, 9.16)], centro.lat, centro.lon, 15)
    const osm = [
      { lat: 45.1901, lon: 9.1601, gommista: true, rete: '', gruppo: '', nome: 'Bianchi Gomme', distanzaKm: 0.8, fonte: 'osm' as const },
      { lat: 45.2, lon: 9.2, gommista: true, rete: '', gruppo: '', nome: 'Altro', distanzaKm: 3, fonte: 'osm' as const },
    ]
    const u = unisciConcorrenti(reg, osm)
    expect(u.map((c) => c.nome)).toEqual(['GOMME BIANCHI', 'Altro'])
  })
  it('senza Registro restano i punti OpenStreetMap', () => {
    expect(unisciConcorrenti([], [{ lat: 1, lon: 1, gommista: true, rete: '', gruppo: '', nome: 'X', distanzaKm: 1 }])).toHaveLength(1)
  })
})
