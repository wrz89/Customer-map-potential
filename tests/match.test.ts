import { describe, expect, it } from 'vitest'
import { confronta, normalizzaNome, normalizzaPiva, preparaClienti, somiglianza } from '../src/lib/match'

describe('normalizzaNome', () => {
  it('toglie forme giuridiche, punteggiatura e accenti', () => {
    expect(normalizzaNome('Rossi Trasporti S.r.l.')).toBe('ROSSI TRASPORTI')
    expect(normalizzaNome('ROSSI TRASPORTI SRL')).toBe('ROSSI TRASPORTI')
    expect(normalizzaNome("Società Cooperativa Sociale L'Aurora")).toBe('SOCIALE LAURORA')
    expect(normalizzaNome('Bianchi & C. S.n.c.')).toBe('BIANCHI C')
    expect(normalizzaNome('Città Verde S.p.A.')).toBe('CITTA VERDE')
    expect(normalizzaNome('ALFA SOCIETA A RESPONSABILITA LIMITATA')).toBe('ALFA')
  })
  it('non tocca parole che contengono una sigla', () => {
    expect(normalizzaNome('SASSI SPEDIZIONI SAS')).toBe('SASSI SPEDIZIONI')
    expect(normalizzaNome('SPAZIO VERDE')).toBe('SPAZIO VERDE')
  })
})

describe('normalizzaPiva', () => {
  it('gestisce prefisso IT, spazi e zeri iniziali persi da Excel', () => {
    expect(normalizzaPiva('IT 01234567890')).toBe('01234567890')
    expect(normalizzaPiva(1234567890)).toBe('01234567890')
    expect(normalizzaPiva('')).toBe('')
  })
})

describe('somiglianza', () => {
  it('riconosce lo stesso nome scritto in modo diverso', () => {
    expect(somiglianza(normalizzaNome('Autotrasporti Rossi Mario'), normalizzaNome('Rossi Mario Autotrasporti srl'))).toBeGreaterThan(0.88)
    expect(somiglianza(normalizzaNome('F.lli Brambilla Costruzioni'), normalizzaNome('Brambilla Costruzioni'))).toBeGreaterThan(0.88)
  })
  it('una sola parola in comune resta da verificare', () => {
    const v = somiglianza(normalizzaNome('Rossi'), normalizzaNome('Edilizia Rossi Srl'))
    expect(v).toBeLessThan(0.88)
  })
  it('tiene separati nomi diversi', () => {
    expect(somiglianza(normalizzaNome('Rossi Trasporti'), normalizzaNome('Bianchi Logistica'))).toBeLessThan(0.5)
  })
})

describe('confronta', () => {
  const idx = preparaClienti([
    { ragioneSociale: 'TRASPORTI ROSSI SRL', piva: '01234567890' },
    { ragioneSociale: 'Brambilla Costruzioni s.n.c.', piva: '' },
    { ragioneSociale: 'Officina Verdi', indirizzo: 'Via Roma 10', comune: 'Pavia' },
  ])
  it('partita IVA uguale = già cliente', () => {
    expect(confronta({ id: '1', ragioneSociale: 'Altro nome', piva: 'IT01234567890' }, idx).stato).toBe('Già cliente')
  })
  it('nome uguale a meno della forma giuridica = probabile cliente', () => {
    expect(confronta({ id: '2', ragioneSociale: 'BRAMBILLA COSTRUZIONI SRL', piva: '99999999999' }, idx).stato).toBe('Probabile cliente')
  })
  it('stesso indirizzo = da verificare', () => {
    expect(confronta({ id: '3', ragioneSociale: 'Autoservizi Gialli', indirizzo: 'VIA ROMA 10', comune: 'PAVIA' }, idx).stato).toBe('Da verificare')
  })
  it('nessuna corrispondenza = nuovo', () => {
    expect(confronta({ id: '4', ragioneSociale: 'Logistica Padana SpA', piva: '11111111111' }, idx).stato).toBe('Nuovo')
  })
})
