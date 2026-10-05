import { circle } from '@turf/turf'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, MapGeoJSONFeature } from 'maplibre-gl'
// Il worker di MapLibre va impacchettato a parte: senza, in produzione non si trova
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Crosshair, Layers, Map as MapIcon, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Azienda } from '../lib/companies'
import { quotaVecchie } from '../lib/eta'
import { n0, n1 } from '../lib/fmt'
import type { EsitoMatch, StatoMatch } from '../lib/match'
import { DEMO } from '../lib/ambiente'
import { geocodifica, type Dealer } from '../lib/store'
import type { Zona } from '../lib/zone'

export type Metrica = 'autovetture' | 'veicoliMerci' | 'addetti' | 'pop' | 'officine' | 'eta'

export const METRICHE: Record<Metrica, { nome: string; unita: string; valore: (z: Zona['comuni'][number]) => number }> = {
  autovetture: { nome: 'Autovetture per km²', unita: 'auto/km²', valore: (z) => (z.comune.veh?.autovetture ?? 0) / Math.max(z.comune.km2, 0.1) },
  veicoliMerci: { nome: 'Veicoli merci e pesanti per km²', unita: 'mezzi/km²', valore: (z) => ((z.comune.veh?.autocarri ?? 0) + (z.comune.veh?.pesanti ?? 0)) / Math.max(z.comune.km2, 0.1) },
  addetti: { nome: 'Addetti per km²', unita: 'addetti/km²', valore: (z) => (z.ul?.['0010']?.[1] ?? 0) / Math.max(z.comune.km2, 0.1) },
  pop: { nome: 'Abitanti per km²', unita: 'ab./km²', valore: (z) => (z.comune.pop ?? 0) / Math.max(z.comune.km2, 0.1) },
  officine: { nome: 'Autovetture per officina', unita: 'auto per officina', valore: (z) => (z.comune.off ? (z.comune.veh?.autovetture ?? 0) / z.comune.off : 0) },
  eta: { nome: 'Auto vecchie: Euro 0-3, prima del 2006', unita: '% del parco', valore: (z) => quotaVecchie(z.comune.veh?.euro) * 100 },
}

// in sviluppo MapLibre trova il worker da solo; in produzione serve l'indirizzo del file impacchettato
if (import.meta.env.PROD) maplibregl.setWorkerUrl(workerUrl)

const SEQ = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6']

// colori di stato (riservati: non si usano per le serie)
const STATO_COLORE: Record<StatoMatch, string> = {
  'Già cliente': '#8a8f98',
  'Probabile cliente': '#fab219',
  'Da verificare': '#ec835a',
  Nuovo: '#0ca30c',
}

type Livello = 'comuni' | 'anelli' | 'concorrenza' | 'officine' | 'aziende' | 'dealer'
const LIVELLI: { id: Livello; nome: string; layer: string[] }[] = [
  { id: 'comuni', nome: 'Comuni', layer: ['comuni-fill', 'comuni-line'] },
  { id: 'anelli', nome: 'Anelli di distanza', layer: ['anelli-line', 'anelli-label'] },
  { id: 'concorrenza', nome: 'Gommisti concorrenti', layer: ['conc-gomm'] },
  { id: 'officine', nome: 'Altre officine', layer: ['conc-off'] },
  { id: 'aziende', nome: 'Aziende', layer: ['aziende-pt'] },
  { id: 'dealer', nome: 'Altri SuperService', layer: ['dealer-halo', 'dealer-pt', 'dealer-label'] },
]

function css(v: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim()
}

function quantili(valori: number[], n: number): number[] {
  const s = valori.filter((v) => v > 0).sort((a, b) => a - b)
  if (!s.length) return []
  const out: number[] = []
  for (let i = 1; i < n; i++) out.push(s[Math.min(s.length - 1, Math.floor((i / n) * s.length))])
  return [...new Set(out)]
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Stile di riserva senza servizi esterni: solo lo sfondo, i dati si disegnano sopra
const stileVuoto = (tema: 'light' | 'dark'): maplibregl.StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'sfondo', type: 'background', paint: { 'background-color': tema === 'dark' ? '#0f1520' : '#eef0f3' } }],
})
const stileBase = (tema: 'light' | 'dark'): string | maplibregl.StyleSpecification =>
  DEMO ? stileVuoto(tema) : `https://tiles.openfreemap.org/styles/${tema === 'dark' ? 'dark' : 'positron'}`

