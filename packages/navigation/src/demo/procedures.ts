import type { Airport, AltitudeConstraint, Procedure, ProcedureLeg, ProcedureTransition, SpeedConstraint, Waypoint } from '@aerofms/shared'
import { normalizeHeading } from '@aerofms/shared'
import { departureFix, finalFix, fix } from './builders'

/**
 * Simplified demo procedures. Names follow the usual naming pattern so that training
 * feels familiar, but the paths are synthetic and do not reproduce published charts.
 */

const at = (altitudeFt: number): AltitudeConstraint => ({ type: 'AT', altitudeFt })
const above = (altitudeFt: number): AltitudeConstraint => ({ type: 'AT_OR_ABOVE', altitudeFt })
const below = (altitudeFt: number): AltitudeConstraint => ({ type: 'AT_OR_BELOW', altitudeFt })
const between = (lowFt: number, highFt: number): AltitudeConstraint => ({ type: 'BETWEEN', altitudeFt: highFt, altitude2Ft: lowFt })
const maxSpd = (speedKt: number): SpeedConstraint => ({ type: 'AT_OR_BELOW', speedKt })

const tf = (f: string, altitude?: AltitudeConstraint, speed?: SpeedConstraint): ProcedureLeg => ({
  fix: f,
  pathTerminator: 'TF',
  altitude,
  speed,
})
const iF = (f: string, altitude?: AltitudeConstraint, speed?: SpeedConstraint): ProcedureLeg => ({
  fix: f,
  pathTerminator: 'IF',
  altitude,
  speed,
})
const va = (courseMag: number, altitudeFt: number): ProcedureLeg => ({
  fix: '',
  pathTerminator: 'VA',
  courseMag,
  altitude: above(altitudeFt),
})

interface Builder {
  procedures: Procedure[]
  fixes: Waypoint[]
}

function sid(b: Builder, ap: Airport, name: string, runways: string[], legs: ProcedureLeg[], transitions: ProcedureTransition[] = []): void {
  b.procedures.push({ id: `${ap.icao}-SID-${name}`, airport: ap.icao, type: 'SID', name, runways, commonLegs: legs, transitions })
}

function star(b: Builder, ap: Airport, name: string, runways: string[], legs: ProcedureLeg[], transitions: ProcedureTransition[] = []): void {
  b.procedures.push({ id: `${ap.icao}-STAR-${name}`, airport: ap.icao, type: 'STAR', name, runways, commonLegs: legs, transitions })
}

interface IlsSpec {
  runway: string
  ifName: string
  fafName: string
  /** Approach transitions: name → fix list (first fix is the IAF). */
  transitions: Array<{ name: string; fixes: string[]; altitudeFt: number }>
  missedHoldFix: string
  missedAltitudeFt: number
}

function ils(b: Builder, ap: Airport, spec: IlsSpec): void {
  const rwy = ap.runways.find((r) => r.ident === spec.runway)
  if (!rwy) throw new Error(`ils: ${ap.icao} runway ${spec.runway} missing`)
  b.fixes.push(finalFix(ap, spec.runway, spec.ifName, 11), finalFix(ap, spec.runway, spec.fafName, 6))
  const fafAlt = Math.round((ap.elevationFt + 6 * 318) / 100) * 100
  const ifAlt = Math.round((ap.elevationFt + 11 * 318) / 100) * 100 + 300
  const name = `ILS${spec.runway}`
  b.procedures.push({
    id: `${ap.icao}-APP-${name}`,
    airport: ap.icao,
    type: 'APPROACH',
    name,
    approachType: 'ILS',
    runways: [spec.runway],
    transitions: spec.transitions.map((t) => ({
      name: t.name,
      legs: t.fixes.map((f, i) => (i === 0 ? iF(f, above(t.altitudeFt)) : tf(f, above(t.altitudeFt)))),
    })),
    commonLegs: [
      tf(spec.ifName, at(ifAlt), maxSpd(210)),
      tf(spec.fafName, at(fafAlt), maxSpd(180)),
      { fix: `RW${spec.runway}`, pathTerminator: 'TF', altitude: at(ap.elevationFt + 50) },
    ],
    missedApproachLegs: [
      va(rwy.headingMag, ap.elevationFt + 1500),
      { fix: spec.missedHoldFix, pathTerminator: 'DF', altitude: at(spec.missedAltitudeFt) },
      {
        fix: spec.missedHoldFix,
        pathTerminator: 'HM',
        altitude: at(spec.missedAltitudeFt),
        hold: { inboundCourseMag: normalizeHeading(rwy.headingMag), turn: 'R', legTimeMin: 1 },
      },
    ],
  })
}

