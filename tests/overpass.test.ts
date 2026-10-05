import { describe, expect, it } from 'vitest'
import { areaCopre, caricaConcorrenzaOsm } from '../src/lib/concorrenza'
import { bbox, interrogaOverpass } from '../src/lib/overpass'

const ok = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200 })

describe('Overpass', () => {
  it('il rettangolo contiene il cerchio', () => {
    const [s, w, n, e] = bbox(45, 9, 10).split(',').map(Number)
    expect(n - s).toBeCloseTo(2 * (10 / 111.32), 3)
    expect(e - w).toBeGreaterThan(n - s) // a 45° di latitudine un grado di longitudine è più corto
    expect(s).toBeLessThan(45 - 0.089)
  })

  it('i gommisti: se l\'area larga fallisce, riprova con quella chiesta', async () => {
    const richieste: string[] = []
    let chiamate = 0
    const http = (async (_url: string, init: { body: URLSearchParams }) => {
      richieste.push(init.body.get('data') ?? '')
      chiamate++
      // la prima richiesta (area larga, 5 km) non riesce, la seconda (quella chiesta) sì
      return chiamate === 1
        ? new Response('', { status: 504 })
        : ok([{ type: 'node', id: 1, lat: 45.4645, lon: 9.1903, tags: { name: 'Gomme Uno', shop: 'tyres' } }])
    }) as unknown as typeof fetch
    const r = await caricaConcorrenzaOsm(45.4642, 9.19, 0.5, true, { http, server: ['https://uno'], pausaMs: 0 })
    expect(chiamate).toBe(2) // 1 giro sull'area larga, poi quella stretta
    expect(r.area?.raggioKm).toBe(0.5)
    expect(r.concorrenti).toHaveLength(1)
    expect(areaCopre(r.area!, 45.4642, 9.19, 0.5)).toBe(true)
    expect(richieste[0]).toContain('craft"="car_repair')
    expect(richieste[0]).not.toContain('around')
  })

  it('messaggio chiaro quando tutti i server sono sovraccarichi', async () => {
    const http = (async () => new Response('', { status: 429 })) as unknown as typeof fetch
    await expect(interrogaOverpass('x', { http, server: ['https://uno', 'https://due'], pausaMs: 0 })).rejects.toThrow(/riprova tra qualche minuto/)
    await expect(interrogaOverpass('x', { http, server: ['https://uno'], pausaMs: 0 })).rejects.toThrow(/sovraccarico \(HTTP 429\)/)
  })
})
