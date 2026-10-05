// Export Excel del rapporto di zona con cernita automatica dei clienti.
// Il foglio "Aziende" ha una colonna Stato calcolata con formule: il dealer
// incolla i suoi clienti nel foglio "Clienti dealer" e lo Stato si aggiorna
// da solo, senza macro.
import ExcelJS from 'exceljs'
import { CLASSI_ADDETTI, categoriaDaAteco } from './categories'
import { GRUPPI_EURO, quoteEuro } from './eta'
import type { Azienda } from './companies'
import type { Meta } from './data'
import { distKm } from './fmt'
import { etichettaAnello } from './geo'
import {
  CARATTERI_SPAZIO,
  CARATTERI_TOLTI,
  FORME_TOKEN,
  FRASI_GIURIDICHE,
  type Cliente,
  type EsitoMatch,
} from './match'
import type { Dealer } from './store'
import type { Zona } from './zone'

const BLU = 'FF0F2A4A'
const BLU_CHIARO = 'FFE8EEF6'
const GRIGIO = 'FF52514E'
const RIGHE_CLIENTI = 10000

const ACCENTI: [string, string][] = [['À', 'A'], ['È', 'E'], ['É', 'E'], ['Ì', 'I'], ['Ò', 'O'], ['Ù', 'U']]

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Formula Excel equivalente a normalizzaNome() di match.ts, applicata alla cella indicata. */
export function formulaChiave(cella: string): string {
  let x = `UPPER(${cella})`
  for (const ch of CARATTERI_TOLTI) x = `SUBSTITUTE(${x},${q(ch)},"")`
  for (const ch of CARATTERI_SPAZIO) x = `SUBSTITUTE(${x},${q(ch)}," ")`
  for (const [a, b] of ACCENTI) x = `SUBSTITUTE(${x},${q(a)},${q(b)})`
  x = `" "&${x}&" "`
  // TRIM intermedio: compatta gli spazi doppi prima di cercare le frasi
  x = `" "&TRIM(${x})&" "`
  for (const f of FRASI_GIURIDICHE) x = `SUBSTITUTE(${x},${q(` ${f} `)}," ")`
  for (const t of FORME_TOKEN) x = `SUBSTITUTE(${x},${q(` ${t} `)}," ")`
  return `IF(${cella}="","",TRIM(${x}))`
}

/** Formula Excel equivalente a normalizzaPiva(). */
export function formulaPiva(cella: string): string {
  const pulita = `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(UPPER(TRIM(${cella}&"")),"IT","")," ",""),".",""),"-","")`
  return `IF(${cella}="","",IF(LEN(${pulita})<11,RIGHT("00000000000"&${pulita},11),${pulita}))`
}

function intestazione(ws: ExcelJS.Worksheet, riga: number, valori: string[]) {
  const r = ws.getRow(riga)
  valori.forEach((v, i) => {
    const c = r.getCell(i + 1)
    c.value = v
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLU } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  r.height = 30
}

function titolo(ws: ExcelJS.Worksheet, testo: string, sotto?: string) {
  ws.getCell('A1').value = testo
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BLU } }
  if (sotto) {
    ws.getCell('A2').value = sotto
    ws.getCell('A2').font = { italic: true, color: { argb: GRIGIO } }
  }
}

const intero = '#,##0'

export interface DatiExport {
  dealer: Dealer
  zona: Zona
  meta: Meta | null
  aziende: Azienda[]
  clienti?: Cliente[]
  esiti?: Map<string, EsitoMatch>
}

