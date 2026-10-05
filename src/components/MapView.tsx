import { circle } from '@turf/turf'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl'
// Il worker di MapLibre va impacchettato a parte: senza, in produzione non si trova
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Azienda } from '../lib/companies'
import { n0, n1 } from '../lib/fmt'
import type { Dealer } from '../lib/store'
import type { Zona } from '../lib/zone'

export type Metrica = 'autovetture' | 'veicoliMerci' | 'addetti' | 'pop' | 'officine'

export const METRICHE: Record<Metrica, { nome: string; unita: string; valore: (z: Zona['comuni'][number]) => number }> = {
  autovetture: { nome: 'Autovetture per km²', unita: 'auto/km²', valore: (z) => (z.comune.veh?.autovetture ?? 0) / Math.max(z.comune.km2, 0.1) },
  veicoliMerci: { nome: 'Veicoli merci e pesanti per km²', unita: 'mezzi/km²', valore: (z) => ((z.comune.veh?.autocarri ?? 0) + (z.comune.veh?.pesanti ?? 0)) / Math.max(z.comune.km2, 0.1) },
  addetti: { nome: 'Addetti per km²', unita: 'addetti/km²', valore: (z) => (z.ul?.['0010']?.[1] ?? 0) / Math.max(z.comune.km2, 0.1) },
  pop: { nome: 'Abitanti per km²', unita: 'ab./km²', valore: (z) => (z.comune.pop ?? 0) / Math.max(z.comune.km2, 0.1) },
  officine: { nome: 'Autovetture per officina', unita: 'auto per officina', valore: (z) => (z.comune.off ? (z.comune.veh?.autovetture ?? 0) / z.comune.off : 0) },
}

// in sviluppo MapLibre trova il worker da solo; in produzione serve l'indirizzo del file impacchettato
if (import.meta.env.PROD) maplibregl.setWorkerUrl(workerUrl)

const SEQ = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6']

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

const stileBase = (tema: 'light' | 'dark') => `https://tiles.openfreemap.org/styles/${tema === 'dark' ? 'dark' : 'positron'}`

function aggiungiLivelli(map: MLMap, scuro: boolean) {
  const vuota = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection
  map.addSource('comuni', { type: 'geojson', data: vuota })
  map.addSource('anelli', { type: 'geojson', data: vuota })
  map.addSource('aziende', { type: 'geojson', data: vuota })
  map.addSource('dealer', { type: 'geojson', data: vuota })
  // etichette in sorgenti separate: se i font della mappa di base non arrivano,
  // spariscono solo le scritte, non i cerchi e i punti
  map.addSource('anelli-testo', { type: 'geojson', data: vuota })
  map.addSource('dealer-testo', { type: 'geojson', data: vuota })
  const seq = SEQ.map(css)
  map.addLayer({
    id: 'comuni-fill',
    type: 'fill',
    source: 'comuni',
    paint: {
      'fill-color': ['match', ['get', 'cls'], 0, seq[0], 1, seq[1], 2, seq[2], 3, seq[3], 4, seq[4], 5, seq[5], css('--line')],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, scuro ? 0.55 : 0.62],
    },
  })
  map.addLayer({ id: 'comuni-line', type: 'line', source: 'comuni', paint: { 'line-color': scuro ? '#0b0f17' : '#ffffff', 'line-width': 0.8 } })
  map.addLayer({
    id: 'anelli-line',
    type: 'line',
    source: 'anelli',
    paint: { 'line-color': scuro ? '#f3f4f6' : '#0f2a4a', 'line-width': ['case', ['get', 'esterno'], 2.2, 1.2], 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
  })
  map.addLayer({
    id: 'anelli-label',
    type: 'symbol',
    source: 'anelli-testo',
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': scuro ? '#f3f4f6' : '#0f2a4a', 'text-halo-color': scuro ? '#0b0f17' : '#ffffff', 'text-halo-width': 1.6 },
  })
  map.addLayer({
    id: 'aziende-pt',
    type: 'circle',
    source: 'aziende',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'dip'], 1]], 1, 3.5, 10, 7, 35, 14],
      'circle-color': ['match', ['get', 'flotta'], 'Alta', css('--flotta-alta'), 'Media', css('--flotta-media'), 'Bassa', css('--flotta-bassa'), '#8a8f98'],
      'circle-stroke-color': scuro ? '#131a26' : '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.9,
    },
  })
  map.addLayer({
    id: 'dealer-halo',
    type: 'circle',
    source: 'dealer',
    paint: { 'circle-radius': ['case', ['get', 'attivo'], 16, 9], 'circle-color': '#f5b301', 'circle-opacity': ['case', ['get', 'attivo'], 0.28, 0.18] },
  })
  map.addLayer({
    id: 'dealer-pt',
    type: 'circle',
    source: 'dealer',
    paint: {
      'circle-radius': ['case', ['get', 'attivo'], 8, 5],
      'circle-color': ['case', ['get', 'attivo'], '#f5b301', '#ffd766'],
      'circle-stroke-color': '#0f2a4a',
      'circle-stroke-width': ['case', ['get', 'attivo'], 3, 1.5],
    },
  })
  map.addLayer({
    id: 'dealer-label',
    type: 'symbol',
    source: 'dealer-testo',
    layout: { 'text-field': ['get', 'nome'], 'text-size': ['case', ['get', 'attivo'], 13, 11], 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': scuro ? '#ffffff' : '#0f2a4a', 'text-halo-color': scuro ? '#0b0f17' : '#ffffff', 'text-halo-width': 2 },
  })

}

