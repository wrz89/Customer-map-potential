import { describe, expect, it } from 'vitest'
import { importaElenco } from '../src/lib/companies'
import { decodificaCsv } from '../src/lib/leggiFile'
import { calcolaZona } from '../src/lib/zone'

// byte di un CSV in Windows-1252, come lo salva Excel in italiano
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
const file = (nome: string, contenuto: string, utf8 = false) => new File([utf8 ? new TextEncoder().encode(contenuto) : latin1(contenuto)], nome)

describe('import elenchi (Telemaco e simili)', () => {
  it('decodifica sia UTF-8 sia Windows-1252', () => {
    expect(decodificaCsv(latin1('Forlì').buffer as ArrayBuffer)).toBe('Forlì')
    expect(decodificaCsv(new TextEncoder().encode('﻿Forlì').buffer as ArrayBuffer)).toBe('Forlì')
  })

  it('legge un CSV con ; e accenti Windows, anche con comune in maiuscolo con accento', async () => {
    const z = await calcolaZona(44.2227, 12.0407, 3) // Forlì
    const csv = 'Denominazione;Codice Fiscale;Indirizzo;C.A.P.;Comune;Prov.;Cod. ATECO 2007;N. addetti\r\nGOMME FORLÌ SRL;01234567890;Via Roma 1;47121;FORLÌ;FC;45.20.40;5\r\n'
    const r = await importaElenco(file('elenco.csv', csv), z)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ ragioneSociale: 'GOMME FORLÌ SRL', piva: '01234567890', cap: '47121', provincia: 'FC', ateco: '45.20.40', dipendenti: 5, posizione: 'comune' })
    expect(r[0].lat).not.toBeNull()
  })

  it('senza colonna Comune lo ricava dall\'indirizzo', async () => {
    const z = await calcolaZona(45.1847, 9.1582, 3)
    const csv = 'Ragione Sociale,Indirizzo\n"GOMME PAVIA SRL","Via Roma 1, 27100 Pavia (PV)"\n'
    const r = await importaElenco(file('elenco.csv', csv, true), z)
    expect(r[0]).toMatchObject({ comune: 'Pavia', cap: '27100', provincia: 'PV', posizione: 'comune' })
  })

  it('colonne Lat e Lon = posizione esatta, senza nulla da cercare', async () => {
    const z = await calcolaZona(45.1847, 9.1582, 3)
    const csv = 'Ragione Sociale;Comune;Lat;Lon\nGOMME X;PAVIA;45,1850;9,1590\n'
    const r = await importaElenco(file('elenco.csv', csv), z)
    expect(r[0]).toMatchObject({ lat: 45.185, lon: 9.159, posizione: 'indirizzo', cercato: true })
  })

  it('spiega cosa manca', async () => {
    const z = await calcolaZona(45.1847, 9.1582, 3)
    await expect(importaElenco(file('a.csv', 'Codice;Note\n1;x\n'), z)).rejects.toThrow(/ragione sociale/i)
    await expect(importaElenco(file('b.csv', 'Ragione Sociale;P.IVA\nX;01\n'), z)).rejects.toThrow(/Comune oppure Indirizzo/)
  })
})
