// Calcolo della zona attorno a un punto: quali comuni cadono nel raggio, per
// quale quota della loro superficie, e i totali per anello di distanza.
import { area, circle, featureCollection, intersect } from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import { CATEGORIE, categoriaDaAteco, type Flotta } from './categories'
import {
  loadComuni,
  loadGeoProvincia,
  loadUnitaLocaliProvincia,
  type Comune,
  type UnitaLocaliComune,
} from './data'
import { anelli, distanzaKm } from './geo'

export interface Totali {
  pop: number
  autovetture: number
  autocarri: number
  pesanti: number
  motocicli: number
  autobus: number
  altriVeicoli: number
  unitaLocali: number
  addetti: number
  /** unità locali per classe di addetti: 0-9, 10-49, 50-249, 250+ */
  ulClassi: [number, number, number, number]
  addClassi: [number, number, number, number]
  officine: number
}

export interface ComuneZona {
  comune: Comune
  distanzaKm: number
  quota: number // quota della superficie comunale dentro il raggio (0-1)
  quoteAnelli: number[]
  totali: Totali // già moltiplicati per la quota
  ul: UnitaLocaliComune | undefined
}

export interface SettoreZona {
  divisione: string
  categoriaId: string | undefined
  unitaLocali: number
  addetti: number
  ulClassi: [number, number, number, number]
  addClassi: [number, number, number, number]
}

export interface CategoriaZona {
  id: string
  nome: string
  flotta: Flotta
  nota: string
  unitaLocali: number
  addetti: number
  ulClassi: [number, number, number, number]
  addClassi: [number, number, number, number]
}

export interface Zona {
  centro: { lat: number; lon: number }
  raggioKm: number
  limitiAnelli: number[]
  comuni: ComuneZona[]
  anelli: Totali[]
  totale: Totali
  settori: SettoreZona[]
  categorie: CategoriaZona[]
  geometrie: Feature<Polygon | MultiPolygon, { c: string; quota: number }>[]
  annoVeicoli: number | null
}

export const vuoto = (): Totali => ({
  pop: 0, autovetture: 0, autocarri: 0, pesanti: 0, motocicli: 0, autobus: 0, altriVeicoli: 0,
  unitaLocali: 0, addetti: 0, ulClassi: [0, 0, 0, 0], addClassi: [0, 0, 0, 0], officine: 0,
})

function totaliComune(c: Comune, ul: UnitaLocaliComune | undefined, k: number): Totali {
  const t = vuoto()
  t.pop = (c.pop ?? 0) * k
  if (c.veh) {
    t.autovetture = c.veh.autovetture * k
    t.autocarri = c.veh.autocarri * k
    t.pesanti = (c.veh.pesanti ?? 0) * k
    t.motocicli = c.veh.motocicli * k
    t.autobus = c.veh.autobus * k
    t.altriVeicoli = c.veh.altri * k
  }
  t.officine = (c.off ?? 0) * k
  const tot = ul?.['0010']
  if (tot) {
    t.unitaLocali = tot[0] * k
    t.addetti = tot[1] * k
    for (let i = 0; i < 4; i++) {
      t.ulClassi[i] = tot[2 + i * 2] * k
      t.addClassi[i] = tot[3 + i * 2] * k
    }
  }
  return t
}

export function somma(a: Totali, b: Totali): Totali {
  return {
    pop: a.pop + b.pop,
    autovetture: a.autovetture + b.autovetture,
    autocarri: a.autocarri + b.autocarri,
    pesanti: a.pesanti + b.pesanti,
    motocicli: a.motocicli + b.motocicli,
    autobus: a.autobus + b.autobus,
    altriVeicoli: a.altriVeicoli + b.altriVeicoli,
    unitaLocali: a.unitaLocali + b.unitaLocali,
    addetti: a.addetti + b.addetti,
    ulClassi: a.ulClassi.map((v, i) => v + b.ulClassi[i]) as Totali['ulClassi'],
    addClassi: a.addClassi.map((v, i) => v + b.addClassi[i]) as Totali['addClassi'],
    officine: a.officine + b.officine,
  }
}

