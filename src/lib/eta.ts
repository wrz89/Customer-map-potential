// Età del parco auto ricavata dalle classi Euro (immatricolazione indicativa).
export const GRUPPI_EURO = [
  { nome: 'Euro 0-3', periodo: 'prima del 2006', classi: [0, 1, 2, 3] },
  { nome: 'Euro 4', periodo: '2006-2010', classi: [4] },
  { nome: 'Euro 5', periodo: '2011-2015', classi: [5] },
  { nome: 'Euro 6', periodo: 'dal 2015', classi: [6] },
] as const

/** Quote dei quattro gruppi (0-1) a partire dalle 7 classi Euro. */
export function quoteEuro(euro: number[] | undefined): number[] {
  if (!euro) return [0, 0, 0, 0]
  const tot = euro.reduce((a, b) => a + b, 0)
  if (!tot) return [0, 0, 0, 0]
  return GRUPPI_EURO.map((g) => (g.classi as readonly number[]).reduce<number>((s, i) => s + (euro[i] ?? 0), 0) / tot)
}

/** Quota di auto Euro 0-3: il parco più vecchio, con più manutenzione e gomme economiche. */
export const quotaVecchie = (euro: number[] | undefined) => quoteEuro(euro)[0]
