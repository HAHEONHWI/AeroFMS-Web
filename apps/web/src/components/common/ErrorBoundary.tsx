import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import i18n from '@/i18n'

interface State {
  error?: Error
}

/** Prevents a rendering error from blanking the app; local sessions stay intact. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AeroFMS] UI error', error, info.componentStack)
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">{i18n.t('common.error')}</h1>
        <p className="text-sm text-fg-muted">{i18n.t('common.errorDetail')}</p>
        <pre className="overflow-x-auto rounded bg-surface p-3 text-left text-xs text-fg-faint">{this.state.error.message}</pre>
        <div className="flex justify-center gap-2">
          <button type="button" className="h-11 rounded-md bg-accent px-4 font-semibold text-bg" onClick={() => window.location.reload()}>
            {i18n.t('common.reload')}
          </button>
          <a className="inline-flex h-11 items-center rounded-md border border-line px-4" href="/">
            {i18n.t('common.goHome')}
          </a>
        </div>
      </div>
    )
  }
}
