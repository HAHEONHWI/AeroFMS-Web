import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatRelative } from '@aerofms/i18n'
import { Button } from '@/components/common/Button'
import { PageHeader, TextInput } from '@/components/common/Form'
import { Dialog } from '@/components/common/Dialog'
import { toast } from '@/components/common/Toast'
import { authErrorKey, useAuth } from '@/stores/auth'
import { useSync } from '@/stores/sync'
import { currentLanguage } from '@/i18n'

export function AccountPage() {
  const { t } = useTranslation()
  const auth = useAuth()
  const sync = useSync()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(t(authErrorKey(e)))
    } finally {
      setBusy(false)
    }
  }

  if (!auth.available) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <PageHeader title={t('account.title')} />
        <p className="text-sm text-fg-muted">{t('account.guest')}</p>
        <p className="mt-3 rounded-md border border-line bg-surface p-4 text-sm text-fg-muted">{t('common.cloudUnavailable')}</p>
      </div>
    )
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <PageHeader title={t('account.title')} subtitle={t('account.guest')} />
        <p className="mb-6 text-sm text-fg-muted">{t('account.benefits')}</p>
        <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void run(auth.signInGoogle)}>
          {t('account.signInGoogle')}
        </Button>
        <div className="my-6 border-t border-line" />
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => (mode === 'signin' ? auth.signInEmail(email, password) : auth.signUpEmail(email, password, name)))
          }}
        >
          {mode === 'signup' && <TextInput label={t('account.displayName')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />}
          <TextInput label={t('account.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <TextInput label={t('account.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} />
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === 'signin' ? t('account.signInEmail') : t('account.signUpEmail')}
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          <button type="button" className="text-accent" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? t('account.signUpEmail') : t('account.signInEmail')}
          </button>
          <button
            type="button"
            className="text-fg-muted hover:text-fg"
            onClick={() => void run(async () => {
              await auth.resetPassword(email)
              toast(t('account.passwordResetSent'), 'success')
            })}
          >
            {t('account.passwordReset')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <PageHeader title={t('account.title')} subtitle={t('account.signedInAs', { name: auth.user.displayName })} />
      <section className="rounded-lg border border-line bg-bg-elevated p-5">
        <h2 className="font-semibold">{t('account.syncStatus')}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {sync.lastSync ? t('account.lastSync', { time: formatRelative(currentLanguage(), sync.lastSync) }) : '—'} · {t('account.pending', { count: sync.pending })}
        </p>
        {sync.error && <p className="mt-1 text-sm text-danger">{t('account.syncError', { message: sync.error })}</p>}
        <Button className="mt-3" disabled={sync.running} onClick={() => void sync.syncNow()}>
          {t('account.syncNow')}
        </Button>
      </section>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void auth.signOut()}>{t('account.signOut')}</Button>
        <Button variant="danger" onClick={() => setDeleting(true)}>
          {t('account.deleteAccount')}
        </Button>
      </div>
      <Dialog
        open={deleting}
        title={t('account.deleteAccount')}
        onClose={() => setDeleting(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={confirmText !== 'DELETE' || busy}
              onClick={() =>
                void run(async () => {
                  await auth.deleteAccount()
                  setDeleting(false)
                  toast(t('account.deleteAccountDone'), 'success')
                })
              }
            >
              {t('account.deleteAccount')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed">{t('account.deleteAccountText')}</p>
        <div className="mt-4">
          <TextInput label={t('account.deleteAccountConfirm')} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Dialog>
    </div>
  )
}
