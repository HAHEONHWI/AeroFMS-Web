/**
 * AeroFMS design tokens ("Dark Aviation"). Shared by the web (Tailwind/CSS variables)
 * and Android (React Native StyleSheet). Original palette – not a copy of any
 * manufacturer's display colours.
 */
export const colors = {
  bg: '#0B1018',
  bgElevated: '#111824',
  surface: '#161F2D',
  surfaceRaised: '#1C2738',
  border: '#263247',
  borderStrong: '#34435D',
  text: '#E8EDF4',
  textMuted: '#9AA7BA',
  textFaint: '#6B7890',
  accent: '#4FB3A9',
  accentStrong: '#3A9C92',
  info: '#6EA8FE',
  warning: '#F2B544',
  danger: '#EF6461',
  success: '#5CCB8A',
  /** CDU display palette */
  cdu: {
    screen: '#05080D',
    bezel: '#1A212C',
    key: '#2A3240',
    keyPressed: '#3A4558',
    keyText: '#E6EAF0',
    keyBorder: '#3B4659',
    white: '#EDF1F7',
    green: '#4FE08A',
    cyan: '#5AD7F0',
    magenta: '#F07BE6',
    amber: '#F6B23D',
    yellow: '#F2E25A',
    red: '#F05A5A',
    gray: '#8792A3',
    blue: '#6EA8FE',
    execLight: '#F2EFE0',
  },
  map: {
    background: '#0A111B',
    land: '#18263A',
    active: '#F07BE6',
    mod: '#EDF1F7',
    missed: '#5AD7F0',
    secondary: '#7C8DA8',
    hold: '#F07BE6',
    airway: '#2E3D55',
    waypoint: '#9AA7BA',
    airport: '#5AD7F0',
    runway: '#EDF1F7',
    aircraft: '#F6B23D',
    tocTod: '#4FE08A',
    fix: '#4FE08A',
    highlight: '#F2E25A',
  },
} as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 4, md: 6, lg: 10 } as const
export const fontFamilies = {
  ui: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
} as const

export const breakpoints = { tablet: 768, desktop: 1100, wide: 1500 } as const

/** Minimum touch target (dp/px). */
export const MIN_HIT_TARGET = 44

export type CduColorName = keyof typeof colors.cdu
