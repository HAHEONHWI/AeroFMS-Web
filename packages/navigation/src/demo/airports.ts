import type { Airport } from '@aerofms/shared'
import { buildAirport } from './builders'

/**
 * Demo airport set. Reference points are approximate public coordinates, runway geometry is
 * simplified (synthesised from heading/length). NOT suitable for real-world navigation.
 */
export const DEMO_AIRPORTS: Airport[] = [
  buildAirport({
    icao: 'RKSI', iata: 'ICN', name: 'Incheon International', nameKo: '인천국제공항', city: 'Seoul', country: 'KR',
    lat: 37.4602, lon: 126.4407, elevationFt: 23, magVar: -8.6, transitionAltitudeFt: 14000, transitionLevelFt: 15000,
    runways: [
      { a: '15L', b: '33R', headingMagA: 153, lengthFt: 12303, lateralNm: 0.55, ilsA: 110.3, ilsB: 111.5 },
      { a: '15R', b: '33L', headingMagA: 153, lengthFt: 12303, lateralNm: 0.3, ilsA: 110.1, ilsB: 110.9 },
      { a: '16L', b: '34R', headingMagA: 153, lengthFt: 13123, lateralNm: -0.6, alongNm: 0.4, ilsA: 108.5, ilsB: 109.9 },
      { a: '16R', b: '34L', headingMagA: 153, lengthFt: 12303, lateralNm: -0.85, alongNm: 0.4, ilsA: 108.9, ilsB: 109.5 },
    ],
  }),
  buildAirport({
    icao: 'RKSS', iata: 'GMP', name: 'Gimpo International', nameKo: '김포국제공항', city: 'Seoul', country: 'KR',
    lat: 37.5583, lon: 126.7906, elevationFt: 59, magVar: -8.5, transitionAltitudeFt: 14000, transitionLevelFt: 15000,
    runways: [
      { a: '14L', b: '32R', headingMagA: 141, lengthFt: 11811, lateralNm: 0.15, ilsA: 110.7, ilsB: 108.7 },
      { a: '14R', b: '32L', headingMagA: 141, lengthFt: 10499, lateralNm: -0.15, ilsA: 109.3, ilsB: 110.5 },
    ],
  }),
  buildAirport({
    icao: 'RKPK', iata: 'PUS', name: 'Gimhae International', nameKo: '김해국제공항', city: 'Busan', country: 'KR',
    lat: 35.1795, lon: 128.9382, elevationFt: 6, magVar: -8.0, transitionAltitudeFt: 14000, transitionLevelFt: 15000,
    runways: [
      { a: '18L', b: '36R', headingMagA: 177, lengthFt: 8999, lateralNm: 0.12, ilsA: 108.1, ilsB: 109.1 },
      { a: '18R', b: '36L', headingMagA: 177, lengthFt: 10499, lateralNm: -0.12, ilsA: 110.9, ilsB: 110.3 },
    ],
  }),
  buildAirport({
    icao: 'RKPC', iata: 'CJU', name: 'Jeju International', nameKo: '제주국제공항', city: 'Jeju', country: 'KR',
    lat: 33.5113, lon: 126.493, elevationFt: 118, magVar: -7.5, transitionAltitudeFt: 14000, transitionLevelFt: 15000,
    runways: [
      { a: '07', b: '25', headingMagA: 67, lengthFt: 10489, ilsA: 110.7, ilsB: 109.7 },
      { a: '13', b: '31', headingMagA: 128, lengthFt: 6234, lateralNm: 0.3, alongNm: 0.2 },
    ],
  }),
  buildAirport({
    icao: 'RKTU', iata: 'CJJ', name: 'Cheongju International', nameKo: '청주국제공항', city: 'Cheongju', country: 'KR',
    lat: 36.7166, lon: 127.4991, elevationFt: 191, magVar: -8.3, transitionAltitudeFt: 14000,
    runways: [
      { a: '06L', b: '24R', headingMagA: 57, lengthFt: 9000, lateralNm: -0.12, ilsB: 110.1 },
      { a: '06R', b: '24L', headingMagA: 57, lengthFt: 9000, lateralNm: 0.12 },
    ],
  }),
  buildAirport({
    icao: 'RKTN', iata: 'TAE', name: 'Daegu International', nameKo: '대구국제공항', city: 'Daegu', country: 'KR',
    lat: 35.8941, lon: 128.6589, elevationFt: 116, magVar: -8.1, transitionAltitudeFt: 14000,
    runways: [
      { a: '13L', b: '31R', headingMagA: 126, lengthFt: 9039, lateralNm: -0.1, ilsB: 109.5 },
      { a: '13R', b: '31L', headingMagA: 126, lengthFt: 9000, lateralNm: 0.1 },
    ],
  }),
  buildAirport({
    icao: 'RKJJ', iata: 'KWJ', name: 'Gwangju', nameKo: '광주공항', city: 'Gwangju', country: 'KR',
    lat: 35.1264, lon: 126.8089, elevationFt: 39, magVar: -7.9, transitionAltitudeFt: 14000,
    runways: [{ a: '04L', b: '22R', headingMagA: 37, lengthFt: 9300, ilsB: 108.9 }],
  }),
  buildAirport({
    icao: 'RKPU', iata: 'USN', name: 'Ulsan', nameKo: '울산공항', city: 'Ulsan', country: 'KR',
    lat: 35.5935, lon: 129.3517, elevationFt: 45, magVar: -8.0, transitionAltitudeFt: 14000,
    runways: [{ a: '18', b: '36', headingMagA: 177, lengthFt: 6562 }],
  }),
  buildAirport({
    icao: 'RKNY', iata: 'YNY', name: 'Yangyang International', nameKo: '양양국제공항', city: 'Yangyang', country: 'KR',
    lat: 38.0613, lon: 128.6692, elevationFt: 241, magVar: -8.6, transitionAltitudeFt: 14000,
    runways: [{ a: '15', b: '33', headingMagA: 152, lengthFt: 8202, ilsB: 110.5 }],
  }),
  buildAirport({
    icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda', nameKo: '도쿄 하네다', city: 'Tokyo', country: 'JP',
    lat: 35.5523, lon: 139.7798, elevationFt: 35, magVar: -7.6, transitionAltitudeFt: 14000, transitionLevelFt: 14000,
    runways: [
      { a: '16R', b: '34L', headingMagA: 157, lengthFt: 9843, lateralNm: -0.35, ilsA: 111.7, ilsB: 110.1 },
      { a: '16L', b: '34R', headingMagA: 157, lengthFt: 11024, lateralNm: 0.55, alongNm: -0.3, ilsA: 109.1, ilsB: 111.9 },
      { a: '04', b: '22', headingMagA: 42, lengthFt: 8202, lateralNm: 0.4, alongNm: -1.0, ilsB: 111.3 },
      { a: '05', b: '23', headingMagA: 50, lengthFt: 8202, lateralNm: -0.8, alongNm: -1.3, ilsB: 109.5 },
    ],
  }),
  buildAirport({
    icao: 'RJAA', iata: 'NRT', name: 'Tokyo Narita', nameKo: '도쿄 나리타', city: 'Tokyo', country: 'JP',
    lat: 35.7647, lon: 140.3864, elevationFt: 141, magVar: -7.4, transitionAltitudeFt: 14000,
    runways: [
      { a: '16R', b: '34L', headingMagA: 157, lengthFt: 13123, lateralNm: -0.4, ilsA: 111.5, ilsB: 109.9 },
      { a: '16L', b: '34R', headingMagA: 157, lengthFt: 8202, lateralNm: 0.6, alongNm: 1.0, ilsA: 111.9, ilsB: 110.7 },
    ],
  }),
  buildAirport({
    icao: 'RJBB', iata: 'KIX', name: 'Osaka Kansai', nameKo: '오사카 간사이', city: 'Osaka', country: 'JP',
    lat: 34.4273, lon: 135.244, elevationFt: 26, magVar: -7.9, transitionAltitudeFt: 14000,
    runways: [
      { a: '06R', b: '24L', headingMagA: 57, lengthFt: 11483, lateralNm: -0.5, ilsA: 110.3, ilsB: 109.9 },
      { a: '06L', b: '24R', headingMagA: 57, lengthFt: 13123, lateralNm: 0.5, ilsA: 111.1, ilsB: 108.5 },
    ],
  }),
  buildAirport({
    icao: 'RJFF', iata: 'FUK', name: 'Fukuoka', nameKo: '후쿠오카', city: 'Fukuoka', country: 'JP',
    lat: 33.5859, lon: 130.4511, elevationFt: 32, magVar: -7.6, transitionAltitudeFt: 14000,
    runways: [{ a: '16', b: '34', headingMagA: 157, lengthFt: 9186, ilsA: 110.9, ilsB: 109.7 }],
  }),
  buildAirport({
    icao: 'RJCC', iata: 'CTS', name: 'New Chitose', nameKo: '신치토세', city: 'Sapporo', country: 'JP',
    lat: 42.7752, lon: 141.6923, elevationFt: 82, magVar: -9.3, transitionAltitudeFt: 14000,
    runways: [
      { a: '01L', b: '19R', headingMagA: 7, lengthFt: 9843, lateralNm: -0.1, ilsB: 110.5 },
      { a: '01R', b: '19L', headingMagA: 7, lengthFt: 9843, lateralNm: 0.1, ilsA: 111.5 },
    ],
  }),
  buildAirport({
    icao: 'RCTP', iata: 'TPE', name: 'Taiwan Taoyuan', nameKo: '타이베이 타오위안', city: 'Taipei', country: 'TW',
    lat: 25.0777, lon: 121.2328, elevationFt: 106, magVar: -4.6, transitionAltitudeFt: 11000,
    runways: [
      { a: '05L', b: '23R', headingMagA: 53, lengthFt: 12008, lateralNm: -0.4, ilsA: 109.7, ilsB: 110.1 },
      { a: '05R', b: '23L', headingMagA: 53, lengthFt: 10827, lateralNm: 0.4, ilsA: 111.5, ilsB: 108.9 },
    ],
  }),
  buildAirport({
    icao: 'ZSPD', iata: 'PVG', name: 'Shanghai Pudong', nameKo: '상하이 푸둥', city: 'Shanghai', country: 'CN',
    lat: 31.1434, lon: 121.8052, elevationFt: 13, magVar: -6.1, transitionAltitudeFt: 9800,
    runways: [
      { a: '17L', b: '35R', headingMagA: 172, lengthFt: 12467, lateralNm: -0.8, ilsA: 110.5, ilsB: 111.3 },
      { a: '16R', b: '34L', headingMagA: 172, lengthFt: 13123, lateralNm: 0.8, ilsA: 108.1, ilsB: 108.7 },
    ],
  }),
  buildAirport({
    icao: 'VHHH', iata: 'HKG', name: 'Hong Kong International', nameKo: '홍콩', city: 'Hong Kong', country: 'HK',
    lat: 22.308, lon: 113.9185, elevationFt: 28, magVar: -2.7, transitionAltitudeFt: 9000,
    runways: [
      { a: '07L', b: '25R', headingMagA: 73, lengthFt: 12467, lateralNm: -0.4, ilsA: 111.1, ilsB: 108.3 },
      { a: '07R', b: '25L', headingMagA: 73, lengthFt: 12467, lateralNm: 0.4, ilsA: 109.3, ilsB: 110.9 },
    ],
  }),
  buildAirport({
    icao: 'WSSS', iata: 'SIN', name: 'Singapore Changi', nameKo: '싱가포르 창이', city: 'Singapore', country: 'SG',
    lat: 1.3502, lon: 103.994, elevationFt: 22, magVar: 0.2, transitionAltitudeFt: 11000,
    runways: [
      { a: '02L', b: '20R', headingMagA: 23, lengthFt: 13123, lateralNm: -0.5, ilsA: 108.3, ilsB: 109.7 },
      { a: '02C', b: '20C', headingMagA: 23, lengthFt: 13123, lateralNm: 0.4, ilsA: 110.9, ilsB: 111.3 },
    ],
  }),
  buildAirport({
    icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', nameKo: '샌프란시스코', city: 'San Francisco', country: 'US',
    lat: 37.6188, lon: -122.375, elevationFt: 13, magVar: 13.0, transitionAltitudeFt: 18000,
    runways: [
      { a: '10L', b: '28R', headingMagA: 104, lengthFt: 11870, lateralNm: 0.1, ilsB: 109.55 },
      { a: '10R', b: '28L', headingMagA: 104, lengthFt: 11381, lateralNm: -0.1, ilsB: 108.9 },
      { a: '01L', b: '19R', headingMagA: 13, lengthFt: 7650, lateralNm: -0.4, ilsB: 108.9 },
    ],
  }),
  buildAirport({
    icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', nameKo: '로스앤젤레스', city: 'Los Angeles', country: 'US',
    lat: 33.9425, lon: -118.408, elevationFt: 125, magVar: 11.6, transitionAltitudeFt: 18000,
    runways: [
      { a: '06L', b: '24R', headingMagA: 83, lengthFt: 8926, lateralNm: -0.45, ilsB: 108.5 },
      { a: '06R', b: '24L', headingMagA: 83, lengthFt: 10885, lateralNm: -0.3, ilsB: 111.7 },
      { a: '07L', b: '25R', headingMagA: 83, lengthFt: 12923, lateralNm: 0.3, ilsB: 109.9 },
      { a: '07R', b: '25L', headingMagA: 83, lengthFt: 11095, lateralNm: 0.45, ilsB: 111.1 },
    ],
  }),
  buildAirport({
    icao: 'KJFK', iata: 'JFK', name: 'New York John F. Kennedy', nameKo: '뉴욕 JFK', city: 'New York', country: 'US',
    lat: 40.6398, lon: -73.7789, elevationFt: 13, magVar: -13.0, transitionAltitudeFt: 18000,
    runways: [
      { a: '04L', b: '22R', headingMagA: 44, lengthFt: 12079, lateralNm: -0.6, ilsA: 110.9, ilsB: 109.5 },
      { a: '13R', b: '31L', headingMagA: 134, lengthFt: 14511, lateralNm: 0.3, ilsB: 108.9 },
    ],
  }),
  buildAirport({
    icao: 'PANC', iata: 'ANC', name: 'Anchorage Ted Stevens', nameKo: '앵커리지', city: 'Anchorage', country: 'US',
    lat: 61.1744, lon: -149.996, elevationFt: 152, magVar: 15.0, transitionAltitudeFt: 18000,
    runways: [{ a: '07R', b: '25L', headingMagA: 74, lengthFt: 12400, ilsA: 111.3 }],
  }),
  buildAirport({
    icao: 'EGLL', iata: 'LHR', name: 'London Heathrow', nameKo: '런던 히드로', city: 'London', country: 'GB',
    lat: 51.4706, lon: -0.4619, elevationFt: 83, magVar: 0.5, transitionAltitudeFt: 6000,
    runways: [
      { a: '09L', b: '27R', headingMagA: 90, lengthFt: 12802, lateralNm: -0.4, ilsA: 110.3, ilsB: 110.75 },
      { a: '09R', b: '27L', headingMagA: 90, lengthFt: 12008, lateralNm: 0.4, ilsA: 109.5, ilsB: 109.5 },
    ],
  }),
  buildAirport({
    icao: 'LFPG', iata: 'CDG', name: 'Paris Charles de Gaulle', nameKo: '파리 샤를드골', city: 'Paris', country: 'FR',
    lat: 49.0097, lon: 2.5479, elevationFt: 392, magVar: 1.5, transitionAltitudeFt: 5000,
    runways: [
      { a: '08L', b: '26R', headingMagA: 85, lengthFt: 13829, lateralNm: -0.9, ilsA: 108.7, ilsB: 108.55 },
      { a: '09R', b: '27L', headingMagA: 85, lengthFt: 13780, lateralNm: 0.9, ilsA: 110.1, ilsB: 110.55 },
    ],
  }),
  buildAirport({
    icao: 'EDDF', iata: 'FRA', name: 'Frankfurt am Main', nameKo: '프랑크푸르트', city: 'Frankfurt', country: 'DE',
    lat: 50.0333, lon: 8.5706, elevationFt: 364, magVar: 3.0, transitionAltitudeFt: 5000,
    runways: [
      { a: '07L', b: '25R', headingMagA: 69, lengthFt: 13123, lateralNm: 0.3, ilsA: 109.5, ilsB: 111.15 },
      { a: '07C', b: '25C', headingMagA: 69, lengthFt: 13123, lateralNm: -0.4, ilsA: 111.55, ilsB: 110.7 },
    ],
  }),
  buildAirport({
    icao: 'OMDB', iata: 'DXB', name: 'Dubai International', nameKo: '두바이', city: 'Dubai', country: 'AE',
    lat: 25.2528, lon: 55.3644, elevationFt: 62, magVar: 2.0, transitionAltitudeFt: 13000,
    runways: [
      { a: '12L', b: '30R', headingMagA: 121, lengthFt: 13123, lateralNm: 0.2, ilsA: 110.1, ilsB: 111.75 },
      { a: '12R', b: '30L', headingMagA: 121, lengthFt: 14590, lateralNm: -0.2, ilsA: 109.5, ilsB: 110.9 },
    ],
  }),
  buildAirport({
    icao: 'YSSY', iata: 'SYD', name: 'Sydney Kingsford Smith', nameKo: '시드니', city: 'Sydney', country: 'AU',
    lat: -33.9461, lon: 151.1772, elevationFt: 21, magVar: 12.6, transitionAltitudeFt: 10000,
    runways: [
      { a: '16R', b: '34L', headingMagA: 155, lengthFt: 12999, lateralNm: -0.3, ilsA: 109.5, ilsB: 110.1 },
      { a: '16L', b: '34R', headingMagA: 155, lengthFt: 7999, lateralNm: 0.6, ilsA: 109.9, ilsB: 111.1 },
    ],
  }),
]
