'use client'

import { useRef, useState } from 'react'
import { useAuth, authErrorMessage } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import ProfileForm from './ProfileForm'
import { passwordChecks } from '../lib/passwordPolicy'
import Turnstile from './Turnstile'

function ProviderIcon() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.9 1.3-4.2 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7V15H5.7a20 20 0 0 0 0 18l6.9-5.5Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.7A19.4 19.4 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15l6.9 5.5C14.2 15.7 18.7 12.1 24 12.1Z"/></svg>
}

export default function AuthForm() {
  const { t } = useLanguage()
  const { user, loading, error: sessionError, clearError } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaVersion, setCaptchaVersion] = useState(0)
  const resetCaptcha = () => { setCaptchaToken(''); setCaptchaVersion(value => value + 1) }
  const submitting = useRef(false)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  async function socialLogin() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(''); setMessage(''); clearError()
    setPassword(''); setConfirmPassword('')
    try {
      const { error: oauthError } = await getSupabaseBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?flow=oauth` } })
      if (oauthError) throw oauthError
    } catch {
      setError('No pudimos iniciar el acceso con ese proveedor. Volvé a intentar.')
    } finally { submitting.current = false; setBusy(false) }
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current || loading) return
    if (mode === 'signup') {
      setMessage(''); clearError()
      if (!firstName.trim() || !lastName.trim()) {
        setError('Completá tu nombre y apellido.'); resetCaptcha(); return
      }
      const parsedBirthDate = new Date(`${birthDate}T00:00:00Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(parsedBirthDate.getTime()) || parsedBirthDate.toISOString().slice(0, 10) !== birthDate || birthDate < '0001-01-01' || birthDate > today) {
        setError('Ingresá una fecha de nacimiento válida que no sea futura.'); resetCaptcha(); return
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.'); resetCaptcha(); return
      }
      if (!passwordChecks(password, confirmPassword).every(check => check.valid)) {
        setError('Usá al menos 10 caracteres, una minúscula, una mayúscula, un número y un símbolo.'); resetCaptcha(); return
      }
    }
    if (!captchaToken) { setError('Completá la verificación de seguridad antes de continuar.'); resetCaptcha(); return }
    submitting.current = true
    setBusy(true); setError(''); setMessage(''); clearError()
    try {
      const client = getSupabaseBrowserClient()
      const result = mode === 'signup'
        ? await client.auth.signUp({ email: email.trim(), password, options: {
          captchaToken,
          emailRedirectTo: `${window.location.origin}/auth/callback?flow=confirm`,
          data: { first_name: firstName.trim(), last_name: lastName.trim(), birth_date: birthDate },
        } })
        : await client.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } })
      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) {
        setMessage('Revisá tu email para confirmar la cuenta antes de iniciar sesión. Si ya tenés una cuenta, podés iniciar sesión con tus datos.')
      }
    } catch (cause) {
      setError(cause?.code === 'captcha_failed' ? 'La verificación de seguridad fue rechazada. Completala nuevamente.' : authErrorMessage(cause))
    } finally {
      setPassword(''); setConfirmPassword(''); setBusy(false); submitting.current = false
      resetCaptcha()
    }
  }

  async function logout() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setError(''); setMessage(''); clearError()
    try {
      const client = getSupabaseBrowserClient()
      const { error: logoutError } = await client.auth.signOut({ scope: 'local' })
      if (logoutError) {
        const { data } = await client.auth.getSession()
        if (!data.session) {
          setMode('login')
          setError('La sesión se cerró en este navegador, pero no pudimos confirmar el cierre en el servidor.')
          return
        }
        throw logoutError
      }
      setMode('login'); setMessage('Cerraste sesión. Podés seguir explorando el catálogo.'); setPassword('')
    } catch (cause) {
      setError(authErrorMessage(cause))
    } finally {
      setBusy(false); submitting.current = false
    }
  }

  if (loading) return <p role="status">{t('Comprobando sesión…')}</p>
  return <div className="auth-panel">
    {(error || sessionError) && <p className="auth-message" role="alert">{t(error || sessionError)}</p>}
    {message && !user && <p className="auth-message" role="status">{t(message)}</p>}
    {user ? <div className="product-form">
      <p role="status">{t('Sesión iniciada')}<br /><strong className="auth-email">{user.email}</strong></p>
      <ProfileForm />
      <button type="button" className="button dark" disabled={busy} onClick={logout}>{t(busy ? 'Procesando…' : 'Cerrar sesión')}</button>
    </div> : <>
      <h3>{t(mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión')}</h3>
      <div className="oauth-buttons"><button type="button" className="oauth-button oauth-google" disabled={busy} onClick={socialLogin}><ProviderIcon /><span>{t(busy ? 'Procesando…' : 'Continuar con Google')}</span></button></div>
      <div className="auth-divider"><span>{t('o')}</span></div>
      <form className="product-form" onSubmit={submit} aria-busy={busy}>
        {mode === 'signup' && <>
          <label htmlFor="auth-first-name">{t('Nombre')}<input id="auth-first-name" name="given-name" autoComplete="given-name" required maxLength={100} value={firstName} onChange={e => setFirstName(e.target.value)} disabled={busy} /></label>
          <label htmlFor="auth-last-name">{t('Apellido')}<input id="auth-last-name" name="family-name" autoComplete="family-name" required maxLength={100} value={lastName} onChange={e => setLastName(e.target.value)} disabled={busy} /></label>
          <label htmlFor="auth-birth-date">{t('Fecha de nacimiento')}<input id="auth-birth-date" name="bday" type="date" autoComplete="bday" required min="0001-01-01" max={today} value={birthDate} onChange={e => setBirthDate(e.target.value)} disabled={busy} /></label>
        </>}
        <label htmlFor="auth-email">{t('Email')}<input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
        <label htmlFor="auth-password">{t('Contraseña')}<input id="auth-password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 10 : undefined} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
        {mode === 'signup' && <>
          <ul className="selection-help" aria-label={t('Requisitos de contraseña')}>
            {passwordChecks(password, confirmPassword).map(check => <li key={check.label}>{check.valid ? '✓' : '○'} {t(check.label)}</li>)}
          </ul>
          <label htmlFor="auth-confirm-password">{t('Confirmar contraseña')}<input id="auth-confirm-password" name="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} /></label>
        </>}
        <Turnstile key={`${mode}-${captchaVersion}`} onToken={setCaptchaToken} />
        <button className="button dark" type="submit" disabled={busy}>{t(busy ? 'Procesando…' : mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión')}</button>
      </form>
      <button className="text-button auth-switch" type="button" disabled={busy} onClick={() => { resetCaptcha(); setMode(mode === 'signup' ? 'login' : 'signup'); setPassword(''); setConfirmPassword(''); setError(''); setMessage(''); clearError() }}>{t(mode === 'signup' ? 'Ya tengo cuenta. Iniciar sesión' : 'No tengo cuenta. Crear cuenta')}</button>
    </>}
  </div>
}
