import type { FlightPlan, FlightPlanLeg } from '@aerofms/shared'

/** Legs that describe the flown path (missed approach and runway pseudo-legs excluded). */
export function routeLegs(plan: FlightPlan): FlightPlanLeg[] {
  return plan.elements.filter((e): e is FlightPlanLeg => e.kind === 'LEG' && !e.missed && e.segment !== 'MISSED' && e.waypoint.type !== 'RUNWAY')
}

const safeIdent = (s: string): string => s.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'WPT'

/** X-Plane 11/12 flight plan (FMS v1100). */
export function toXPlaneFms(plan: FlightPlan): string {
  const legs = routeLegs(plan)
  const lines = ['I', '1100 Version', 'CYCLE 2501']
  if (plan.origin) lines.push(`ADEP ${plan.origin}`)
  if (plan.departureRunway) lines.push(`DEPRWY RW${plan.departureRunway.replace(/^RW/, '')}`)
  if (plan.destination) lines.push(`ADES ${plan.destination}`)
  if (plan.arrivalRunway) lines.push(`DESRWY RW${plan.arrivalRunway.replace(/^RW/, '')}`)
  const entries = legs.map((l, i) => {
    const w = l.waypoint
    const first = i === 0 && w.type === 'AIRPORT'
    const last = i === legs.length - 1 && w.type === 'AIRPORT'
    const type = w.type === 'AIRPORT' ? 1 : w.type === 'NDB' ? 2 : w.type === 'VOR' || w.type === 'VORDME' || w.type === 'DME' ? 3 : w.type === 'FIX' ? 11 : 28
    const via = first ? 'ADEP' : last ? 'ADES' : l.via && /^[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(l.via) && l.segment === 'ENROUTE' ? l.via : 'DRCT'
    const alt = l.altitudeConstraint ? Math.round(l.altitudeConstraint.altitudeFt) : 0
    return `${type} ${type === 28 ? `+${w.lat.toFixed(3)}_${w.lon.toFixed(3)}` : safeIdent(w.ident)} ${via} ${alt.toFixed(6)} ${w.lat.toFixed(6)} ${w.lon.toFixed(6)}`
  })
  lines.push(`NUMENR ${entries.length}`, ...entries)
  return `${lines.join('\n')}\n`
}

function dms(value: number, pos: string, neg: string): string {
  const hemi = value >= 0 ? pos : neg
  const a = Math.abs(value)
  const d = Math.floor(a)
  const mFloat = (a - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  return `${hemi}${d}° ${m}' ${s.toFixed(2)}"`
}

export function formatLla(lat: number, lon: number, altFt = 0): string {
  const alt = `${altFt >= 0 ? '+' : '-'}${Math.abs(altFt).toFixed(2).padStart(9, '0')}`
  return `${dms(lat, 'N', 'S')},${dms(lon, 'E', 'W')},${alt}`
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Microsoft Flight Simulator flight plan (.PLN, AceXML). */
export function toMsfsPln(plan: FlightPlan): string {
  const legs = routeLegs(plan)
  const first = legs[0]
  const last = legs[legs.length - 1]
  const dep = plan.origin ?? first?.waypoint.ident ?? 'DEP'
  const arr = plan.destination ?? last?.waypoint.ident ?? 'ARR'
  const cruise = plan.cruiseAltitudeFt ?? 35000
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<SimBase.Document Type="AceXML" version="1,0">',
    '  <Descr>AceXML Document</Descr>',
    '  <FlightPlan.FlightPlan>',
    `    <Title>${xml(dep)} to ${xml(arr)}</Title>`,
    '    <FPType>IFR</FPType>',
    `    <RouteType>${cruise >= 18000 ? 'HighAlt' : 'LowAlt'}</RouteType>`,
    `    <CruisingAlt>${Math.round(cruise)}</CruisingAlt>`,
    `    <DepartureID>${xml(dep)}</DepartureID>`,
  ]
  if (first) out.push(`    <DepartureLLA>${formatLla(first.waypoint.lat, first.waypoint.lon)}</DepartureLLA>`)
  out.push(`    <DestinationID>${xml(arr)}</DestinationID>`)
  if (last) out.push(`    <DestinationLLA>${formatLla(last.waypoint.lat, last.waypoint.lon)}</DestinationLLA>`)
  out.push(`    <Descr>${xml(dep)}, ${xml(arr)}</Descr>`)
  if (plan.departureRunway) out.push(`    <DeparturePosition>${xml(plan.departureRunway.replace(/^RW/, ''))}</DeparturePosition>`)
  out.push(`    <DepartureName>${xml(dep)}</DepartureName>`, `    <DestinationName>${xml(arr)}</DestinationName>`)
  out.push('    <AppVersion>', '      <AppVersionMajor>11</AppVersionMajor>', '      <AppVersionBuild>282174</AppVersionBuild>', '    </AppVersion>')
  for (const l of legs) {
    const w = l.waypoint
    const type = w.type === 'AIRPORT' ? 'Airport' : w.type === 'NDB' ? 'NDB' : w.type === 'VOR' || w.type === 'VORDME' || w.type === 'DME' ? 'VOR' : w.type === 'FIX' ? 'Intersection' : 'User'
    const ident = type === 'User' ? safeIdent(w.ident) : w.ident
    out.push(`    <ATCWaypoint id="${xml(ident)}">`, `      <ATCWaypointType>${type}</ATCWaypointType>`, `      <WorldPosition>${formatLla(w.lat, w.lon, l.altitudeConstraint?.altitudeFt ?? 0)}</WorldPosition>`)
    if (l.via && l.segment === 'ENROUTE' && l.via !== 'DIRECT' && l.via !== 'DCT') out.push(`      <ATCAirway>${xml(l.via)}</ATCAirway>`)
    if (type !== 'User') {
      out.push('      <ICAO>')
      if (w.region) out.push(`        <ICAORegion>${xml(w.region)}</ICAORegion>`)
      out.push(`        <ICAOIdent>${xml(w.ident)}</ICAOIdent>`, '      </ICAO>')
    }
    out.push('    </ATCWaypoint>')
  }
  out.push('  </FlightPlan.FlightPlan>', '</SimBase.Document>')
  return `${out.join('\n')}\n`
}
