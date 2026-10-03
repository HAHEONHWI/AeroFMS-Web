import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-fg-faint">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass =
  'h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none'

export function TextInput({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      <input id={id} {...rest} className={`${inputClass} ${rest.className ?? ''}`} aria-invalid={!!error} />
    </Field>
  )
}

export function TextArea({ label, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} id={id}>
      <textarea id={id} {...rest} className="min-h-24 w-full rounded-md border border-line bg-surface p-3 text-sm text-fg focus:border-accent focus:outline-none" />
    </Field>
  )
}

export function SelectInput({ label, options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: Array<{ value: string; label: string }> }) {
  const id = useId()
  return (
    <Field label={label} id={id}>
      <select id={id} {...rest} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  const id = useId()
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-1">
      <div>
        <label htmlFor={id} className="text-sm text-fg">
          {label}
        </label>
        {description && <p className="text-xs text-fg-faint">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? 'border-accent bg-accent' : 'border-line bg-surface-raised'}`}
      >
        <span className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-fg transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded px-3 text-sm transition-colors ${value === o.value ? 'bg-surface-raised text-fg shadow' : 'text-fg-muted hover:text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok' }) {
  const tones = {
    neutral: 'border-line text-fg-muted',
    accent: 'border-accent/60 text-accent',
    warn: 'border-warn/60 text-warn',
    danger: 'border-danger/60 text-danger',
    ok: 'border-ok/60 text-ok',
  }
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tones[tone]}`}>{children}</span>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
