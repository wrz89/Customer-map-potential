import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { arricchisci, type Azienda } from '../src/lib/companies'
import { creaExcel } from '../src/lib/excel'
import { calcolaZona } from '../src/lib/zone'

const centro = { lat: 45.1847, lon: 9.1582 }
const az = (ragioneSociale: string, piva: string): Azienda =>
  arricchisci(
    { id: piva, ragioneSociale, piva, ateco: '49.41', atecoDescr: '', dipendenti: 20, fatturato: null, annoBilancio: null, formaGiuridica: '', indirizzo: '', cap: '', comune: 'PAVIA', provincia: 'PV', pec: '', lat: 45.19, lon: 9.16, fonte: 'import' },
    centro,
  )

const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find(existsSync)

describe('export Excel', () => {
  it('crea i fogli e la cernita con le formule funziona dopo il ricalcolo', async () => {
    const zona = await calcolaZona(centro.lat, centro.lon, 10)
    const aziende = [
      az('TRASPORTI ROSSI S.R.L.', '01234567890'), // P.IVA nella lista clienti
      az('BRAMBILLA COSTRUZIONI SNC', '02222222222'), // nome uguale, P.IVA diversa
      az("SOCIETA' COOPERATIVA L'AURORA", '03333333333'), // nome uguale scritto diverso
      az('LOGISTICA PADANA SPA', '04444444444'), // nuova
    ]
    const blob = await creaExcel({
      dealer: { id: 'x', nome: 'Test', indirizzo: 'Pavia', lat: centro.lat, lon: centro.lon, raggioKm: 10 },
      zona,
      meta: null,
      aziende,
      clienti: [
        { ragioneSociale: 'Rossi trasporti', piva: '1234567890' }, // zero iniziale perso da Excel
        { ragioneSociale: 'Brambilla Costruzioni S.n.c.', piva: '' },
        { ragioneSociale: 'Cooperativa Sociale? no: L Aurora soc. coop.', piva: '' },
        { ragioneSociale: "L'AURORA SOCIETA COOPERATIVA", piva: '' },
      ],
    })
    const dir = mkdtempSync(join(tmpdir(), 'cmp-'))
    const file = join(dir, 'test.xlsx')
    writeFileSync(file, Buffer.from(await blob.arrayBuffer()))

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Leggimi', 'Riepilogo', 'Aziende', 'Clienti dealer', 'Comuni', 'Settori ISTAT', 'Concorrenza'])
    expect(wb.getWorksheet('Comuni')!.actualRowCount).toBeGreaterThan(10)

    if (!soffice) return // senza LibreOffice si verifica solo la struttura
    execFileSync(soffice, ['--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', join(dir, 'out'), file], { stdio: 'ignore', timeout: 120000 })
    const ricalcolato = new ExcelJS.Workbook()
    await ricalcolato.xlsx.load(readFileSync(join(dir, 'out', 'test.xlsx')))
    const ws = ricalcolato.getWorksheet('Aziende')!
    const stato = (r: number) => {
      const v = ws.getCell(`R${r}`).value as { result?: string } | string
      return typeof v === 'object' && v ? v.result : v
    }
    const chiave = (r: number) => {
      const v = ws.getCell(`Q${r}`).value as { result?: string } | string
      return typeof v === 'object' && v ? v.result : v
    }
    expect(chiave(2)).toBe('TRASPORTI ROSSI')
    expect(stato(2)).toBe('Già cliente')
    expect(stato(3)).toBe('Probabile cliente')
    expect(chiave(4)).toBe('LAURORA')
    expect(stato(4)).toBe('Probabile cliente')
    expect(stato(5)).toBe('Nuovo')
    const rp = ricalcolato.getWorksheet('Riepilogo')!
    let nuovi: unknown
    rp.eachRow((row) => {
      if (row.getCell(1).value === 'Nuovo') nuovi = (row.getCell(2).value as { result?: number })?.result ?? row.getCell(2).value
    })
    expect(nuovi).toBe(1)
  }, 180000)
})
