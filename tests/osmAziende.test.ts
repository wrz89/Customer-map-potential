import { describe, expect, it } from 'vitest'
import { RAGGIO_MAX_OSM_KM, cercaAttivitaOsm, classificaOsm, convertiAttivita, queryAttivita } from '../src/lib/osmAziende'

const centro = { lat: 45.4642, lon: 9.19 }
const nodo = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: 'node', id, lat, lon, tags })

describe('attività da OpenStreetMap', () => {
  it('classifica studi, artigiani, locali e il resto', () => {
    expect(classificaOsm({ name: 'Studio Rossi', office: 'lawyer' })?.cat).toBe('professioni')
    expect(classificaOsm({ name: 'Assicurazioni Bianchi', office: 'insurance' })?.cat).toBe('finanza')
    expect(classificaOsm({ name: 'Elettricità Verdi', craft: 'electrician' })?.cat).toBe('edilizia')
    expect(classificaOsm({ name: 'Bar Sport', amenity: 'cafe' })?.cat).toBe('ricettivo')
    expect(classificaOsm({ name: 'Autoscuola Roma', amenity: 'driving_school' })).toMatchObject({ cat: 'istruzione', flotta: 'Alta' })
    expect(classificaOsm({ name: 'Rossi Auto', shop: 'car' })?.cat).toBe('auto')
    expect(classificaOsm({ name: 'Boutique', shop: 'clothes' })?.cat).toBe('dettaglio')
    expect(classificaOsm({ name: 'Autotrasporti Neri', office: 'company' })?.cat).toBe('trasporti') // dal nome
    expect(classificaOsm({ name: 'Capannone Rossi', building: 'warehouse' })?.cat).toBe('trasporti')
  })

  it('i gommisti e i negozi vuoti non sono clienti: i gommisti stanno nella Concorrenza', () => {
    expect(classificaOsm({ name: 'Gomme Uno', shop: 'tyres' })).toBeNull()
    expect(classificaOsm({ name: 'Gomme Due', craft: 'tyres' })).toBeNull()
    expect(classificaOsm({ name: 'x', shop: 'vacant' })).toBeNull()
  })

  it('converte, tiene solo quelli con nome dentro il raggio e toglie i doppioni', () => {
    const el = [
      nodo(1, 45.4645, 9.1903, { name: 'Studio Rossi', office: 'lawyer', 'addr:street': 'Via Dante', 'addr:housenumber': '5', 'addr:postcode': '20121', phone: '+39 02 1234' }),
      { type: 'way', id: 2, center: { lat: 45.4645, lon: 9.1903 }, tags: { name: 'Studio Rossi', office: 'lawyer' } }, // stesso posto: doppione
      nodo(3, 45.4642, 9.19, { office: 'lawyer' }), // senza nome
      nodo(4, 45.52, 9.3, { name: 'Troppo lontano', shop: 'clothes' }),
      nodo(5, 45.4650, 9.1910, { name: 'Gomme Uno', shop: 'tyres' }),
      nodo(6, 45.4650, 9.1910, { name: 'Bar Sport', amenity: 'cafe', 'ref:vatin': 'IT01234567890' }),
    ]
    const r = convertiAttivita(el, centro, 1)
    expect(r.map((a) => a.ragioneSociale)).toEqual(['Studio Rossi', 'Bar Sport'])
    expect(r[0]).toMatchObject({ fonte: 'osm', indirizzo: 'Via Dante 5', cap: '20121', contatto: '+39 02 1234', dipendenti: null, categoria: 'Servizi professionali, ICT e media', posizione: 'indirizzo' })
    expect(r[0].distanzaKm).toBeLessThan(0.1)
    expect(r[1].piva).toBe('01234567890')
  })

  it('la query chiede solo elementi con nome, nel raggio, e il limite è 5 km', async () => {
    const q = queryAttivita(45.4642, 9.19, 0.5)
    expect(q).toContain('around:500,45.4642,9.19')
    expect(q).toContain('["shop"]["name"]')
    expect(q).toContain('["office"]["name"]')
    await expect(cercaAttivitaOsm(45, 9, RAGGIO_MAX_OSM_KM + 1)).rejects.toThrow(/raggio massimo/)
  })

  it('prova il server successivo se il primo non risponde', async () => {
    const chiamati: string[] = []
    const http = (async (url: string) => {
      chiamati.push(url)
      if (chiamati.length === 1) return new Response('', { status: 429 })
      return new Response(JSON.stringify({ elements: [nodo(1, 45.4645, 9.1903, { name: 'Studio Rossi', office: 'lawyer' })] }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await cercaAttivitaOsm(45.4642, 9.19, 1, http, ['https://uno', 'https://due'])
    expect(chiamati).toEqual(['https://uno', 'https://due'])
    expect(r.aziende).toHaveLength(1)
    expect(r.ricevuti).toBe(1)
    await expect(cercaAttivitaOsm(45, 9, 1, (async () => new Response('', { status: 504 })) as unknown as typeof fetch, ['https://uno'])).rejects.toThrow(/non risponde.*HTTP 504/)
  })
})
