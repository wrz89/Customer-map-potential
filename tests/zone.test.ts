import { describe, expect, it } from 'vitest'
import { anelli, etichettaAnello } from '../src/lib/geo'
import { leggiRaggio } from '../src/lib/raggio'
import { calcolaZona } from '../src/lib/zone'

describe('anelli', () => {
  it('passi da 5 km fino a 20, poi da 10', () => {
    expect(anelli(15)).toEqual([5, 10, 15])
    expect(anelli(30)).toEqual([10, 20, 30])
    expect(anelli(25)).toEqual([10, 20, 25])
  })
})

describe('anelli e fasce per raggi piccoli', () => {
  it('fasce da 250 m sotto il chilometro, da 1 km fino a 5', () => {
    expect(anelli(0.5)).toEqual([0.25, 0.5])
    expect(anelli(0.1)).toEqual([0.1])
    expect(anelli(1)).toEqual([0.25, 0.5, 0.75, 1])
    expect(anelli(3.5)).toEqual([1, 2, 3, 3.5])
    expect(anelli(5)).toEqual([5])
    expect(anelli(10)).toEqual([5, 10])
  })
  it('etichette in metri e chilometri', () => {
    expect(etichettaAnello(0, [0.25, 0.5])).toBe('0-250 m')
    expect(etichettaAnello(1, [0.25, 0.5])).toBe('250-500 m')
    expect(etichettaAnello(1, [0.5, 1])).toBe('500 m-1 km')
    expect(etichettaAnello(1, [1, 2, 3])).toBe('1-2 km')
    expect(etichettaAnello(2, [5, 10, 15])).toBe('10-15 km')
  })
})

describe('leggiRaggio', () => {
  it('capisce metri, km e formati italiani', () => {
    expect(leggiRaggio('500')).toBe(0.5)
    expect(leggiRaggio('500 m')).toBe(0.5)
    expect(leggiRaggio('1500')).toBe(1.5)
    expect(leggiRaggio('1.500')).toBe(1.5)
    expect(leggiRaggio('2 km')).toBe(2)
    expect(leggiRaggio('0,5 km')).toBe(0.5)
    expect(leggiRaggio('15km')).toBe(15)
  })
  it('limita tra 100 m e 100 km e rifiuta il resto', () => {
    expect(leggiRaggio('20')).toBe(0.1)
    expect(leggiRaggio('500000')).toBe(100)
    expect(leggiRaggio('')).toBeNull()
    expect(leggiRaggio('abc')).toBeNull()
    expect(leggiRaggio('0')).toBeNull()
  })
})

describe('calcolaZona a 500 m', () => {
  it('non perde il comune del dealer e le quote sono piccole ma coerenti', async () => {
    const z = await calcolaZona(45.1847, 9.1582, 0.5)
    const pavia = z.comuni.find((c) => c.comune.c === '018110')
    expect(pavia).toBeDefined()
    expect(pavia!.quota).toBeGreaterThan(0)
    expect(pavia!.quota).toBeLessThan(0.1)
    expect(z.limitiAnelli).toEqual([0.25, 0.5])
    expect(z.geometrie.length).toBeGreaterThan(0)
    const somma = z.anelli.reduce((s, a) => s + a.autovetture, 0)
    expect(Math.abs(somma - z.totale.autovetture)).toBeLessThan(1)
    expect(z.totale.pop).toBeLessThan(10_000)
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

describe('guida Telemaco: codici e stima per zona', async () => {
  const { PACCHETTI_ATECO, codiciPacchetti, stimaPacchetto, costoTelemaco } = await import('../src/lib/atecoTelemaco')
  it('i codici non si ripetono e il gommista 45.20.40 non è tra i clienti', () => {
    const tutti = codiciPacchetti(PACCHETTI_ATECO.map((p) => p.id))
    expect(new Set(tutti).size).toBe(tutti.length)
    expect(tutti).toContain('43')
    expect(tutti).toContain('45')
    expect(tutti).not.toContain('45.20.40')
  })
  it('stima le imprese dai dati ISTAT con la taglia minima scelta', async () => {
    const z = await calcolaZona(45.1847, 9.1582, 5)
    const per = (id: string, soglia?: 0 | 1 | 2) => stimaPacchetto(z, PACCHETTI_ATECO.find((p) => p.id === id)!, soglia)
    expect(per('flotta-mestiere').imprese).toBeGreaterThan(per('lavora-con-auto').imprese)
    expect(per('flotta-mestiere').parziale).toBe(true) // 77.1, 85.53, 56.2 non contano nella stima
    expect(per('lavora-con-auto').parziale).toBe(false)
    // i professionisti sono piccoli: con taglia 0 sono molti di più che con 10+
    expect(per('professionisti', 0).imprese).toBeGreaterThan(per('professionisti', 1).imprese * 2)
    expect(per('professionisti', 1).imprese).toBeGreaterThanOrEqual(per('professionisti', 2).imprese)
    // lo stesso pacchetto con soglia diversa da quella consigliata
    expect(per('commercio', 0).imprese).toBeGreaterThan(per('commercio').imprese)
  })
  it('avvocati e commercialisti (69) sono nel pacchetto dei professionisti senza taglia minima', () => {
    const p = PACCHETTI_ATECO.find((x) => x.id === 'professionisti')!
    expect(p.soglia).toBe(0)
    expect(p.voci.map((v) => v.codice)).toContain('69')
    expect(p.nota).toMatch(/albi/)
  })
  it('costo: 5 € a elenco più per impresa, zero se non ce ne sono', () => {
    expect(costoTelemaco(100, 'indirizzi')).toBeCloseTo(7)
    expect(costoTelemaco(100, 'esteso')).toBeCloseTo(17)
    expect(costoTelemaco(0, 'esteso')).toBe(0)
  })
})
