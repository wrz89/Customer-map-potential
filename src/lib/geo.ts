const R = 6371.0088

export function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Anelli di distanza: 5 km fino a 20 km di raggio, poi 10 km. */
export function anelli(raggioKm: number): number[] {
  const step = raggioKm <= 20 ? 5 : 10
  const out: number[] = []
  for (let r = step; r < raggioKm; r += step) out.push(r)
  out.push(raggioKm)
  return out
}

export function etichettaAnello(i: number, limiti: number[]): string {
  const da = i === 0 ? 0 : limiti[i - 1]
  return `${da}-${limiti[i]} km`
}
