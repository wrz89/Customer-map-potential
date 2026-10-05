// Raggio di analisi: si salva in km (come nel resto del programma), si mostra e si scrive in metri.
import { distKm } from './fmt'

export const RAGGIO_MIN_KM = 0.1
export const RAGGIO_MAX_KM = 100

/** Raggi rapidi proposti accanto al campo (km). */
export const RAGGI_RAPIDI = [0.5, 1, 2, 5, 10, 15, 25, 50]

export const etichettaRaggio = (km: number) => distKm(km)

/**
 * Legge quello che l'utente scrive: "500", "500 m", "1500", "0,5 km", "2km".
 * Senza unità vale metri. Restituisce i km, limitati tra 100 m e 100 km, oppure null se non è un numero.
 */
export function leggiRaggio(testo: string): number | null {
  const m = testo.trim().toLowerCase().replace(/\s+/g, '').match(/^([\d.,]+)(km|m|metri|mt)?$/)
  if (!m) return null
  // "1.500" = millecinquecento, "0,5" = mezzo: il punto è il separatore delle migliaia se seguito da 3 cifre
  const num = /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? Number(m[1].replace(/\./g, '')) : Number(m[1].replace(',', '.'))
  if (!Number.isFinite(num) || num <= 0) return null
  const km = m[2] === 'km' ? num : num / 1000
  return Math.min(RAGGIO_MAX_KM, Math.max(RAGGIO_MIN_KM, Math.round(km * 1000) / 1000))
}
