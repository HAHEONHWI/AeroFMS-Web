import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { useTranslation } from 'react-i18next'
import { buildMapScene, computeVnavProfile, displayedPerformance, displayedPlan } from '@aerofms/core'
import type { AircraftFmsAdapter, FmsState, MapScene } from '@aerofms/core'
import type { NavigationProvider } from '@aerofms/navigation'
import { colors } from '@aerofms/ui'

type FC = FeatureCollection

function sceneToGeoJson(scene: MapScene): { lines: FC; points: FC } {
  return {
    lines: {
      type: 'FeatureCollection',
      features: scene.lines.map((l) => ({
        type: 'Feature',
        properties: { kind: l.kind, dashed: l.dashed ? 1 : 0, id: l.id },
        geometry: { type: 'LineString', coordinates: l.coordinates },
      })),
    },
    points: {
      type: 'FeatureCollection',
      features: scene.points.map((p) => ({
        type: 'Feature',
        properties: {
          kind: p.kind,
          label: p.label,
          legId: p.legId ?? '',
          active: p.active ? 1 : 0,
          highlighted: p.highlighted ? 1 : 0,
          modified: p.modified ? 1 : 0,
          constraint: p.constraint ?? '',
          heading: p.headingTrue ?? 0,
        },
        geometry: { type: 'Point', coordinates: p.coordinate },
      })),
    },
  }
}

const EMPTY: FC = { type: 'FeatureCollection', features: [] }
const m = colors.map

function baseStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    sources: {
      land: { type: 'geojson', data: '/geo/land.json' },
      lines: { type: 'geojson', data: EMPTY },
      points: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': m.background } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': m.land } },
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#24344b', 'line-width': 0.8 } },
      { id: 'airways', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'AIRWAY'], paint: { 'line-color': m.airway, 'line-width': 1 } },
      { id: 'runways', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'RUNWAY'], paint: { 'line-color': m.runway, 'line-width': 3 } },
      { id: 'fix', type: 'line', source: 'lines', filter: ['in', ['get', 'kind'], ['literal', ['FIX_RING', 'FIX_RADIAL']]], paint: { 'line-color': m.fix, 'line-width': 1, 'line-dasharray': [3, 3] } },
      { id: 'secondary', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'SECONDARY'], paint: { 'line-color': m.secondary, 'line-width': 1.5, 'line-dasharray': [2, 2] } },
      { id: 'route-missed', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'MISSED'], paint: { 'line-color': m.missed, 'line-width': 1.5, 'line-dasharray': [3, 2] } },
      { id: 'route-active', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'ACTIVE'], paint: { 'line-color': m.active, 'line-width': 2.5 } },
      { id: 'route-mod', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'MOD'], paint: { 'line-color': m.mod, 'line-width': 2, 'line-dasharray': [2, 1.5] } },
      { id: 'holds', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'HOLD'], paint: { 'line-color': m.hold, 'line-width': 1.5 } },
      {
        id: 'pt-highlight',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'highlighted'], 1],
        paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': m.highlight, 'circle-stroke-width': 2 },
      },
      {
        id: 'pt-waypoints',
        type: 'circle',
        source: 'points',
        filter: ['in', ['get', 'kind'], ['literal', ['WAYPOINT', 'FIX_REF']]],
        paint: {
          'circle-radius': 4,
          'circle-color': m.background,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['case', ['==', ['get', 'active'], 1], m.active, ['==', ['get', 'kind'], 'FIX_REF'], m.fix, m.waypoint],
        },
      },
      { id: 'pt-airports', type: 'circle', source: 'points', filter: ['==', ['get', 'kind'], 'AIRPORT'], paint: { 'circle-radius': 6, 'circle-color': m.background, 'circle-stroke-width': 2, 'circle-stroke-color': m.airport } },
      { id: 'pt-disco', type: 'circle', source: 'points', filter: ['==', ['get', 'kind'], 'DISCONTINUITY'], paint: { 'circle-radius': 9, 'circle-color': 'rgba(246,178,61,0.15)', 'circle-stroke-width': 1.5, 'circle-stroke-color': colors.warning } },
      { id: 'pt-vnav', type: 'circle', source: 'points', filter: ['in', ['get', 'kind'], ['literal', ['TOC', 'TOD', 'STEP']]], paint: { 'circle-radius': 5, 'circle-color': m.tocTod } },
      {
        id: 'pt-labels',
        type: 'symbol',
        source: 'points',
        filter: ['!=', ['get', 'kind'], 'AIRCRAFT'],
        layout: {
          'text-field': ['case', ['!=', ['get', 'constraint'], ''], ['concat', ['get', 'label'], '\n', ['get', 'constraint']], ['get', 'label']],
          'text-font': ['Open Sans Semibold'],
          'text-size': 11,
          'text-offset': [0.8, 0],
          'text-anchor': 'left',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': ['case', ['==', ['get', 'active'], 1], m.active, ['in', ['get', 'kind'], ['literal', ['TOC', 'TOD', 'STEP']]], m.tocTod, ['==', ['get', 'kind'], 'AIRPORT'], m.airport, '#c8d1de'],
          'text-halo-color': m.background,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'aircraft',
        type: 'symbol',
        source: 'points',
        filter: ['==', ['get', 'kind'], 'AIRCRAFT'],
        layout: { 'icon-image': 'aircraft', 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-size': 1 },
      },
    ],
  }
}