export async function calcolaZona(lat: number, lon: number, raggioKm: number): Promise<Zona> {
  const tutti = await loadComuni()
  const limiti = anelli(raggioKm)
  // Pre-filtro largo sui centroidi: anche un comune grande con il centroide fuori
  // può avere parte del territorio dentro il raggio.
  const candidati = tutti.filter((c) => distanzaKm(lat, lon, c.lat, c.lon) <= raggioKm + 20)
  const province = [...new Set(candidati.map((c) => c.pc))]
  const [geos, uls] = await Promise.all([
    Promise.all(province.map(loadGeoProvincia)),
    Promise.all(province.map((p) => loadUnitaLocaliProvincia(p).catch(() => ({}) as Record<string, UnitaLocaliComune>))),
  ])
  const geoByCode = new Map<string, Feature<Polygon | MultiPolygon, { c: string }>>()
  for (const fc of geos) for (const f of fc.features) geoByCode.set(f.properties.c, f)
  const ulByCode = new Map<string, UnitaLocaliComune>()
  for (const u of uls) for (const [k, v] of Object.entries(u)) ulByCode.set(k, v)

  const cerchi = limiti.map((r) => circle([lon, lat], r, { steps: 128, units: 'kilometers' }))
  const esterno = cerchi[cerchi.length - 1]

  const comuni: ComuneZona[] = []
  const geometrie: Zona['geometrie'] = []
  for (const c of candidati) {
    const g = geoByCode.get(c.c)
    if (!g) continue
    const inter = intersect(featureCollection([g, esterno]))
    if (!inter) continue
    const areaTot = area(g)
    if (areaTot <= 0) continue
    // area cumulativa dentro ciascun cerchio, poi differenze = area per anello
    const cumul = cerchi.map((cer, i) => {
      if (i === cerchi.length - 1) return area(inter)
      const x = intersect(featureCollection([g, cer]))
      return x ? area(x) : 0
    })
    const quoteAnelli = cumul.map((v, i) => Math.max(0, (v - (i ? cumul[i - 1] : 0)) / areaTot))
    const quota = Math.min(1, cumul[cumul.length - 1] / areaTot)
    if (quota < 0.005) continue
    const ul = ulByCode.get(c.c)
    comuni.push({
      comune: c,
      distanzaKm: distanzaKm(lat, lon, c.lat, c.lon),
      quota,
      quoteAnelli,
      totali: totaliComune(c, ul, quota),
      ul,
    })
    // per la mappa si usa la parte di comune dentro il raggio
    geometrie.push({ ...g, geometry: inter.geometry, properties: { c: c.c, quota } })
  }
  comuni.sort((a, b) => a.distanzaKm - b.distanzaKm)

  const anelliTot = limiti.map((_, i) =>
    comuni.reduce((acc, z) => somma(acc, totaliComune(z.comune, z.ul, z.quoteAnelli[i])), vuoto()),
  )
  const totale = anelliTot.reduce(somma, vuoto())

  // Settori: somma pesata per quota delle divisioni a 2 cifre
  const settMap = new Map<string, SettoreZona>()
  for (const z of comuni) {
    if (!z.ul) continue
    for (const [div, v] of Object.entries(z.ul)) {
      if (!/^\d{2}$/.test(div)) continue
      const s = settMap.get(div) ?? {
        divisione: div,
        categoriaId: categoriaDaAteco(div)?.id,
        unitaLocali: 0,
        addetti: 0,
        ulClassi: [0, 0, 0, 0],
        addClassi: [0, 0, 0, 0],
      }
      s.unitaLocali += v[0] * z.quota
      s.addetti += v[1] * z.quota
      for (let i = 0; i < 4; i++) {
        s.ulClassi[i] += v[2 + i * 2] * z.quota
        s.addClassi[i] += v[3 + i * 2] * z.quota
      }
      settMap.set(div, s)
    }
  }
  const settori = [...settMap.values()].sort((a, b) => b.addetti - a.addetti)
  const categorie: CategoriaZona[] = CATEGORIE.map((cat) => {
    const ss = settori.filter((s) => s.categoriaId === cat.id)
    return {
      id: cat.id,
      nome: cat.nome,
      flotta: cat.flotta,
      nota: cat.nota,
      unitaLocali: ss.reduce((a, s) => a + s.unitaLocali, 0),
      addetti: ss.reduce((a, s) => a + s.addetti, 0),
      ulClassi: [0, 1, 2, 3].map((i) => ss.reduce((a, s) => a + s.ulClassi[i], 0)) as CategoriaZona['ulClassi'],
      addClassi: [0, 1, 2, 3].map((i) => ss.reduce((a, s) => a + s.addClassi[i], 0)) as CategoriaZona['addClassi'],
    }
  }).sort((a, b) => b.addetti - a.addetti)

  return {
    centro: { lat, lon },
    raggioKm,
    limitiAnelli: limiti,
    comuni,
    anelli: anelliTot,
    totale,
    settori,
    categorie,
    geometrie,
    annoVeicoli: comuni.find((z) => z.comune.veh)?.comune.veh?.anno ?? null,
  }
}
