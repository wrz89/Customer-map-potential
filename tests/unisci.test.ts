import { describe, expect, it } from 'vitest'
import type { Azienda } from '../src/lib/companies'
import { unisciConOsm } from '../src/lib/unisci'

const base: Azienda = { id: '', ragioneSociale: '', piva: '', ateco: '', atecoDescr: '', categoria: '', flotta: '', dipendenti: null, fatturato: null, annoBilancio: null, formaGiuridica: '', indirizzo: '', cap: '', comune: '', provincia: '', pec: '', lat: null, lon: null, distanzaKm: null, fonte: 'import' }
const osm = (id: string, nome: string, lat: number, lon: number, extra: Partial<Azienda> = {}): Azienda => ({ ...base, id, ragioneSociale: nome, fonte: 'osm', lat, lon, posizione: 'indirizzo', cercato: true, ...extra })
const telemaco = (id: string, nome: string, extra: Partial<Azienda> = {}): Azienda => ({ ...base, id, ragioneSociale: nome, piva: '01234567890', ateco: '69.10.10', dipendenti: 4, fonte: 'import', lat: 45.46, lon: 9.19, posizione: 'comune', comune: 'MILANO', ...extra })

describe('unione OpenStreetMap + Telemaco', () => {
  it('stessa impresa: partita IVA e addetti di Telemaco, posizione e telefono di OpenStreetMap', () => {
    const { elenco, uniti } = unisciConOsm([
      telemaco('t1', 'STUDIO LEGALE ROSSI & ASSOCIATI SRL'),
      osm('o1', 'Studio Legale Rossi', 45.4645, 9.1903, { contatto: '+39 02 111', indirizzo: 'Via Dante 5' }),
      osm('o2', 'Bar Sport', 45.465, 9.191),
    ])
    expect(elenco).toHaveLength(2) // Telemaco unito + Bar Sport
    const u = elenco.find((a) => a.id === 't1')!
    expect(u).toMatchObject({ piva: '01234567890', dipendenti: 4, lat: 45.4645, lon: 9.1903, posizione: 'indirizzo', contatto: '+39 02 111', indirizzo: 'Via Dante 5', fonte: 'import' })
    expect(elenco.some((a) => a.id === 'o1')).toBe(false)
    expect(uniti.has('t1')).toBe(true)
  })

  it('nomi diversi o comune diverso: restano due record', () => {
    const { elenco, uniti } = unisciConOsm([
      telemaco('t1', 'GOMME MARINI SRL'),
      osm('o1', 'Panetteria Luna', 45.4645, 9.1903),
      telemaco('t2', 'STUDIO LEGALE ROSSI', { piva: '09999999999', comune: 'LODI' }),
      osm('o2', 'Studio Legale Rossi', 45.4645, 9.1903, { comune: 'Milano' }),
    ])
    expect(elenco).toHaveLength(4)
    expect(uniti.size).toBe(0)
  })

  it('con posizione esatta serve la vicinanza: stesso nome a 2 km non è la stessa impresa', () => {
    const { elenco } = unisciConOsm([
      telemaco('t1', 'BAR SPORT SNC', { posizione: 'indirizzo', lat: 45.48, lon: 9.21 }),
      osm('o1', 'Bar Sport', 45.4645, 9.1903),
    ])
    expect(elenco).toHaveLength(2)
  })

  it('un record OpenStreetMap si abbina a una sola impresa, e senza OSM non cambia nulla', () => {
    const { elenco } = unisciConOsm([telemaco('t1', 'BAR SPORT SNC'), telemaco('t2', 'BAR SPORT SRL', { piva: '07777777777' }), osm('o1', 'Bar Sport', 45.4645, 9.1903)])
    expect(elenco.filter((a) => a.posizione === 'indirizzo')).toHaveLength(1)
    const solo = [telemaco('t1', 'X SRL')]
    expect(unisciConOsm(solo).elenco).toBe(solo)
  })
})