export function buildDemoProcedures(airports: Airport[]): Builder {
  const b: Builder = { procedures: [], fixes: [] }
  const ap = (icao: string): Airport => {
    const a = airports.find((x) => x.icao === icao)
    if (!a) throw new Error(`Airport ${icao} missing`)
    return a
  }

  // ───────────── RKSI Incheon ─────────────
  const rksi = ap('RKSI')
  b.fixes.push(departureFix(rksi, '33L', 'SIDOK', 5), departureFix(rksi, '15R', 'SOKKO', 6))
  sid(b, rksi, 'BULTI1J', ['33L', '33R', '34L', '34R'], [va(333, 1600), tf('SIDOK', above(4000), maxSpd(230)), tf('NOLDA', above(6000)), tf('BULTI', above(7000))], [
    { name: 'OSN', legs: [tf('NODLI', above(9000)), tf('OSN', above(11000))] },
  ])
  sid(b, rksi, 'BULTI1K', ['15L', '15R', '16L', '16R'], [va(153, 1600), tf('SOKKO', above(4000), maxSpd(230)), tf('BULTI', above(7000))], [
    { name: 'OSN', legs: [tf('NODLI', above(9000)), tf('OSN', above(11000))] },
  ])
  sid(b, rksi, 'GUKDO1J', ['33L', '33R', '34L', '34R'], [va(333, 1600), tf('SIDOK', above(4000), maxSpd(230)), tf('GUKDO', above(8000))])
  sid(b, rksi, 'GUKDO1K', ['15L', '15R', '16L', '16R'], [va(153, 1600), tf('SOKKO', above(4000), maxSpd(230)), tf('GUKDO', above(8000))])
  star(b, rksi, 'BULTI1N', ['33L', '33R', '34L', '34R'], [iF('BULTI', between(8000, 11000), maxSpd(250)), tf('SIHWA', at(6000), maxSpd(220))], [
    { name: 'OSN', legs: [iF('OSN', below(15000)), tf('NODLI', above(10000))] },
  ])
  star(b, rksi, 'BULTI1S', ['15L', '15R', '16L', '16R'], [iF('BULTI', between(8000, 11000), maxSpd(250)), tf('NOLDA', at(6000), maxSpd(220))], [
    { name: 'OSN', legs: [iF('OSN', below(15000)), tf('NODLI', above(10000))] },
  ])
  ils(b, rksi, { runway: '33L', ifName: 'KIMRI', fafName: 'SINDO', transitions: [{ name: 'SIHWA', fixes: ['SIHWA'], altitudeFt: 5000 }], missedHoldFix: 'SIDOK', missedAltitudeFt: 5000 })
  ils(b, rksi, { runway: '33R', ifName: 'YONGU', fafName: 'MUIDO', transitions: [{ name: 'SIHWA', fixes: ['SIHWA'], altitudeFt: 5000 }], missedHoldFix: 'SIDOK', missedAltitudeFt: 5000 })
  ils(b, rksi, { runway: '15L', ifName: 'GANGH', fafName: 'SEOMO', transitions: [{ name: 'NOLDA', fixes: ['NOLDA'], altitudeFt: 5000 }], missedHoldFix: 'SOKKO', missedAltitudeFt: 5000 })
  ils(b, rksi, { runway: '15R', ifName: 'GYODO', fafName: 'BUKDO', transitions: [{ name: 'NOLDA', fixes: ['NOLDA'], altitudeFt: 5000 }], missedHoldFix: 'SOKKO', missedAltitudeFt: 5000 })

  // ───────────── RKSS Gimpo ─────────────
  const rkss = ap('RKSS')
  b.fixes.push(departureFix(rkss, '32R', 'HANGA', 4), departureFix(rkss, '14L', 'MAGOK', 5))
  sid(b, rkss, 'OSN1E', ['32L', '32R'], [va(321, 1500), tf('HANGA', above(3000), maxSpd(230)), tf('SIHWA', above(5000)), tf('NODLI', above(6000)), tf('OSN', above(8000))])
  sid(b, rkss, 'OSN1F', ['14L', '14R'], [va(141, 1500), tf('MAGOK', above(4000), maxSpd(230)), tf('OSN', above(8000))])
  sid(b, rkss, 'GOMAD1E', ['32L', '32R'], [va(321, 1500), tf('HANGA', above(3000), maxSpd(230)), tf('SIHWA', above(5000)), tf('GOMAD', above(9000))])
  sid(b, rkss, 'GOMAD1F', ['14L', '14R'], [va(141, 1500), tf('MAGOK', above(4000), maxSpd(230)), tf('GOMAD', above(9000))])
  star(b, rkss, 'OSN1A', ['32L', '32R'], [iF('OSN', between(9000, 13000), maxSpd(250)), tf('ANYAN', at(7000), maxSpd(220))], [
    { name: 'SOSDO', legs: [iF('SOSDO', below(17000))] },
  ])
  star(b, rkss, 'OSN1B', ['14L', '14R'], [iF('OSN', between(9000, 13000), maxSpd(250)), tf('SIHWA', above(7000)), tf('NOLDA', at(6000), maxSpd(220))], [
    { name: 'SOSDO', legs: [iF('SOSDO', below(17000))] },
  ])
  ils(b, rkss, { runway: '32R', ifName: 'GURON', fafName: 'YEOUI', transitions: [{ name: 'ANYAN', fixes: ['ANYAN'], altitudeFt: 5000 }], missedHoldFix: 'HANGA', missedAltitudeFt: 5000 })
  ils(b, rkss, { runway: '32L', ifName: 'SINRI', fafName: 'MOKDO', transitions: [{ name: 'ANYAN', fixes: ['ANYAN'], altitudeFt: 5000 }], missedHoldFix: 'HANGA', missedAltitudeFt: 5000 })
  ils(b, rkss, { runway: '14L', ifName: 'GIMPA', fafName: 'GOCHO', transitions: [{ name: 'NOLDA', fixes: ['NOLDA'], altitudeFt: 5000 }], missedHoldFix: 'MAGOK', missedAltitudeFt: 5000 })
  ils(b, rkss, { runway: '14R', ifName: 'PUNGU', fafName: 'HAJEO', transitions: [{ name: 'NOLDA', fixes: ['NOLDA'], altitudeFt: 5000 }], missedHoldFix: 'MAGOK', missedAltitudeFt: 5000 })

  // ───────────── RKPK Gimhae ─────────────
  const rkpk = ap('RKPK')
  b.fixes.push(
    fix('GUMDO', 35.2, 128.55, 'RK', -8.0),
    fix('DOTOL', 34.95, 128.8, 'RK', -8.0),
    fix('GADUK', 35.45, 128.85, 'RK', -8.0),
  )
  sid(b, rkpk, 'TOPAX1D', ['36L', '36R'], [va(357, 1500), tf('GADUK', above(5000), maxSpd(230)), tf('TOPAX', above(10000))])
  sid(b, rkpk, 'TOPAX1E', ['18L', '18R'], [va(177, 1500), tf('GUMDO', above(5000), maxSpd(230)), tf('KALOD', above(8000)), tf('TOPAX', above(10000))])
  sid(b, rkpk, 'ANDOL1D', ['36L', '36R'], [va(357, 1500), tf('GADUK', above(5000), maxSpd(230)), tf('ANDOL', above(9000))])
  sid(b, rkpk, 'DOSAN1E', ['18L', '18R', '36L', '36R'], [va(177, 1500), tf('DOTOL', above(5000), maxSpd(230)), tf('DOSAN', above(7000))])
  star(b, rkpk, 'KALOD1A', ['36L', '36R'], [iF('KALOD', between(9000, 13000), maxSpd(250)), tf('GUMDO', above(5000)), tf('DOTOL', at(4000), maxSpd(210))], [
    { name: 'TOPAX', legs: [iF('TOPAX', below(17000))] },
  ])
  star(b, rkpk, 'KALOD1B', ['18L', '18R'], [iF('KALOD', between(9000, 13000), maxSpd(250)), tf('GADUK', at(5000), maxSpd(210))], [
    { name: 'TOPAX', legs: [iF('TOPAX', below(17000))] },
  ])
  ils(b, rkpk, { runway: '36L', ifName: 'TOSAN', fafName: 'EBSAN', transitions: [{ name: 'DOTOL', fixes: ['DOTOL'], altitudeFt: 4000 }], missedHoldFix: 'DOTOL', missedAltitudeFt: 4000 })
  ils(b, rkpk, { runway: '36R', ifName: 'GABIN', fafName: 'DEMLO', transitions: [{ name: 'DOTOL', fixes: ['DOTOL'], altitudeFt: 4000 }], missedHoldFix: 'DOTOL', missedAltitudeFt: 4000 })
  ils(b, rkpk, { runway: '18R', ifName: 'NAKDO', fafName: 'SUYEO', transitions: [{ name: 'GADUK', fixes: ['GADUK'], altitudeFt: 5000 }], missedHoldFix: 'GUMDO', missedAltitudeFt: 5000 })
  ils(b, rkpk, { runway: '18L', ifName: 'HAEUN', fafName: 'KUMJE', transitions: [{ name: 'GADUK', fixes: ['GADUK'], altitudeFt: 5000 }], missedHoldFix: 'GUMDO', missedAltitudeFt: 5000 })

  // ───────────── RKPC Jeju ─────────────
  const rkpc = ap('RKPC')
  b.fixes.push(
    fix('JUKDO', 33.85, 126.05, 'RK', -7.5),
    fix('SEOGU', 33.9, 126.95, 'RK', -7.5),
    departureFix(rkpc, '07', 'BIYAN', 6),
    departureFix(rkpc, '25', 'HALLA', 5, 30),
  )
  sid(b, rkpc, 'PONSO1C', ['07'], [va(67, 1500), tf('BIYAN', above(4000), maxSpd(230)), tf('PONSO', above(9000))])
  sid(b, rkpc, 'PONSO1D', ['25'], [va(247, 1500), tf('HALLA', above(4000), maxSpd(230)), tf('PONSO', above(9000))])
  sid(b, rkpc, 'SAMDO1C', ['07'], [va(67, 1500), tf('BIYAN', above(4000), maxSpd(230)), tf('SAMDO', above(8000))])
  star(b, rkpc, 'PONSO1A', ['07'], [iF('PONSO', between(8000, 12000), maxSpd(250)), tf('JUKDO', at(5000), maxSpd(220))])
  star(b, rkpc, 'PONSO1B', ['25'], [iF('PONSO', between(8000, 12000), maxSpd(250)), tf('SEOGU', at(5000), maxSpd(220))])
  star(b, rkpc, 'SAMDO1A', ['25'], [iF('SAMDO', between(8000, 12000), maxSpd(250)), tf('SEOGU', at(5000), maxSpd(220))])
  star(b, rkpc, 'SAMDO1B', ['07'], [iF('SAMDO', between(8000, 12000), maxSpd(250)), tf('PONSO', above(6000)), tf('JUKDO', at(5000), maxSpd(220))])
  ils(b, rkpc, { runway: '07', ifName: 'HYEOP', fafName: 'AEWOL', transitions: [{ name: 'JUKDO', fixes: ['JUKDO'], altitudeFt: 5000 }], missedHoldFix: 'BIYAN', missedAltitudeFt: 5000 })
  ils(b, rkpc, { runway: '25', ifName: 'JOCHN', fafName: 'SAMYA', transitions: [{ name: 'SEOGU', fixes: ['SEOGU'], altitudeFt: 5000 }], missedHoldFix: 'HALLA', missedAltitudeFt: 5000 })

  // ───────────── RJTT Haneda ─────────────
  const rjtt = ap('RJTT')
  b.fixes.push(
    fix('UMUKI', 35.25, 139.7, 'RJ', -7.6),
    fix('AKSEL', 35.85, 139.55, 'RJ', -7.6),
    departureFix(rjtt, '05', 'TOKBA', 5, 20),
  )
  sid(b, rjtt, 'OSHMA1', ['05', '34R'], [va(50, 1500), tf('TOKBA', above(4000), maxSpd(230)), tf('OSHMA', above(13000))])
  star(b, rjtt, 'CREAM1A', ['34L', '34R'], [iF('CREAM', between(9000, 13000), maxSpd(250)), tf('UMUKI', at(6000), maxSpd(220))], [
    { name: 'OSHMA', legs: [iF('OSHMA', below(19000))] },
  ])
  star(b, rjtt, 'CREAM1B', ['16L', '16R'], [iF('CREAM', between(9000, 13000), maxSpd(250)), tf('AKSEL', at(6000), maxSpd(220))], [
    { name: 'OSHMA', legs: [iF('OSHMA', below(19000))] },
  ])
  ils(b, rjtt, { runway: '34L', ifName: 'KAIRU', fafName: 'TOMEI', transitions: [{ name: 'UMUKI', fixes: ['UMUKI'], altitudeFt: 5000 }], missedHoldFix: 'UMUKI', missedAltitudeFt: 5000 })
  ils(b, rjtt, { runway: '34R', ifName: 'SEKIA', fafName: 'DAIBA', transitions: [{ name: 'UMUKI', fixes: ['UMUKI'], altitudeFt: 5000 }], missedHoldFix: 'UMUKI', missedAltitudeFt: 5000 })
  ils(b, rjtt, { runway: '16L', ifName: 'ARAKA', fafName: 'SUMID', transitions: [{ name: 'AKSEL', fixes: ['AKSEL'], altitudeFt: 5000 }], missedHoldFix: 'AKSEL', missedAltitudeFt: 5000 })
  ils(b, rjtt, { runway: '16R', ifName: 'KIBAN', fafName: 'EDOGA', transitions: [{ name: 'AKSEL', fixes: ['AKSEL'], altitudeFt: 5000 }], missedHoldFix: 'AKSEL', missedAltitudeFt: 5000 })

  return b
}
