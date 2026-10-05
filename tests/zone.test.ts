import { describe, expect, it } from 'vitest'
import { anelli } from '../src/lib/geo'
import { calcolaZona } from '../src/lib/zone'

describe('anelli', () => {
  it('passi da 5 km fino a 20, poi da 10', () => {
    expect(anelli(15)).toEqual([5, 10, 15])
    expect(anelli(30)).toEqual([10, 20, 30])
    expect(anelli(25)).toEqual([10, 20, 25])
  })
})

describe('calcolaZona su Pavia', () => {
  it('ripartisce i valori per superficie e somma gli anelli al totale', async () => {
    const z = await calcolaZona(45.1847, 9.1582, 15)
    const pavia = z.comuni.find((c) => c.comune.c === '018110')!
    expect(pavia).toBeDefined()
    expect(pavia.quota).toBeGreaterThan(0.99)
    // il totale è la somma degli anelli
    const somma = z.anelli.reduce((s, a) => s + a.autovetture, 0)
    expect(Math.abs(somma - z.totale.autovetture)).toBeLessThan(1)
    // le quote per anello di un comune non superano 1
    for (const c of z.comuni) expect(c.quoteAnelli.reduce((s, q) => s + q, 0)).toBeLessThanOrEqual(1.0001)
    // ordini di grandezza plausibili: Pavia da sola ha ~72 mila abitanti e ~42 mila auto
    expect(z.totale.pop).toBeGreaterThan(150_000)
    expect(z.totale.pop).toBeLessThan(300_000)
    expect(z.totale.autovetture).toBeGreaterThan(pavia.comune.veh!.autovetture)
    // le categorie sommano gli addetti delle divisioni classificate
    const addCat = z.categorie.reduce((s, c) => s + c.addetti, 0)
    const addDiv = z.settori.filter((s) => s.categoriaId).reduce((s, d) => s + d.addetti, 0)
    expect(Math.abs(addCat - addDiv)).toBeLessThan(1)
  })
})
