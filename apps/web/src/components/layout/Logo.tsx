export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="#111824" />
      <rect x="10" y="12" width="44" height="30" rx="3" fill="#05080D" stroke="#34435D" strokeWidth="2" />
      <path d="M16 34 L28 22 L36 28 L48 18" fill="none" stroke="#4FB3A9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="22" r="2.5" fill="#E8EDF4" />
      <circle cx="36" cy="28" r="2.5" fill="#E8EDF4" />
      <rect x="14" y="47" width="8" height="5" rx="1.5" fill="#34435D" />
      <rect x="25" y="47" width="8" height="5" rx="1.5" fill="#34435D" />
      <rect x="36" y="47" width="14" height="5" rx="1.5" fill="#F6B23D" />
    </svg>
  )
}
