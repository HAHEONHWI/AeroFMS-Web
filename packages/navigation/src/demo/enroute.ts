import type { Airway, Navaid, Waypoint } from '@aerofms/shared'
import { fix } from './builders'

/**
 * Demo enroute fixes/navaids/airways for the Korea–Japan training area.
 * Positions are simplified for training and do not match any published chart.
 */
export const DEMO_ENROUTE_FIXES: Waypoint[] = [
  // Seoul TMA
  fix('BULTI', 37.38, 126.82, 'RK', -8.6),
  fix('NODLI', 37.24, 126.93, 'RK', -8.5),
  fix('SIHWA', 37.33, 126.68, 'RK', -8.6),
  fix('ANYAN', 37.38, 126.97, 'RK', -8.5),
  fix('NOLDA', 37.6, 126.62, 'RK', -8.6),
  fix('GUKDO', 37.02, 126.42, 'RK', -8.4),
  // Southbound (Y722)
  fix('SOSDO', 36.72, 127.4, 'RK', -8.3),
  fix('MAKET', 36.3, 127.83, 'RK', -8.2),
  fix('TOPAX', 35.92, 128.22, 'RK', -8.1),
  fix('KALOD', 35.52, 128.62, 'RK', -8.0),
  // Jeju (Y781)
  fix('GOMAD', 36.6, 126.9, 'RK', -8.2),
  fix('KABAM', 36.05, 126.75, 'RK', -8.0),
  fix('SOPNI', 35.45, 126.62, 'RK', -7.9),
  fix('PONSO', 34.75, 126.5, 'RK', -7.7),
  // Korea–Japan (G597 / Y20)
  fix('ANDOL', 35.5, 129.55, 'RK', -8.0),
  fix('LANAT', 34.95, 130.45, 'RJ', -7.8),
  fix('GOKUR', 34.45, 131.8, 'RJ', -7.7),
  fix('MIHOU', 34.2, 133.3, 'RJ', -7.6),
  fix('SHTLE', 34.3, 134.9, 'RJ', -7.6),
  fix('TAITO', 34.55, 136.6, 'RJ', -7.5),
  fix('OSHMA', 34.75, 138.1, 'RJ', -7.5),
  fix('CREAM', 35.1, 139.2, 'RJ', -7.5),
  // Busan → Jeju (Y683)
  fix('DOSAN', 34.8, 128.3, 'RK', -7.9),
  fix('SAMDO', 34.2, 127.4, 'RK', -7.7),
]

export const DEMO_NAVAIDS: Navaid[] = [
  { ident: 'OSN', name: 'OSAN', lat: 37.0956, lon: 127.0311, type: 'VORDME', frequency: 113.6, region: 'RK', magVar: -8.4, rangeNm: 130 },
  { ident: 'SEL', name: 'SEOUL', lat: 37.4136, lon: 126.9283, type: 'VORDME', frequency: 116.9, region: 'RK', magVar: -8.5, rangeNm: 130 },
  { ident: 'TGU', name: 'DAEGU', lat: 35.895, lon: 128.66, type: 'VORDME', frequency: 115.5, region: 'RK', magVar: -8.1, rangeNm: 130 },
  { ident: 'KMH', name: 'GIMHAE', lat: 35.17, lon: 128.93, type: 'VORDME', frequency: 112.5, region: 'RK', magVar: -8.0, rangeNm: 130 },
  { ident: 'CJU', name: 'JEJU', lat: 33.513, lon: 126.472, type: 'VORDME', frequency: 117.4, region: 'RK', magVar: -7.5, rangeNm: 130 },
  { ident: 'KWA', name: 'GWANGJU', lat: 35.13, lon: 126.8, type: 'VORDME', frequency: 113.2, region: 'RK', magVar: -7.9, rangeNm: 130 },
  { ident: 'HND', name: 'HANEDA', lat: 35.545, lon: 139.77, type: 'VORDME', frequency: 112.2, region: 'RJ', magVar: -7.6, rangeNm: 130 },
  { ident: 'KEC', name: 'KUSHIMOTO', lat: 33.4486, lon: 135.7944, type: 'VORDME', frequency: 116.6, region: 'RJ', magVar: -7.6, rangeNm: 200 },
  { ident: 'SI', name: 'INCHEON NDB', lat: 37.4, lon: 126.38, type: 'NDB', frequency: 342, region: 'RK', magVar: -8.6, rangeNm: 50 },
  { ident: 'PK', name: 'GIMHAE NDB', lat: 35.1, lon: 128.94, type: 'NDB', frequency: 386, region: 'RK', magVar: -8.0, rangeNm: 50 },
]

const awFix = (ident: string, minAltitudeFt?: number): { ident: string; minAltitudeFt?: number } => ({ ident, minAltitudeFt })

/** Airway definitions by identifier; coordinates are resolved from the fix list at build time. */
export const DEMO_AIRWAY_DEFS: Array<{ name: string; fixes: Array<{ ident: string; minAltitudeFt?: number }> }> = [
  { name: 'Y711', fixes: [awFix('BULTI'), awFix('NODLI', 6000), awFix('OSN', 6000)] },
  { name: 'Y722', fixes: [awFix('OSN'), awFix('SOSDO', 8000), awFix('MAKET', 9000), awFix('TOPAX', 9000), awFix('KALOD', 8000)] },
  { name: 'Y781', fixes: [awFix('OSN'), awFix('GOMAD', 6000), awFix('KABAM', 6000), awFix('SOPNI', 7000), awFix('PONSO', 7000)] },
  { name: 'G597', fixes: [awFix('TOPAX'), awFix('ANDOL', 9000), awFix('LANAT', 9000), awFix('GOKUR', 10000), awFix('MIHOU', 10000)] },
  { name: 'Y20', fixes: [awFix('MIHOU'), awFix('SHTLE', 11000), awFix('TAITO', 11000), awFix('OSHMA', 11000), awFix('CREAM', 9000)] },
  { name: 'A586', fixes: [awFix('SEL'), awFix('ANYAN', 6000), awFix('OSN', 6000), awFix('TGU', 9000), awFix('KMH', 8000)] },
  { name: 'Y683', fixes: [awFix('KMH'), awFix('DOSAN', 7000), awFix('SAMDO', 7000), awFix('CJU', 6000)] },
]

export function resolveAirways(fixes: Waypoint[]): Airway[] {
  const byIdent = new Map(fixes.map((f) => [f.ident, f]))
  return DEMO_AIRWAY_DEFS.map((def) => ({
    name: def.name,
    fixes: def.fixes.map((f) => {
      const w = byIdent.get(f.ident)
      if (!w) throw new Error(`Airway ${def.name}: unknown fix ${f.ident}`)
      return { ident: w.ident, lat: w.lat, lon: w.lon, type: w.type, minAltitudeFt: f.minAltitudeFt }
    }),
  }))
}