export async function creaExcel(d: DatiExport): Promise<Blob> {
  const { dealer, zona, aziende } = d
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Customer Map Potential'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }
  const oggi = new Date().toLocaleDateString('it-IT')

  /* ---------- Leggimi ---------- */
  // i fogli si creano subito nell'ordine in cui si vedranno
  const lg = wb.addWorksheet('Leggimi', { properties: { tabColor: { argb: BLU } } })
  const rp = wb.addWorksheet('Riepilogo', { properties: { tabColor: { argb: 'FF1BAF7A' } } })
  const az = wb.addWorksheet('Aziende', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
  const cl = wb.addWorksheet('Clienti dealer', { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: 'FFEDA100' } } })
  const co = wb.addWorksheet('Comuni', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
  const se = wb.addWorksheet('Settori ISTAT', { views: [{ state: 'frozen', ySplit: 1 }] })
  const cc = wb.addWorksheet('Concorrenza', { views: [{ state: 'frozen', ySplit: 1 }] })
  titolo(lg, `Potenziale clienti · ${dealer.nome}`, `Raggio ${distKm(zona.raggioKm)} da ${dealer.indirizzo} · generato il ${oggi}`)
  const istruzioni = [
    ['Come fare la cernita dei clienti'],
    ['1. Apri il foglio "Clienti dealer".'],
    ['2. Incolla l\'elenco clienti dal gestionale a partire dalla riga 2: Ragione sociale in colonna A, Partita IVA in colonna B. Indirizzo e comune sono facoltativi.'],
    ['3. Torna al foglio "Aziende": la colonna Stato si aggiorna da sola.'],
    ['4. Filtra la colonna Stato su "Nuovo": è l\'elenco delle aziende da lavorare.'],
    [''],
    ['Cosa significa lo Stato'],
    ['Già cliente: la partita IVA è presente nella lista clienti.'],
    ['Probabile cliente: stesso nome, a parte la forma giuridica (SRL, SPA, SNC...), punteggiatura e spazi. Da controllare a occhio.'],
    ['Nuovo: nessuna corrispondenza. È un potenziale cliente.'],
    ['Colonna "Confronto app": se la lista clienti è stata caricata anche nell\'app, riporta il confronto per somiglianza, che trova anche nomi scritti in modo diverso.'],
    [''],
    ['Da sapere sui dati'],
    ['Aziende: indirizzo e coordinate sono quelli della sede legale. Un\'azienda con sede altrove e stabilimento in zona può non comparire.'],
    ['Dipendenti: dato dell\'ultimo bilancio disponibile; le ditte individuali spesso non lo hanno.'],
    ['Comuni e settori: dati ISTAT ripartiti in proporzione alla superficie del comune che cade nel raggio.'],
    ...(zona.raggioKm < 3 ? [['ATTENZIONE: con raggi sotto i 3 km abitanti, auto e addetti sono stime. Il dato ISTAT è per comune e qui si suppone distribuito in modo uniforme: nei centri urbani il valore reale è più alto. Aziende e concorrenti sono invece punti reali.']] : []),
    ['Intensità flotta: stima qualitativa per settore (Alta, Media, Bassa), non un dato.'],
    [''],
    ['Fonti'],
    ...Object.values(d.meta?.fonti ?? {}).filter(Boolean).map((f) => [String(f)]),
    ...(aziende.some((a) => a.fonte === 'demo') ? [['ATTENZIONE: le aziende di questo file sono DIMOSTRATIVE, generate a partire dai conteggi ISTAT. Non sono aziende reali.']] : []),
  ]
  istruzioni.forEach((r, i) => {
    const c = lg.getCell(`A${i + 4}`)
    c.value = r[0]
    if (['Come fare la cernita dei clienti', 'Cosa significa lo Stato', 'Da sapere sui dati', 'Fonti'].includes(r[0])) {
      c.font = { bold: true, color: { argb: BLU }, size: 12 }
    }
    if (r[0].startsWith('ATTENZIONE')) c.font = { bold: true, color: { argb: 'FFD03B3B' } }
  })
  lg.getColumn(1).width = 140

  /* ---------- Aziende ---------- */
  const colAz = [
    ['Ragione sociale', 42], ['Partita IVA', 14], ['Categoria', 30], ['Intensità flotta', 11], ['ATECO', 10],
    ['Attività', 36], ['Dipendenti', 11], ['Fatturato €', 14], ['Anno bilancio', 9], ['Indirizzo sede legale', 34],
    ['CAP', 7], ['Comune', 20], ['Prov.', 6], ['Distanza km', 10], ['PEC', 30], ['Fonte', 9],
    ['Chiave nome', 30], ['Stato', 17], ['Confronto app', 17], ['Cliente abbinato (app)', 34],
  ] as const
  intestazione(az, 1, colAz.map((c) => c[0]))
  colAz.forEach(([, w], i) => (az.getColumn(i + 1).width = w))
  const CL = "'Clienti dealer'"
  aziende.forEach((a, i) => {
    const r = i + 2
    const e = d.esiti?.get(a.id)
    const row = az.getRow(r)
    row.values = [
      a.ragioneSociale, a.piva, a.categoria, a.flotta, a.ateco, a.atecoDescr, a.dipendenti ?? undefined,
      a.fatturato ?? undefined, a.annoBilancio ?? undefined, a.indirizzo, a.cap, a.comune, a.provincia,
      a.distanzaKm ?? undefined, a.pec, a.fonte === 'demo' ? 'DEMO' : a.fonte === 'openapi' ? 'Openapi' : 'Import',
    ]
    row.getCell(2).numFmt = '@'
    const ultimaAz = aziende.length + 1
    if (r === 2) {
      row.getCell(17).value = { formula: formulaChiave('A2'), shareType: 'shared', ref: `Q2:Q${ultimaAz}` } as ExcelJS.CellFormulaValue
      row.getCell(18).value = {
        formula:
          `IF(AND(B2<>"",COUNTIF(${CL}!$F$2:$F$${RIGHE_CLIENTI + 1},B2)>0),"Già cliente",` +
          `IF(AND(Q2<>"",COUNTIF(${CL}!$E$2:$E$${RIGHE_CLIENTI + 1},Q2)>0),"Probabile cliente","Nuovo"))`,
        shareType: 'shared',
        ref: `R2:R${ultimaAz}`,
      } as ExcelJS.CellFormulaValue
    } else {
      row.getCell(17).value = { sharedFormula: 'Q2' } as ExcelJS.CellSharedFormulaValue
      row.getCell(18).value = { sharedFormula: 'R2' } as ExcelJS.CellSharedFormulaValue
    }
    if (e) {
      row.getCell(19).value = e.stato
      row.getCell(20).value = e.cliente ? `${e.cliente.ragioneSociale}${e.motivo ? ` · ${e.motivo}` : ''}` : ''
    }
  })
  az.getColumn(7).numFmt = intero
  az.getColumn(8).numFmt = intero
  az.getColumn(14).numFmt = '0.0'
  az.getColumn(17).font = { color: { argb: 'FF898781' } }
  const nAz = Math.max(aziende.length + 1, 2)
  az.autoFilter = { from: 'A1', to: { row: nAz, column: colAz.length } }
  const statoCF = (col: string) =>
    az.addConditionalFormatting({
      ref: `${col}2:${col}${nAz}`,
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'Già cliente', priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE1E0D9' } }, font: { color: { argb: 'FF52514E' } } } },
        { type: 'containsText', operator: 'containsText', text: 'Probabile', priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDEBC4' } }, font: { color: { argb: 'FF7A4D00' } } } },
        { type: 'containsText', operator: 'containsText', text: 'Da verificare', priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE1D6' } }, font: { color: { argb: 'FF8A3410' } } } },
        { type: 'containsText', operator: 'containsText', text: 'Nuovo', priority: 4, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD8F2E3' } }, font: { bold: true, color: { argb: 'FF006300' } } } },
      ],
    })
  statoCF('R')
  statoCF('S')

  /* ---------- Clienti dealer ---------- */
  intestazione(cl, 1, ['Ragione sociale', 'Partita IVA', 'Indirizzo', 'Comune', 'Chiave nome (automatica)', 'P.IVA normalizzata (automatica)'])
  ;[42, 16, 34, 20, 30, 18].forEach((w, i) => (cl.getColumn(i + 1).width = w))
  cl.getColumn(2).numFmt = '@'
  // Formule condivise: il testo della formula è salvato una volta sola (file leggero)
  const ultima = RIGHE_CLIENTI + 1
  for (let r = 2; r <= ultima; r++) {
    const c = d.clienti?.[r - 2]
    const row = cl.getRow(r)
    if (c) {
      row.getCell(1).value = c.ragioneSociale
      row.getCell(2).value = c.piva ?? ''
      row.getCell(3).value = c.indirizzo ?? ''
      row.getCell(4).value = c.comune ?? ''
    }
    if (r === 2) {
      row.getCell(5).value = { formula: formulaChiave('A2'), shareType: 'shared', ref: `E2:E${ultima}` } as ExcelJS.CellFormulaValue
      row.getCell(6).value = { formula: formulaPiva('B2'), shareType: 'shared', ref: `F2:F${ultima}` } as ExcelJS.CellFormulaValue
    } else {
      row.getCell(5).value = { sharedFormula: 'E2' } as ExcelJS.CellSharedFormulaValue
      row.getCell(6).value = { sharedFormula: 'F2' } as ExcelJS.CellSharedFormulaValue
    }
  }
  cl.getColumn(5).font = { color: { argb: 'FF898781' } }
  cl.getColumn(6).font = { color: { argb: 'FF898781' } }

  /* ---------- Riepilogo ---------- */
  titolo(rp, `Riepilogo zona · ${dealer.nome}`, `${dealer.indirizzo} · raggio ${distKm(zona.raggioKm)} · ${zona.comuni.length} comuni`)
  rp.getColumn(1).width = 30
  for (let c = 2; c <= 11; c++) rp.getColumn(c).width = 15
  let r = 4
  intestazione(rp, r, ['Fascia', 'Comuni', 'Abitanti', 'Autovetture', 'Veicoli merci', 'Pesanti e rimorchi', 'Motocicli', 'Unità locali', 'Addetti', 'UL 50+ addetti', 'Officine e gommisti'])
  zona.anelli.forEach((t, i) => {
    r++
    rp.getRow(r).values = [
      etichettaAnello(i, zona.limitiAnelli),
      zona.comuni.filter((z) => z.quoteAnelli[i] > 0.005).length,
      Math.round(t.pop), Math.round(t.autovetture), Math.round(t.autocarri), Math.round(t.pesanti), Math.round(t.motocicli),
      Math.round(t.unitaLocali), Math.round(t.addetti), Math.round(t.ulClassi[2] + t.ulClassi[3]), Math.round(t.officine),
    ]
  })
  r++
  const tot = zona.totale
  rp.getRow(r).values = ['Totale', zona.comuni.length, Math.round(tot.pop), Math.round(tot.autovetture), Math.round(tot.autocarri), Math.round(tot.pesanti), Math.round(tot.motocicli), Math.round(tot.unitaLocali), Math.round(tot.addetti), Math.round(tot.ulClassi[2] + tot.ulClassi[3]), Math.round(tot.officine)]
  rp.getRow(r).font = { bold: true }
  rp.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLU_CHIARO } }
  for (let c = 2; c <= 11; c++) rp.getColumn(c).numFmt = intero

  r += 2
  rp.getCell(`A${r}`).value = 'Età del parco auto (quota delle autovetture)'
  rp.getCell(`A${r}`).font = { bold: true, color: { argb: BLU }, size: 12 }
  r++
  intestazione(rp, r, ['Fascia', ...GRUPPI_EURO.map((g) => `${g.nome} (${g.periodo})`)])
  ;[...zona.anelli.map((a, i) => [etichettaAnello(i, zona.limitiAnelli), a.euro] as const), ['Totale', zona.totale.euro] as const].forEach(([nome, euro]) => {
    r++
    rp.getRow(r).values = [nome, ...quoteEuro(euro)]
    for (let c = 2; c <= 5; c++) rp.getCell(r, c).numFmt = '0%'
  })

  r += 2
  rp.getCell(`A${r}`).value = 'Cernita aziende (si aggiorna con il foglio Clienti dealer)'
  rp.getCell(`A${r}`).font = { bold: true, color: { argb: BLU }, size: 12 }
  r++
  intestazione(rp, r, ['Stato', 'Aziende', 'Dipendenti'])
  for (const s of ['Nuovo', 'Probabile cliente', 'Già cliente']) {
    r++
    rp.getCell(`A${r}`).value = s
    rp.getCell(`B${r}`).value = { formula: `COUNTIF(Aziende!$R$2:$R$${nAz},A${r})` }
    rp.getCell(`C${r}`).value = { formula: `SUMIF(Aziende!$R$2:$R$${nAz},A${r},Aziende!$G$2:$G$${nAz})` }
  }
  r += 2
  rp.getCell(`A${r}`).value = 'Aziende nuove per categoria'
  rp.getCell(`A${r}`).font = { bold: true, color: { argb: BLU }, size: 12 }
  r++
  intestazione(rp, r, ['Categoria', 'Intensità flotta', 'Aziende nuove', 'Dipendenti', 'Aziende totali'])
  const ordineFlotta = (c: string) => ({ Alta: 0, Media: 1, Bassa: 2 })[aziende.find((a) => a.categoria === c)?.flotta || 'Bassa'] ?? 3
  const cats = [...new Set(aziende.map((a) => a.categoria))].sort((a, b) => ordineFlotta(a) - ordineFlotta(b) || a.localeCompare(b, 'it'))
  for (const c of cats) {
    r++
    rp.getCell(`A${r}`).value = c
    rp.getCell(`B${r}`).value = aziende.find((a) => a.categoria === c)?.flotta ?? ''
    rp.getCell(`C${r}`).value = { formula: `COUNTIFS(Aziende!$C$2:$C$${nAz},A${r},Aziende!$R$2:$R$${nAz},"Nuovo")` }
    rp.getCell(`D${r}`).value = { formula: `SUMIFS(Aziende!$G$2:$G$${nAz},Aziende!$C$2:$C$${nAz},A${r},Aziende!$R$2:$R$${nAz},"Nuovo")` }
    rp.getCell(`E${r}`).value = { formula: `COUNTIF(Aziende!$C$2:$C$${nAz},A${r})` }
  }

  /* ---------- Comuni ---------- */
  const colCo = ['Comune', 'Prov.', 'Distanza km', '% superficie nel raggio', 'Abitanti (quota)', 'Autovetture (quota)', 'Veicoli merci (quota)', 'Pesanti e rimorchi (quota)', 'Motocicli (quota)', 'Autobus (quota)', 'Unità locali (quota)', 'Addetti (quota)', 'UL 10-49', 'UL 50-249', 'UL 250+', 'Officine e gommisti', 'Abitanti comune intero', 'Autovetture comune intero', ...GRUPPI_EURO.map((g) => `Auto ${g.nome} (${g.periodo})`)]
  intestazione(co, 1, colCo)
  co.getColumn(1).width = 26
  for (let c = 2; c <= colCo.length; c++) co.getColumn(c).width = 13
  zona.comuni.forEach((z, i) => {
    const t = z.totali
    co.getRow(i + 2).values = [
      z.comune.n, z.comune.p, Math.round(z.distanzaKm * 100) / 100, z.quota, Math.round(t.pop), Math.round(t.autovetture),
      Math.round(t.autocarri), Math.round(t.pesanti), Math.round(t.motocicli), Math.round(t.autobus), Math.round(t.unitaLocali), Math.round(t.addetti),
      Math.round(t.ulClassi[1]), Math.round(t.ulClassi[2]), Math.round(t.ulClassi[3]), Math.round(t.officine),
      z.comune.pop ?? undefined, z.comune.veh?.autovetture ?? undefined,
      ...quoteEuro(z.comune.veh?.euro),
    ]
  })
  co.getColumn(4).numFmt = '0%'
  co.getColumn(3).numFmt = '0.0'
  for (let c = 5; c <= colCo.length; c++) co.getColumn(c).numFmt = intero
  for (let c = colCo.length - 3; c <= colCo.length; c++) co.getColumn(c).numFmt = '0%'
  co.getColumn(3).numFmt = '0.0'
  co.autoFilter = { from: 'A1', to: { row: zona.comuni.length + 1, column: colCo.length } }

  /* ---------- Settori ISTAT ---------- */
  const colSe = ['Categoria', 'Intensità flotta', 'ATECO', 'Settore', 'Unità locali', 'Addetti', ...CLASSI_ADDETTI.map((c) => `UL ${c.nome} addetti`)]
  intestazione(se, 1, colSe)
  ;[30, 11, 8, 50, 12, 12, 12, 12, 12, 12].forEach((w, i) => (se.getColumn(i + 1).width = w))
  zona.settori.forEach((s, i) => {
    const cat = categoriaDaAteco(s.divisione)
    se.getRow(i + 2).values = [
      cat?.nome ?? 'Altro', cat?.flotta ?? '', s.divisione, d.meta?.ateco[s.divisione] ?? '', Math.round(s.unitaLocali),
      Math.round(s.addetti), ...s.ulClassi.map((v) => Math.round(v)),
    ]
  })
  for (let c = 5; c <= colSe.length; c++) se.getColumn(c).numFmt = intero
  se.autoFilter = { from: 'A1', to: { row: zona.settori.length + 1, column: colSe.length } }

  /* ---------- Concorrenza ---------- */
  intestazione(cc, 1, ['Nome', 'Tipo', 'Rete', 'Gruppo', 'Distanza km', 'Indirizzo', 'Partita IVA', 'Fonte', 'Latitudine', 'Longitudine'])
  ;[40, 12, 22, 14, 11, 36, 14, 16, 12, 12].forEach((w, i) => (cc.getColumn(i + 1).width = w))
  zona.concorrenti.forEach((c, i) => {
    cc.getRow(i + 2).values = [c.nome || '(senza nome)', c.gommista ? 'Gommista' : 'Officina', c.rete || 'Indipendente', c.gruppo, c.distanzaKm, c.indirizzo ?? '', c.piva ?? '', c.fonte === 'registro' ? 'Registro Imprese' : 'OpenStreetMap', c.lat, c.lon]
    cc.getRow(i + 2).getCell(7).numFmt = '@'
  })
  cc.getColumn(5).numFmt = '0.0'
  if (zona.concorrenti.length) cc.autoFilter = { from: 'A1', to: { row: zona.concorrenti.length + 1, column: 10 } }
  cc.getCell(`A${zona.concorrenti.length + 3}`).value =
    zona.infoConcorrenza?.registro
      ? 'Fonti: Registro Imprese (ATECO 45.20.40) e © OpenStreetMap contributors (ODbL).'
      : 'Fonte: © OpenStreetMap contributors (ODbL). Copertura parziale: il numero ISTAT delle officine resta il riferimento.'
  cc.getCell(`A${zona.concorrenti.length + 3}`).font = { italic: true, color: { argb: GRIGIO } }

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' }]

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function nomeFile(dealer: Dealer, raggioKm: number) {
  const slug = dealer.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `Potenziale_${slug}_${raggioKm < 1 ? `${Math.round(raggioKm * 1000)}m` : `${String(raggioKm).replace('.', ',')}km`}_${new Date().toISOString().slice(0, 10)}.xlsx`
}
