const R = 6371.0088

export function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Anelli di distanza: 250 m fino a 1 km di raggio, 1 km fino a 5, poi 5 km fino a 20 e 10 km oltre. */
export function anelli(raggioKm: number): number[] {
  const step = raggioKm <= 1 ? 0.25 : raggioKm < 5 ? 1 : raggioKm <= 20 ? 5 : 10
  const out: number[] = []
  for (let r = step; r < raggioKm - 1e-9; r += step) out.push(Math.round(r * 1000) / 1000)
  out.push(raggioKm)
  return out
}

const fasciaKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(km)} km`)

export function etichettaAnello(i: number, limiti: number[]): string {
  const da = i === 0 ? 0 : limiti[i - 1]
  const a = limiti[i]
  // "0-500 m", "500 m-1 km", "5-10 km"
  if (a < 1) return `${Math.round(da * 1000)}-${Math.round(a * 1000)} m`
  if (da >= 1) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(da)}-${fasciaKm(a)}`
  return `${da === 0 ? 0 : fasciaKm(da)}-${fasciaKm(a)}`
}
