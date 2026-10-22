'use client'

import { useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import { accessMethods, customerId, missingProfileFields, updateProfile } from '../lib/profiles'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

function CompleteProfile({ profile, onSaved }) {
  const { t } = useLanguage()
  const [values, setValues] = useState({ first_name: '', last_name: '', birth_date: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const missing = missingProfileFields(profile)
  const today = new Date()
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  async function save(event) {
    event.preventDefault()
    if (submitting.current) return
    if (missing.some(key => !values[key].trim())) { setError('Completá los datos que faltan.'); return }
    if (missing.includes('birth_date') && (values.birth_date < '0001-01-01' || values.birth_date > maxDate)) {
      setError('Ingresá una fecha de nacimiento válida que no sea futura.'); return
    }
    submitting.current = true; setBusy(true); setError('')
    try {
      await updateProfile(getSupabaseBrowserClient(), profile.user_id, Object.fromEntries(missing.map(key => [key, values[key].trim()])))
      onSaved()
    } catch {
      setError('No pudimos guardar tu perfil. Revisá los datos y volvé a intentar.')
    } finally { submitting.current = false; setBusy(false) }
  }
  const labels = { first_name: 'Nombre', last_name: 'Apellido', birth_date: 'Fecha de nacimiento' }
  return <form className="product-form" onSubmit={save} aria-busy={busy}>
    <h3>{t('Completá tu perfil')}</h3>
    {error && <p className="auth-message" role="alert">{t(error)}</p>}
    {missing.map(key => <label key={key} htmlFor={`profile-${key}`}>{t(labels[key])}<input id={`profile-${key}`} name={key}
      type={key === 'birth_date' ? 'date' : 'text'} required disabled={busy}
      autoComplete={key === 'first_name' ? 'given-name' : key === 'last_name' ? 'family-name' : 'bday'}
      min={key === 'birth_date' ? '0001-01-01' : undefined} max={key === 'birth_date' ? maxDate : undefined} maxLength={key === 'birth_date' ? undefined : 100}
      value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /></label>)}
    <button type="submit" className="button dark" disabled={busy}>{t(busy ? 'Procesando…' : 'Guardar perfil')}</button>
  </form>
}

export default function ProfileForm() {
  const { t } = useLanguage()
  const { user, profile, profileLoading, profileError, reloadProfile } = useAuth()
  if (profileLoading) return <p role="status">{t('Cargando perfil…')}</p>
  if (profileError || !profile) return <div><p className="auth-message" role="alert">{t(profileError || 'No pudimos cargar tu perfil. Volvé a intentar o contactá a la tienda.')}</p><button type="button" className="text-button" onClick={reloadProfile}>{t('Reintentar')}</button></div>
  return <>
    <dl className="account-details">
      <div><dt>{t('ID de cliente')}</dt><dd>{customerId(profile.id)}</dd></div>
      {profile.first_name && <div><dt>{t('Nombre')}</dt><dd>{profile.first_name}</dd></div>}
      {profile.last_name && <div><dt>{t('Apellido')}</dt><dd>{profile.last_name}</dd></div>}
      {profile.birth_date && <div><dt>{t('Fecha de nacimiento')}</dt><dd>{profile.birth_date.split('-').reverse().join('/')}</dd></div>}
      <div><dt>{t('Métodos de acceso')}</dt><dd>{accessMethods(user)}</dd></div>
    </dl>
    {profile.role === 'admin' && <a className="button outline" href="/admin">{t('Administración')}</a>}
    {missingProfileFields(profile).length > 0 && <CompleteProfile key={profile.id} profile={profile} onSaved={reloadProfile} />}
  </>
}