interface Props {
  zona: Zona | null
  dealer: Dealer | null
  altriDealer: Dealer[]
  aziende: Azienda[]
  metrica: Metrica
  tema: 'light' | 'dark'
  onSelezionaComune?: (codice: string) => void
  visibile?: boolean
}

export default function MapView({ zona, dealer, altriDealer, aziende, metrica, tema, onSelezionaComune, visibile = true }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [pronta, setPronta] = useState(0)

  // dati derivati
  const { comuniFC, soglie } = useMemo(() => {
    if (!zona) return { comuniFC: null, soglie: [] as number[] }
    const m = METRICHE[metrica]
    const byCode = new Map(zona.comuni.map((z) => [z.comune.c, z]))
    const vals = zona.comuni.map(m.valore)
    const soglie = quantili(vals, 6)
    const features = zona.geometrie.map((g) => {
      const z = byCode.get(g.properties.c)!
      const v = m.valore(z)
      let cls = 0
      while (cls < soglie.length && v >= soglie[cls]) cls++
      return {
        ...g,
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
          addetti: z.ul?.['0010']?.[1] ?? 0,
          ul: z.ul?.['0010']?.[0] ?? 0,
          off: z.comune.off ?? 0,
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

  const aziendeFC = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: aziende
          .filter((a) => a.lat !== null && a.lon !== null)
          .map((a) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
            properties: { nome: a.ragioneSociale, cat: a.categoria, flotta: a.flotta || 'n.d.', dip: a.dipendenti ?? 0, comune: a.comune, demo: a.fonte === 'demo' },
          })),
      }) as GeoJSON.FeatureCollection,
    [aziende],
  )

  const dealerFC = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: [
          ...altriDealer.map((d) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [d.lon, d.lat] }, properties: { nome: d.nome, attivo: false } })),
          ...(dealer ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [dealer.lon, dealer.lat] }, properties: { nome: dealer.nome, attivo: true } }] : []),
        ],
      }) as GeoJSON.FeatureCollection,
    [dealer, altriDealer],
  )

  const temaRef = useRef(tema)
  temaRef.current = tema
  const onSelRef = useRef(onSelezionaComune)
  onSelRef.current = onSelezionaComune

  // la mappa si crea una volta sola; il tema cambia solo lo stile di base
  useEffect(() => {
    if (!ref.current) return
    const map = new maplibregl.Map({
      container: ref.current,
      style: stileBase(temaRef.current),
      center: dealer ? [dealer.lon, dealer.lat] : [9.6, 45.4],
      zoom: dealer ? 9.4 : 7,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map
    // 'style.load' arriva appena lo stile è letto (anche dopo setStyle): i livelli dei dati
    // si aggiungono ogni volta, e compaiono anche se font o icone della base sono lenti
    map.on('style.load', () => {
      aggiungiLivelli(map, temaRef.current === 'dark')
      setPronta((x) => x + 1)
    })
      // interazione: hover e popup sui comuni e sulle aziende
      let hoverId: string | number | undefined
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '300px' })
      map.on('mousemove', 'comuni-fill', (e) => {
        const f = e.features?.[0]
        if (!f) return
        if (hoverId !== undefined) map.setFeatureState({ source: 'comuni', id: hoverId }, { hover: false })
        hoverId = f.id
        if (hoverId !== undefined) map.setFeatureState({ source: 'comuni', id: hoverId }, { hover: true })
        if (map.queryRenderedFeatures(e.point, { layers: ['aziende-pt', 'dealer-pt'] }).length) return
        const p = f.properties as Record<string, number | string>
        map.getCanvas().style.cursor = 'pointer'
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.5"><div style="font-weight:700;font-size:13px">${p.nome} <span style="color:var(--muted)">(${p.prov})</span></div>
            <div style="color:var(--ink-2)">${n1(Number(p.dist))} km · ${Math.round(Number(p.quota) * 100)}% nel raggio</div>
            <table style="margin-top:4px">
            <tr><td>Abitanti</td><td style="text-align:right;padding-left:12px"><b>${n0(Number(p.pop))}</b></td></tr>
            <tr><td>Autovetture</td><td style="text-align:right"><b>${n0(Number(p.auto))}</b></td></tr>
            <tr><td>Veicoli merci e pesanti</td><td style="text-align:right"><b>${n0(Number(p.merci))}</b></td></tr>
            <tr><td>Unità locali / addetti</td><td style="text-align:right"><b>${n0(Number(p.ul))} / ${n0(Number(p.addetti))}</b></td></tr>
            <tr><td>Officine e gommisti</td><td style="text-align:right"><b>${n0(Number(p.off))}</b></td></tr>
            </table><div style="color:var(--muted);margin-top:4px;font-size:11px">Valori del comune intero</div></div>`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'comuni-fill', () => {
        if (hoverId !== undefined) map.setFeatureState({ source: 'comuni', id: hoverId }, { hover: false })
        hoverId = undefined
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
      map.on('click', 'comuni-fill', (e) => {
        const c = e.features?.[0]?.properties?.c
        if (c && onSelRef.current) onSelRef.current(String(c))
      })
      map.on('mousemove', 'aziende-pt', (e) => {
        const p = e.features?.[0]?.properties as Record<string, string | number | boolean>
        if (!p) return
        map.getCanvas().style.cursor = 'pointer'
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.5"><div style="font-weight:700;font-size:13px">${p.nome}</div>
            <div style="color:var(--ink-2)">${p.cat}</div>
            <div>Dipendenti: <b>${p.dip ? n0(Number(p.dip)) : 'n.d.'}</b> · Flotta: <b>${p.flotta}</b></div>
            <div style="color:var(--muted)">${p.comune}${p.demo ? ' · DATO DIMOSTRATIVO' : ''}</div></div>`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'aziende-pt', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map && pronta) map.setStyle(stileBase(tema))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tema])

  // quando la scheda torna visibile la mappa ricalcola le dimensioni
  useEffect(() => {
    if (visibile) mapRef.current?.resize()
  }, [visibile])

  // aggiornamento dati
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronta) return
    const set = (id: string, data: GeoJSON.FeatureCollection | null) =>
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(data ?? { type: 'FeatureCollection', features: [] })
    if (comuniFC) comuniFC.features.forEach((f, i) => (f.id = i))
    set('comuni', comuniFC)
    set('anelli', anelliFC)
    set('anelli-testo', anelliFC)
    set('aziende', aziendeFC)
    set('dealer', dealerFC)
    set('dealer-testo', dealerFC)
  }, [pronta, comuniFC, anelliFC, aziendeFC, dealerFC])

  // inquadratura sul cerchio esterno
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
  }, [pronta, zona])

  const m = METRICHE[metrica]
  return (
    <div className="absolute inset-0">
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      {zona && soglie.length > 0 && (
        <div className="card absolute bottom-8 right-3 p-3 text-xs" style={{ minWidth: 210 }}>
          <div className="mb-2 font-semibold">{m.nome}</div>
          <div className="flex">
            {SEQ.slice(0, soglie.length + 1).map((v) => (
              <div key={v} className="h-2.5 flex-1 first:rounded-l last:rounded-r" style={{ background: `var(${v})` }} />
            ))}
          </div>
          <div className="num mt-1 flex justify-between text-[10px]" style={{ color: 'var(--muted)' }}>
            <span>basso</span>
            <span>alto</span>
          </div>
          {aziende.length > 0 && (
            <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
              <div className="mb-1 font-semibold">Aziende per intensità flotta</div>
              {(['Alta', 'Media', 'Bassa'] as const).map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--flotta-${f.toLowerCase()})` }} />
                  {f}
                </div>
              ))}
              <div className="mt-1" style={{ color: 'var(--muted)' }}>
                Dimensione = dipendenti
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