function aggiungiLivelli(map: MLMap, scuro: boolean) {
  const vuota = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection
  // etichette in sorgenti separate: se i font della mappa di base non arrivano,
  // spariscono solo le scritte, non i cerchi e i punti
  for (const id of ['comuni', 'anelli', 'concorrenza', 'aziende', 'dealer', 'anelli-testo', 'dealer-testo']) {
    map.addSource(id, { type: 'geojson', data: vuota })
  }
  const seq = SEQ.map(css)
  const alone = scuro ? '#0b0f17' : '#ffffff'
  const inchiostro = scuro ? '#f3f4f6' : '#0f2a4a'
  map.addLayer({
    id: 'comuni-fill',
    type: 'fill',
    source: 'comuni',
    paint: {
      'fill-color': ['match', ['get', 'cls'], 0, seq[0], 1, seq[1], 2, seq[2], 3, seq[3], 4, seq[4], 5, seq[5], css('--line')],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.88, scuro ? 0.55 : 0.62],
    },
  })
  map.addLayer({
    id: 'comuni-line',
    type: 'line',
    source: 'comuni',
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'scelto'], false], inchiostro, alone],
      'line-width': ['case', ['boolean', ['feature-state', 'scelto'], false], 2.5, 0.8],
    },
  })
  map.addLayer({
    id: 'anelli-line',
    type: 'line',
    source: 'anelli',
    paint: { 'line-color': inchiostro, 'line-width': ['case', ['get', 'esterno'], 2.2, 1.2], 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
  })
  const conFont = !!map.getStyle().glyphs
  if (conFont) map.addLayer({
    id: 'anelli-label',
    type: 'symbol',
    source: 'anelli-testo',
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': inchiostro, 'text-halo-color': alone, 'text-halo-width': 1.6 },
  })
  // concorrenza: officine generiche piccole e vuote, gommisti pieni (catene in viola)
  map.addLayer({
    id: 'conc-off',
    type: 'circle',
    source: 'concorrenza',
    filter: ['==', ['get', 'g'], 0],
    paint: { 'circle-radius': 3.5, 'circle-color': scuro ? '#131a26' : '#ffffff', 'circle-stroke-color': css('--ink-2'), 'circle-stroke-width': 1.2 },
  })
  map.addLayer({
    id: 'conc-gomm',
    type: 'circle',
    source: 'concorrenza',
    filter: ['==', ['get', 'g'], 1],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'rete'], ''], 5, 6],
      'circle-color': ['get', 'colore'],
      'circle-stroke-color': scuro ? '#0b0f17' : '#ffffff',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'aziende-pt',
    type: 'circle',
    source: 'aziende',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'dip'], 1]], 1, 3.5, 10, 7, 35, 14],
      'circle-color': ['get', 'colore'],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'scelto'], false], inchiostro, scuro ? '#131a26' : '#ffffff'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'scelto'], false], 3, 1.5],
      'circle-opacity': 0.9,
    },
  })
  map.addLayer({ id: 'dealer-halo', type: 'circle', source: 'dealer', paint: { 'circle-radius': 10, 'circle-color': '#f5b301', 'circle-opacity': 0.22 } })
  map.addLayer({
    id: 'dealer-pt',
    type: 'circle',
    source: 'dealer',
    paint: { 'circle-radius': 6, 'circle-color': '#ffd766', 'circle-stroke-color': '#0f2a4a', 'circle-stroke-width': 2 },
  })
  if (conFont) map.addLayer({
    id: 'dealer-label',
    type: 'symbol',
    source: 'dealer-testo',
    layout: { 'text-field': ['get', 'nome'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': inchiostro, 'text-halo-color': alone, 'text-halo-width': 2 },
  })
}

/** Segnaposto del centro di analisi: giallo, trascinabile. */
function elementoSegnaposto() {
  const el = document.createElement('div')
  el.setAttribute('aria-label', "Centro dell'analisi: trascina per spostarlo")
  el.title = "Trascina per spostare il centro dell'analisi"
  el.style.cssText = 'width:34px;height:34px;cursor:grab;filter:drop-shadow(0 2px 4px rgb(0 0 0 / .35))'
  el.innerHTML =
    '<svg viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="15" fill="#f5b301" opacity=".3"/><circle cx="17" cy="17" r="9" fill="#f5b301" stroke="#0f2a4a" stroke-width="3"/><circle cx="17" cy="17" r="2.5" fill="#0f2a4a"/></svg>'
  return el
}

export interface Centro {
  lat: number
  lon: number
  nome: string
  esplorativo: boolean
}

interface Props {
  zona: Zona | null
  centro: Centro | null
  altriDealer: Dealer[]
  aziende: Azienda[]
  esiti?: Map<string, EsitoMatch>
  metrica: Metrica
  onMetrica: (m: Metrica) => void
  tema: 'light' | 'dark'
  visibile?: boolean
  onSpostaCentro: (lat: number, lon: number, nome?: string) => void
  onApriComune?: (codice: string) => void
  onSelezionaDealer?: (id: string) => void
}

export default function MapView(props: Props) {
  const { zona, centro, altriDealer, aziende, esiti, metrica, onMetrica, tema, visibile = true } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const [pronta, setPronta] = useState(0)
  const [livelli, setLivelli] = useState<Record<Livello, boolean>>({ comuni: true, anelli: true, concorrenza: true, officine: false, aziende: true, dealer: true })
  const [esplora, setEsplora] = useState(false)
  const [coloraPer, setColoraPer] = useState<'flotta' | 'stato'>('flotta')
  const [flotte, setFlotte] = useState<Record<string, boolean>>({ Alta: true, Media: true, Bassa: true, 'n.d.': true })
  const [stati, setStati] = useState<Record<string, boolean>>({ 'Già cliente': true, 'Probabile cliente': true, 'Da verificare': true, Nuovo: true })
  const [minDip, setMinDip] = useState(0)
  const [cerca, setCerca] = useState('')
  const [risultati, setRisultati] = useState<{ nome: string; lat: number; lon: number }[]>([])
  const [pannello, setPannello] = useState(true)

  // i gestori degli eventi della mappa leggono sempre i valori aggiornati
  const live = useRef(props)
  live.current = props
  const esploraRef = useRef(esplora)
  esploraRef.current = esplora
  const aziendeById = useRef(new Map<string, Azienda>())

  const haEsiti = !!esiti && esiti.size > 0
  const coloreStato = coloraPer === 'stato' && haEsiti

  /* ---------- dati per i livelli ---------- */

  const { comuniFC, soglie } = useMemo(() => {
    if (!zona) return { comuniFC: null, soglie: [] as number[] }
    const m = METRICHE[metrica]
    const byCode = new Map(zona.comuni.map((z) => [z.comune.c, z]))
    const soglie = quantili(zona.comuni.map(m.valore), 6)
    const features = zona.geometrie.map((g, i) => {
      const z = byCode.get(g.properties.c)!
      const v = m.valore(z)
      let cls = 0
      while (cls < soglie.length && v >= soglie[cls]) cls++
      const tot = z.ul?.['0010']
      return {
        ...g,
        id: i,
        properties: {
          c: g.properties.c,
          nome: z.comune.n,
          prov: z.comune.p,
          quota: z.quota,
          valore: v,
          cls: v > 0 ? cls : -1,
          pop: z.comune.pop ?? 0,
          auto: z.comune.veh?.autovetture ?? 0,
          merci: (z.comune.veh?.autocarri ?? 0) + (z.comune.veh?.pesanti ?? 0),
          addetti: tot?.[1] ?? 0,
          ul: tot?.[0] ?? 0,
          ul50: (tot?.[6] ?? 0) + (tot?.[8] ?? 0),
          off: z.comune.off ?? 0,
          vecchie: quotaVecchie(z.comune.veh?.euro),
          dist: z.distanzaKm,
        },
      }
    })
    return { comuniFC: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, soglie }
  }, [zona, metrica])

  const anelliFC = useMemo(() => {
    if (!zona) return null
    return {
      type: 'FeatureCollection',
      features: zona.limitiAnelli.map((r, i) => ({
        ...circle([zona.centro.lon, zona.centro.lat], r, { steps: 160, units: 'kilometers' }),
        properties: { r, label: `${r} km`, esterno: i === zona.limitiAnelli.length - 1 },
      })),
    } as GeoJSON.FeatureCollection
  }, [zona])

  const { aziendeFC, visibiliAziende } = useMemo(() => {
    const m = new Map<string, Azienda>()
    const features = []
    for (const a of aziende) {
      if (a.lat === null || a.lon === null) continue
      const fl = a.flotta || 'n.d.'
      const st = esiti?.get(a.id)?.stato ?? 'Nuovo'
      if (!flotte[fl]) continue
      if (coloreStato && !stati[st]) continue
      if (minDip && (a.dipendenti ?? 0) < minDip) continue
      m.set(a.id, a)
      features.push({
        type: 'Feature' as const,
        id: features.length,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: {
          id: a.id,
          dip: a.dipendenti ?? 0,
          colore: coloreStato ? STATO_COLORE[st] : fl === 'n.d.' ? '#8a8f98' : css(`--flotta-${fl.toLowerCase()}`),
        },
      })
    }
    aziendeById.current = m
    return { aziendeFC: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, visibiliAziende: features.length }
    // css() dipende dal tema: si ricalcola anche quando cambia
  }, [aziende, esiti, flotte, stati, minDip, coloreStato, tema]) // eslint-disable-line react-hooks/exhaustive-deps

  const concorrenzaFC = useMemo(() => {
    const catena = tema === 'dark' ? '#9085e9' : '#4a3aa7'
    return {
      type: 'FeatureCollection',
      features: (zona?.concorrenti ?? []).map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: {
          g: c.gommista ? 1 : 0,
          rete: c.rete,
          gruppo: c.gruppo,
          nome: c.nome,
          dist: c.distanzaKm,
          colore: c.rete === 'SuperService' ? '#f5b301' : c.rete ? catena : css('--ink-2'),
        },
      })),
    } as GeoJSON.FeatureCollection
  }, [zona, tema]) // eslint-disable-line react-hooks/exhaustive-deps

  const dealerFC = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: altriDealer.map((d) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [d.lon, d.lat] }, properties: { id: d.id, nome: d.nome } })),
      }) as GeoJSON.FeatureCollection,
    [altriDealer],
  )

  /* ---------- creazione della mappa (una sola volta) ---------- */

  useEffect(() => {
    if (!ref.current) return
    const c = live.current.centro
    const map = new maplibregl.Map({
      container: ref.current,
      style: stileBase(live.current.tema),
      center: c ? [c.lon, c.lat] : [9.6, 45.4],
      zoom: c ? 9.4 : 7,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    if (wrapRef.current) map.addControl(new maplibregl.FullscreenControl({ container: wrapRef.current }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map

    // segnaposto trascinabile del centro di analisi
    const marker = new maplibregl.Marker({ element: elementoSegnaposto(), draggable: true })
    if (c) marker.setLngLat([c.lon, c.lat]).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      live.current.onSpostaCentro(p.lat, p.lng)
    })
    markerRef.current = marker

    // 'style.load' arriva appena lo stile è letto (anche dopo setStyle): i livelli dei dati
    // si aggiungono ogni volta, e compaiono anche se font o icone della base sono lenti
    let stileCaricato = false
    map.on('style.load', () => {
      stileCaricato = true
      aggiungiLivelli(map, live.current.tema === 'dark')
      setPronta((x) => x + 1)
    })
    // se la mappa di base non risponde, si passa allo sfondo semplice: i dati restano visibili
    const riserva = setTimeout(() => {
      if (!stileCaricato) map.setStyle(stileVuoto(live.current.tema))
    }, 10000)
    map.once('remove', () => clearTimeout(riserva))

    const suggerimento = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'cmp-tip' })
    const scheda = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 12, maxWidth: '320px' })
    let hoverComune: string | number | undefined
    let sceltoComune: string | number | undefined
    let sceltaAzienda: string | number | undefined
    const togliScelte = () => {
      if (sceltoComune !== undefined && map.getSource('comuni')) map.setFeatureState({ source: 'comuni', id: sceltoComune }, { scelto: false })
      if (sceltaAzienda !== undefined && map.getSource('aziende')) map.setFeatureState({ source: 'aziende', id: sceltaAzienda }, { scelto: false })
      sceltoComune = sceltaAzienda = undefined
    }
    scheda.on('close', togliScelte)

    const sopraPunto = (p: maplibregl.PointLike) =>
      map.queryRenderedFeatures(p, { layers: ['aziende-pt', 'dealer-pt', 'conc-gomm', 'conc-off'].filter((l) => map.getLayer(l)) }).length > 0

    map.on('mousemove', 'comuni-fill', (e) => {
      const f = e.features?.[0]
      if (!f) return
      if (hoverComune !== undefined) map.setFeatureState({ source: 'comuni', id: hoverComune }, { hover: false })
      hoverComune = f.id
      if (hoverComune !== undefined) map.setFeatureState({ source: 'comuni', id: hoverComune }, { hover: true })
      if (esploraRef.current) return suggerimento.remove()
      map.getCanvas().style.cursor = 'pointer'
      if (sopraPunto(e.point)) return suggerimento.remove()
      const p = f.properties as Record<string, number | string>
      suggerimento
        .setLngLat(e.lngLat)
        .setHTML(`<b>${esc(p.nome)}</b> · ${n0(Number(p.auto))} auto · ${n0(Number(p.addetti))} addetti`)
        .addTo(map)
    })
    map.on('mouseleave', 'comuni-fill', () => {
      if (hoverComune !== undefined) map.setFeatureState({ source: 'comuni', id: hoverComune }, { hover: false })
      hoverComune = undefined
      map.getCanvas().style.cursor = esploraRef.current ? 'crosshair' : ''
      suggerimento.remove()
    })
    for (const l of ['aziende-pt', 'dealer-pt', 'conc-gomm', 'conc-off']) {
      map.on('mouseenter', l, () => !esploraRef.current && (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', l, () => (map.getCanvas().style.cursor = esploraRef.current ? 'crosshair' : ''))
    }

    map.on('click', (e) => {
      if (esploraRef.current) {
        scheda.remove()
        suggerimento.remove()
        live.current.onSpostaCentro(e.lngLat.lat, e.lngLat.lng)
        // un clic basta: per ritoccare la posizione si trascina il segnaposto
        setEsplora(false)
        return
      }
      const layers = ['dealer-pt', 'aziende-pt', 'conc-gomm', 'conc-off', 'comuni-fill'].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none')
      const f: MapGeoJSONFeature | undefined = map.queryRenderedFeatures(e.point, { layers })[0]
      togliScelte()
      suggerimento.remove()
      if (!f) {
        scheda.remove()
        return
      }
      const p = f.properties as Record<string, string | number>
      if (f.layer.id === 'dealer-pt') {
        scheda
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="cmp-card"><div class="t">${esc(p.nome)}</div><div class="s">SuperService della rete</div>
            <div class="row"><button class="cmp-btn" data-azione="dealer" data-id="${esc(p.id)}">Analizza questo dealer</button></div></div>`,
          )
          .addTo(map)
      } else if (f.layer.id === 'conc-gomm' || f.layer.id === 'conc-off') {
        const tipo = Number(p.g) ? 'Gommista' : 'Officina'
        const rete = p.rete ? `${esc(p.rete)}${p.gruppo ? ` · gruppo ${esc(p.gruppo)}` : ''}` : 'Indipendente o rete non indicata'
        scheda
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="cmp-card"><div class="t">${esc(p.nome || `${tipo} senza nome`)}</div>
            <div class="s">${tipo} · ${rete}</div>
            <table><tr><td>Distanza dal centro</td><td>${n1(Number(p.dist))} km</td></tr></table>
            <div class="m">La rete si ricava dal nome dell'attività.</div></div>`,
          )
          .addTo(map)
      } else if (f.layer.id === 'aziende-pt') {
        const a = aziendeById.current.get(String(p.id))
        if (!a) return
        sceltaAzienda = f.id
        if (f.id !== undefined) map.setFeatureState({ source: 'aziende', id: f.id }, { scelto: true })
        const es = live.current.esiti?.get(a.id)
        scheda
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="cmp-card"><div class="t">${esc(a.ragioneSociale)}</div>
            <div class="s">${esc(a.categoria)}${a.ateco ? ` · ATECO ${esc(a.ateco)}` : ''}</div>
            ${a.fonte === 'demo' ? '<div class="demo">Dato dimostrativo</div>' : ''}
            <table>
              <tr><td>Dipendenti</td><td>${a.dipendenti ? n0(a.dipendenti) : 'n.d.'}</td></tr>
              <tr><td>Fatturato</td><td>${a.fatturato ? `${n0(a.fatturato / 1000)} k€` : 'n.d.'}</td></tr>
              <tr><td>Intensità flotta</td><td>${esc(a.flotta || 'n.d.')}</td></tr>
              <tr><td>Distanza</td><td>${n1(a.distanzaKm)} km</td></tr>
              ${es ? `<tr><td>Stato</td><td><span class="dot" style="background:${STATO_COLORE[es.stato]}"></span>${esc(es.stato)}</td></tr>` : ''}
              ${es?.cliente ? `<tr><td>Cliente</td><td>${esc(es.cliente.ragioneSociale)}</td></tr>` : ''}
            </table>
            <div class="s">${esc(a.indirizzo)} ${esc(a.comune)} ${esc(a.provincia)}</div>
            ${a.piva ? `<div class="s">P.IVA ${esc(a.piva)}${a.pec ? ` · ${esc(a.pec)}` : ''}</div>` : ''}</div>`,
          )
          .addTo(map)
      } else {
        sceltoComune = f.id
        if (f.id !== undefined) map.setFeatureState({ source: 'comuni', id: f.id }, { scelto: true })
        scheda
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="cmp-card"><div class="t">${esc(p.nome)} <span class="m">${esc(p.prov)}</span></div>
            <div class="s">${n1(Number(p.dist))} km dal centro · ${Math.round(Number(p.quota) * 100)}% nel raggio</div>
            <table>
              <tr><td>Abitanti</td><td>${n0(Number(p.pop))}</td></tr>
              <tr><td>Autovetture</td><td>${n0(Number(p.auto))}</td></tr>
              <tr><td>Veicoli merci e pesanti</td><td>${n0(Number(p.merci))}</td></tr>
              <tr><td>Auto Euro 0-3, prima del 2006</td><td>${Math.round(Number(p.vecchie) * 100)}%</td></tr>
              <tr><td>Unità locali</td><td>${n0(Number(p.ul))}</td></tr>
              <tr><td>Addetti</td><td>${n0(Number(p.addetti))}</td></tr>
              <tr><td>Sedi con 50+ addetti</td><td>${n0(Number(p.ul50))}</td></tr>
              <tr><td>Officine e gommisti</td><td>${n0(Number(p.off))}</td></tr>
            </table>
            <div class="m">Valori del comune intero</div>
            <div class="row"><button class="cmp-btn" data-azione="comune" data-id="${esc(p.c)}">Vedi in tabella</button>
            <button class="cmp-btn sec" data-azione="centro" data-lat="${e.lngLat.lat}" data-lon="${e.lngLat.lng}" data-nome="${esc(p.nome)}">Analizza da qui</button></div></div>`,
          )
          .addTo(map)
      }
      // pulsanti dentro la scheda
      scheda.getElement()?.querySelectorAll<HTMLButtonElement>('button.cmp-btn').forEach((b) =>
        b.addEventListener('click', () => {
          const az = b.dataset.azione
          if (az === 'dealer' && b.dataset.id) live.current.onSelezionaDealer?.(b.dataset.id)
          if (az === 'comune' && b.dataset.id) live.current.onApriComune?.(b.dataset.id)
          if (az === 'centro') live.current.onSpostaCentro(Number(b.dataset.lat), Number(b.dataset.lon), b.dataset.nome)
          scheda.remove()
        }),
      )
    })

    return () => {
      marker.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  /* ---------- sincronizzazione ---------- */

  useEffect(() => {
    const map = mapRef.current
    if (map && pronta) map.setStyle(stileBase(tema))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tema])

  useEffect(() => {
    if (visibile) mapRef.current?.resize()
  }, [visibile])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronta) return
    const set = (id: string, data: GeoJSON.FeatureCollection | null) =>
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(data ?? { type: 'FeatureCollection', features: [] })
    set('comuni', comuniFC)
    set('anelli', anelliFC)
    set('anelli-testo', anelliFC)
    set('aziende', aziendeFC)
    set('concorrenza', concorrenzaFC)
    set('dealer', dealerFC)
    set('dealer-testo', dealerFC)
  }, [pronta, comuniFC, anelliFC, aziendeFC, concorrenzaFC, dealerFC])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronta) return
    for (const l of LIVELLI) for (const id of l.layer) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', livelli[l.id] ? 'visible' : 'none')
  }, [pronta, livelli])

  // segnaposto sul centro
  useEffect(() => {
    const map = mapRef.current
    const mk = markerRef.current
    if (!map || !mk || !centro) return
    mk.setLngLat([centro.lon, centro.lat])
    if (!mk.getElement().isConnected) mk.addTo(map)
  }, [centro?.lat, centro?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = esplora ? 'crosshair' : ''
  }, [esplora])

  // inquadratura sul cerchio esterno quando cambiano centro o raggio
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronta || !zona) return
    const r = zona.raggioKm
    const dLat = r / 111
    const dLon = r / (111 * Math.cos((zona.centro.lat * Math.PI) / 180))
    map.fitBounds(
      [
        [zona.centro.lon - dLon, zona.centro.lat - dLat],
        [zona.centro.lon + dLon, zona.centro.lat + dLat],
      ],
      { padding: 40, duration: 700 },
    )
  }, [pronta, zona?.centro.lat, zona?.centro.lon, zona?.raggioKm]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cercaIndirizzo() {
    if (!cerca.trim()) return
    try {
      const r = await geocodifica(cerca)
      if (r.length === 1) {
        props.onSpostaCentro(r[0].lat, r[0].lon, r[0].nome.split(',')[0])
        setRisultati([])
      } else setRisultati(r)
    } catch {
      setRisultati([])
    }
  }

  const m = METRICHE[metrica]
  const contaFlotta = (f: string) => aziende.filter((a) => (a.flotta || 'n.d.') === f && a.lat !== null).length
  const contaStato = (s: StatoMatch) => aziende.filter((a) => (esiti?.get(a.id)?.stato ?? 'Nuovo') === s && a.lat !== null).length

  return (
    <div ref={wrapRef} className="absolute inset-0" style={{ background: 'var(--surface-2)' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />

      {/* barra in alto: metrica, ricerca, esplora */}
      <div className="absolute left-3 right-14 top-3 flex flex-wrap items-start gap-2">
        <div className="card flex items-center gap-2 px-3 py-2 text-xs">
          <MapIcon size={14} />
          <select className="bg-transparent font-semibold outline-none" value={metrica} onChange={(e) => onMetrica(e.target.value as Metrica)} aria-label="Colora i comuni per">
            {Object.entries(METRICHE).map(([k, v]) => (
              <option key={k} value={k}>{v.nome}</option>
            ))}
          </select>
        </div>
        {!DEMO && <div className="relative">
          <div className="card flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <Search size={14} />
            <input
              className="w-48 bg-transparent py-0.5 outline-none"
              placeholder="Cerca indirizzo o comune"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cercaIndirizzo()}
              aria-label="Cerca un indirizzo e analizza da lì"
            />
            {cerca && (
              <button onClick={() => { setCerca(''); setRisultati([]) }} aria-label="Cancella ricerca">
                <X size={13} />
              </button>
            )}
          </div>
          {risultati.length > 1 && (
            <div className="card absolute left-0 top-full z-10 mt-1 w-80 overflow-hidden text-xs">
              {risultati.map((r) => (
                <button
                  key={`${r.lat},${r.lon}`}
                  className="block w-full px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                  onClick={() => {
                    props.onSpostaCentro(r.lat, r.lon, r.nome.split(',')[0])
                    setRisultati([])
                  }}
                >
                  {r.nome}
                </button>
              ))}
            </div>
          )}
        </div>}
        <button
          className="card flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
          style={esplora ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : undefined}
          onClick={() => setEsplora((x) => !x)}
          aria-pressed={esplora}
          title="Con Esplora attivo, un clic sulla mappa sposta il centro dell'analisi"
        >
          <Crosshair size={14} /> {esplora ? 'Clicca un punto della mappa' : 'Esplora un punto'}
        </button>
      </div>

      {/* pannello livelli e legenda */}
      <div className="absolute bottom-8 right-3 flex max-h-[calc(100%-110px)] flex-col items-end gap-2">
        <button className="card flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" onClick={() => setPannello((x) => !x)} aria-expanded={pannello}>
          <Layers size={14} /> {pannello ? 'Nascondi legenda' : 'Livelli e legenda'}
        </button>
        {pannello && (
          <div className="card w-64 overflow-auto p-3 text-xs">
            <div className="mb-1.5 font-semibold">Livelli</div>
            {LIVELLI.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="checkbox" checked={livelli[l.id]} onChange={(e) => setLivelli((s) => ({ ...s, [l.id]: e.target.checked }))} />
                {l.nome}
              </label>
            ))}

            {livelli.comuni && soglie.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                <div className="mb-1.5 font-semibold">{m.nome}</div>
                <div className="flex">
                  {SEQ.slice(0, soglie.length + 1).map((v) => (
                    <div key={v} className="h-2.5 flex-1 first:rounded-l last:rounded-r" style={{ background: `var(${v})` }} />
                  ))}
                </div>
                <div className="num mt-1 flex justify-between text-[10px]" style={{ color: 'var(--muted)' }}>
                  <span>basso</span>
                  <span>alto</span>
                </div>
              </div>
            )}

            {(livelli.concorrenza || livelli.officine) && zona && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                <div className="mb-1.5 font-semibold">Concorrenza mappata</div>
                {[
                  { nome: 'Gommisti indipendenti', colore: 'var(--ink-2)', n: zona.concorrenti.filter((c) => c.gommista && !c.rete).length, vuoto: false },
                  { nome: 'Catene e reti', colore: tema === 'dark' ? '#9085e9' : '#4a3aa7', n: zona.concorrenti.filter((c) => c.gommista && c.rete && c.rete !== 'SuperService').length, vuoto: false },
                  { nome: 'SuperService in OpenStreetMap', colore: '#f5b301', n: zona.concorrenti.filter((c) => c.rete === 'SuperService').length, vuoto: false },
                  { nome: 'Altre officine', colore: 'var(--ink-2)', n: zona.concorrenti.filter((c) => !c.gommista).length, vuoto: true },
                ].map((r) => (
                  <div key={r.nome} className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={r.vuoto ? { border: `1.5px solid ${r.colore}` } : { background: r.colore }} />
                    <span className="flex-1">{r.nome}</span>
                    <span className="num" style={{ color: 'var(--muted)' }}>{n0(r.n)}</span>
                  </div>
                ))}
                <div className="mt-1" style={{ color: 'var(--muted)' }}>
                  {zona.infoConcorrenza?.registro
                    ? 'Fonti: Registro Imprese e OpenStreetMap.'
                    : zona.infoConcorrenza?.stato === 'carico'
                      ? 'Carico OpenStreetMap…'
                      : 'Solo OpenStreetMap: parziale. Elenco completo in Territorio.'}
                </div>
              </div>
            )}

            {livelli.aziende && aziende.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                <div className="mb-1.5 flex items-center justify-between gap-2 font-semibold">
                  <span>Aziende ({n0(visibiliAziende)})</span>
                  {haEsiti && (
                    <select className="bg-transparent text-[11px] font-semibold outline-none" value={coloraPer} onChange={(e) => setColoraPer(e.target.value as 'flotta' | 'stato')} aria-label="Colora le aziende per">
                      <option value="flotta">per flotta</option>
                      <option value="stato">per stato cliente</option>
                    </select>
                  )}
                </div>
                {!coloreStato
                  ? (['Alta', 'Media', 'Bassa', 'n.d.'] as const).filter((f) => contaFlotta(f) > 0).map((f) => (
                      <label key={f} className="flex cursor-pointer items-center gap-2 py-0.5">
                        <input type="checkbox" checked={flotte[f]} onChange={(e) => setFlotte((s) => ({ ...s, [f]: e.target.checked }))} />
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: f === 'n.d.' ? '#8a8f98' : `var(--flotta-${f.toLowerCase()})` }} />
                        <span className="flex-1">{f === 'n.d.' ? 'Non classificate' : `Flotta ${f.toLowerCase()}`}</span>
                        <span className="num" style={{ color: 'var(--muted)' }}>{n0(contaFlotta(f))}</span>
                      </label>
                    ))
                  : (Object.keys(STATO_COLORE) as StatoMatch[]).map((s) => (
                      <label key={s} className="flex cursor-pointer items-center gap-2 py-0.5">
                        <input type="checkbox" checked={stati[s]} onChange={(e) => setStati((x) => ({ ...x, [s]: e.target.checked }))} />
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATO_COLORE[s] }} />
                        <span className="flex-1">{s}</span>
                        <span className="num" style={{ color: 'var(--muted)' }}>{n0(contaStato(s))}</span>
                      </label>
                    ))}
                <label className="mt-2 block">
                  <span style={{ color: 'var(--ink-2)' }}>
                    Dipendenti minimi: <b>{minDip || 'tutti'}</b>
                  </span>
                  <input type="range" min={0} max={250} step={10} value={minDip} onChange={(e) => setMinDip(Number(e.target.value))} className="mt-1 w-full" aria-label="Dipendenti minimi" />
                </label>
                <div className="mt-1" style={{ color: 'var(--muted)' }}>Dimensione del punto = dipendenti. Clic su un punto per la scheda.</div>
              </div>
            )}
            <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
              Il segnaposto giallo è il centro dell'analisi: trascinalo per spostarla.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