function aircraftImage(): ImageData {
  const size = 32
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (!g) return new ImageData(size, size)
  g.fillStyle = m.aircraft
  g.strokeStyle = '#05080D'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(16, 2)
  g.lineTo(26, 28)
  g.lineTo(16, 22)
  g.lineTo(6, 28)
  g.closePath()
  g.fill()
  g.stroke()
  return g.getImageData(0, 0, size, size)
}

export interface FlightMapProps {
  state: FmsState
  nav: NavigationProvider
  adapter: AircraftFmsAdapter
  onSelectLeg?: (legId: string) => void
  showAirways?: boolean
  basemap?: boolean
  className?: string
}

export function FlightMap({ state, nav, adapter, onSelectLeg, showAirways = true, basemap = false, className = '' }: FlightMapProps) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [follow, setFollow] = useState(false)
  const fittedFor = useRef<string>('')
  const selectRef = useRef(onSelectLeg)
  useEffect(() => {
    selectRef.current = onSelectLeg
  })

  const scene = useMemo(() => {
    const plan = displayedPlan(state)
    const vnav = computeVnavProfile(plan, displayedPerformance(state), adapter.performanceModel, nav)
    return buildMapScene(state, nav, { showAirways, vnav })
  }, [state, nav, adapter, showAirways])

  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: [127.5, 36.5],
      zoom: 5,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      // Dev builds keep the drawing buffer so the map can be captured in automated UI checks.
      canvasContextAttributes: { preserveDrawingBuffer: import.meta.env.DEV },
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addImage('aircraft', aircraftImage())
      setLoaded(true)
    })
    const select = (e: maplibregl.MapLayerMouseEvent) => {
      const legId = e.features?.[0]?.properties?.legId as string | undefined
      if (legId) selectRef.current?.(legId)
    }
    for (const layer of ['pt-waypoints', 'pt-airports', 'pt-labels']) {
      map.on('click', layer, select)
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __aerofmsMap?: MlMap }).__aerofmsMap = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(container.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Online basemap (optional).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const has = !!map.getSource('osm')
    if (basemap && navigator.onLine && !has) {
      map.addSource('osm', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 12,
      })
      map.addLayer({ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.35, 'raster-saturation': -0.8 } }, 'airways')
    } else if (!basemap && has) {
      map.removeLayer('osm')
      map.removeSource('osm')
    }
  }, [basemap, loaded])

  // Data updates.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const gj = sceneToGeoJson(scene)
    ;(map.getSource('lines') as GeoJSONSource | undefined)?.setData(gj.lines)
    ;(map.getSource('points') as GeoJSONSource | undefined)?.setData(gj.points)
    const key = `${state.session.sessionId}:${displayedPlan(state).origin}:${displayedPlan(state).destination}`
    if (scene.bounds && fittedFor.current !== key) {
      fittedFor.current = key
      map.fitBounds(scene.bounds, { padding: 48, maxZoom: 9, duration: 0 })
    }
    if (follow && state.position.aircraft) map.easeTo({ center: [state.position.aircraft.lon, state.position.aircraft.lat], duration: 400 })
  }, [scene, loaded, follow, state])

  // Centre on a leg highlighted from the FMC.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const id = state.navigation.highlightedLegId
    const p = scene.points.find((x) => x.legId === id)
    if (p && !follow) map.easeTo({ center: p.coordinate, duration: 300 })
  }, [state.navigation.highlightedLegId, loaded, scene, follow])

  return (
    <div className={`relative h-full min-h-64 w-full overflow-hidden rounded-lg border border-line ${className}`}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} role="application" aria-label={t('map.title')} />
      <div className="absolute left-2 top-2 flex flex-col gap-1.5">
        <button
          type="button"
          className="h-9 rounded-md border border-line bg-bg-elevated/90 px-3 text-xs hover:border-accent"
          onClick={() => scene.bounds && mapRef.current?.fitBounds(scene.bounds, { padding: 48, maxZoom: 9 })}
        >
          {t('map.fit')}
        </button>
        {state.position.aircraft && (
          <button
            type="button"
            aria-pressed={follow}
            className={`h-9 rounded-md border px-3 text-xs ${follow ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-bg-elevated/90'}`}
            onClick={() => setFollow(!follow)}
          >
            {t('map.follow')}
          </button>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded bg-bg-elevated/85 px-2 py-1 text-[10px] text-fg-muted">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-cdu-magenta align-middle" />{t('map.legendActive')}</span>
        <span><span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-cdu-white align-middle" />{t('map.legendMod')}</span>
        <span><span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-cdu-cyan align-middle" />{t('map.legendMissed')}</span>
      </div>
      {scene.points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-fg-muted">{t('map.noRoute')}</div>
      )}
    </div>
  )
}
