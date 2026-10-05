// Lettura di file Excel (.xlsx) o CSV caricati dall'utente: lista clienti del
// dealer o estrazione aziende (es. Telemaco). Le colonne si riconoscono dal nome.
import type ExcelJS from 'exceljs'

export type Righe = Record<string, string>[]

function testoCella(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return testoCella(v.result as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    return ''
  }
  return String(v).trim()
}

function parseCsv(text: string): string[][] {
  const prima = text.split(/\r?\n/, 1)[0]
  const sep = [';', '\t', ','].sort((a, b) => prima.split(b).length - prima.split(a).length)[0]
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some((c) => c)) out.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some((c) => c)) out.push(row)
  return out
}

/** Legge il primo foglio con dati; l'intestazione è la prima riga con almeno 2 celle piene. */
export async function leggiTabella(file: File, foglioPreferito?: string): Promise<{ intestazioni: string[]; righe: Righe }> {
  let matrice: string[][]
  if (/\.(csv|txt)$/i.test(file.name)) {
    matrice = parseCsv(await file.text())
  } else if (/\.xlsx$|\.xlsm$/i.test(file.name)) {
    const { default: Excel } = await import('exceljs')
    const wb = new Excel.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws =
      (foglioPreferito && wb.getWorksheet(foglioPreferito)) ||
      wb.worksheets.find((w) => w.actualRowCount > 1) ||
      wb.worksheets[0]
    matrice = []
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals: string[] = []
      for (let c = 1; c <= r.cellCount; c++) vals.push(testoCella(r.getCell(c).value))
      matrice.push(vals)
    })
  } else {
    throw new Error('Formato non supportato: usa .xlsx o .csv (i vecchi .xls vanno salvati come .xlsx)')
  }
  const h = matrice.findIndex((r) => r.filter(Boolean).length >= 2)
  if (h < 0) return { intestazioni: [], righe: [] }
  const intestazioni = matrice[h].map((x, i) => x || `Colonna ${i + 1}`)
  const righe = matrice.slice(h + 1).map((r) => Object.fromEntries(intestazioni.map((k, i) => [k, r[i] ?? ''])))
  return { intestazioni, righe: righe.filter((r) => Object.values(r).some(Boolean)) }
}

const SINONIMI: Record<string, RegExp> = {
  ragioneSociale: /(ragione\s*sociale|denominazione|rag\.?\s*soc|nome\s*(cliente|azienda|ditta)?$|^cliente$|^azienda$|^ditta$|company)/i,
  piva: /(p\.?\s*iva|partita\s*iva|piva|vat|codice\s*fiscale|cod\.?\s*fisc|^cf$)/i,
  indirizzo: /(indirizzo|^via$|address|sede)/i,
  comune: /(comune|citt[aà]|localit[aà]|town|city)/i,
  cap: /^cap$/i,
  provincia: /(^prov|provincia|^pr$)/i,
  ateco: /(ateco|attivit[aà]\s*(prevalente)?\s*cod|codice\s*attivit)/i,
  dipendenti: /(addetti|dipendenti|employees)/i,
  fatturato: /(fatturato|ricavi|turnover)/i,
  pec: /pec/i,
}

export function indovinaColonne(intestazioni: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [campo, re] of Object.entries(SINONIMI)) {
    out[campo] = intestazioni.find((h) => re.test(h.trim()))
  }
  // "codice fiscale" vale come P.IVA solo se manca una colonna partita IVA vera
  const pivaVera = intestazioni.find((h) => /(p\.?\s*iva|partita\s*iva|piva|vat)/i.test(h))
  if (pivaVera) out.piva = pivaVera
  return out
}

export function numero(s: string | undefined): number | null {
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}
