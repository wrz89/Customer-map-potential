import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { autorizzato, gestisci, leggiStima } from '../server/openapi'
import { daOpenapi } from '../src/lib/companies'

// Record di esempio dalla documentazione ufficiale Openapi (IT-search, dataEnrichment=advanced)
const esempio = {
  taxCode: '12485671007',
  companyName: 'OPENAPI S.P.A.',
  vatCode: '12485671007',
  address: { registeredOffice: { streetName: 'VIALE F TOMMASO MARINETTI 221', town: 'ROMA', province: 'RM', zipCode: '00143', gps: { coordinates: [12.47843, 41.8071] as [number, number] } } },
  atecoClassification: { ateco2007: { code: '6201', description: 'Produzione di software non connesso all\'edizione' } },
  detailedLegalForm: { description: "SOCIETA' PER AZIONI" },
  pec: 'openapi@legalmail.it',
  balanceSheets: {
    last: { year: 2022, employees: 14, turnover: 4043407 },
    all: [{ year: 2024, employees: 15 }, { year: 2023, employees: 15 }, { year: 2022, employees: 14 }],
  },
  id: '60d1bfc731177b0a092cdfc1',
}

describe('Openapi', () => {
  it('trasforma un record nel formato dell\'app', () => {
    const a = daOpenapi(esempio, { lat: 41.9, lon: 12.5 })
    expect(a.ragioneSociale).toBe('OPENAPI S.P.A.')
    expect(a.piva).toBe('12485671007')
    expect(a.ateco).toBe('62.01')
    expect(a.categoria).toBe('Servizi professionali, ICT e media')
    expect(a.dipendenti).toBe(15) // ultimo anno con il dato
    expect(a.fatturato).toBe(4043407)
    expect(a.lat).toBeCloseTo(41.8071)
    expect(a.lon).toBeCloseTo(12.47843)
    expect(a.distanzaKm).toBeGreaterThan(5)
  })
  it('legge conteggio e prezzo dalla simulazione in forme diverse', () => {
    expect(leggiStima({ data: { count: 120, price: 6 } })).toEqual({ conteggio: 120, prezzo: 6 })
    expect(leggiStima({ data: { totalRecords: 80, cost: { amount: 4.5 } } })).toEqual({ conteggio: 80, prezzo: 4.5 })
  })
  it('senza token risponde in modalità dimostrativa', async () => {
    const r = await gestisci({ azione: 'stima', lat: 45, lon: 9, raggioKm: 10 }, {})
    expect(r.demo).toBe(true)
  })
  it('la password protegge il credito', () => {
    expect(autorizzato('x', { APP_PASSWORD: 'segreta' })).toBe(false)
    expect(autorizzato('segreta', { APP_PASSWORD: 'segreta' })).toBe(true)
    expect(autorizzato(undefined, {})).toBe(true) // modalità dimostrativa
    expect(autorizzato(undefined, { OPENAPI_TOKEN: 't' })).toBe(false) // token senza password: bloccato
  })
  it('la funzione Vercel esiste e usa il proxy', () => {
    expect(readFileSync('api/companies.ts', 'utf-8')).toContain('gestisci')
  })
})

describe('messaggi di errore Openapi', async () => {
  const { spiegaErrore } = await import('../server/openapi')
  it('401 e 403 spiegano ambiente e ambito da scegliere', () => {
    expect(spiegaErrore(401, '', { OPENAPI_SANDBOX: '1' })).toMatch(/token creato per il sandbox/)
    expect(spiegaErrore(403, '', { OPENAPI_SANDBOX: '1' })).toContain('GET test.company.openapi.com/IT-search')
    expect(spiegaErrore(403, '', { OPENAPI_SANDBOX: '0' })).toContain('GET company.openapi.com/IT-search')
    expect(spiegaErrore(402, '', {})).toMatch(/Credito insufficiente/)
    expect(spiegaErrore(418, 'x', {})).toBe('Openapi 418: x')
  })
})

describe('rete irraggiungibile', async () => {
  const { spiegaRete, provaToken } = await import('../server/openapi')
  it('spiega DNS, certificato e proxy invece di "fetch failed"', () => {
    expect(spiegaRete(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), { OPENAPI_SANDBOX: '1' })).toMatch(/DNS/)
    expect(spiegaRete(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } }), {})).toMatch(/certificato/)
    expect(spiegaRete(new TypeError('fetch failed'), { OPENAPI_SANDBOX: '1' })).toMatch(/proxy o firewall.*test\.company|test\.company.*proxy o firewall/s)
  })
  it('usa il fetch passato, così nell’app per PC valgono proxy e certificati di Windows', async () => {
    let chiamato = ''
    const http = (async (url: string) => {
      chiamato = String(url)
      return new Response(JSON.stringify({ data: { count: 7 } }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await provaToken({ OPENAPI_TOKEN: 't', OPENAPI_SANDBOX: '1', http })
    expect(r.ok).toBe(true)
    expect(chiamato).toContain('test.company.openapi.com/IT-search')
    const ko = await provaToken({ OPENAPI_TOKEN: 't', http: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
    expect(ko.ok).toBe(false)
    expect(ko.messaggio).toMatch(/Non riesco a raggiungere Openapi/)
  })
})
