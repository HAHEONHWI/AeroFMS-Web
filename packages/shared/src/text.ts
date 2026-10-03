/** Levenshtein edit distance (used for "did you mean" suggestions). */
export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    prev = cur
  }
  return prev[n] ?? 0
}

export const padRight = (s: string, width: number): string => (s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length))
export const padLeft = (s: string, width: number): string => (s.length >= width ? s.slice(0, width) : ' '.repeat(width - s.length) + s)
