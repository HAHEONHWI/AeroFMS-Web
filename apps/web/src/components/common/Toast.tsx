import { create } from 'zustand'

type ToastKind = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastStore {
  items: ToastItem[]
  push(text: string, kind?: ToastKind): void
  dismiss(id: number): void
}

let seq = 0

export const useToast = create<ToastStore>((set, get) => ({
  items: [],
  push(text, kind = 'info') {
    const id = ++seq
    set({ items: [...get().items.slice(-3), { id, kind, text }] })
    setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 3500)
  },
  dismiss(id) {
    set({ items: get().items.filter((i) => i.id !== id) })
  },
}))

export const toast = (text: string, kind?: ToastKind): void => useToast.getState().push(text, kind)

const colors: Record<ToastKind, string> = {
  info: 'border-line-strong',
  success: 'border-ok/70',
  error: 'border-danger/80',
}

export function ToastViewport() {
  const items = useToast((s) => s.items)
  const dismiss = useToast((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
      {items.map((i) => (
        <button
          type="button"
          key={i.id}
          onClick={() => dismiss(i.id)}
          className={`pointer-events-auto max-w-md rounded-md border bg-bg-elevated px-4 py-3 text-left text-sm shadow-xl ${colors[i.kind]}`}
        >
          {i.text}
        </button>
      ))}
    </div>
  )
}
