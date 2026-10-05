const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

export const n0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : nf.format(Math.round(v)))
export const n1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : nf1.format(v))
export const pct = (v: number) => `${nf.format(Math.round(v * 100))}%`
export const eur = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v)

/** Distanza leggibile: "350 m" sotto il chilometro, "2,4 km" sopra. */
export function distKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '–'
  return km < 1 ? `${nf.format(Math.round(km * 1000))} m` : `${nf1.format(km)} km`
}

/** Formato compatto: 12,3 mila · 1,2 mln */
export function compatto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–'
  const a = Math.abs(v)
  if (a >= 1e6) return `${nf1.format(v / 1e6)} mln`
  if (a >= 1e4) return `${nf1.format(v / 1e3)} mila`
  return nf.format(Math.round(v))
}
