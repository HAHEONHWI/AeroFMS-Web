/** Original synthesized key feedback (no recorded avionics sounds are used). */
let ctx: AudioContext | undefined

export function playKeySound(kind: 'soft' | 'classic'): void {
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = kind === 'classic' ? 'square' : 'sine'
    osc.frequency.setValueAtTime(kind === 'classic' ? 1850 : 1200, t)
    gain.gain.setValueAtTime(kind === 'classic' ? 0.025 : 0.04, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'classic' ? 0.03 : 0.05))
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.06)
  } catch {
    // Audio is optional.
  }
}

export function vibrate(): void {
  try {
    navigator.vibrate?.(8)
  } catch {
    // not supported
  }
}
