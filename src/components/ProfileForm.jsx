'use client'

import { useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import { accessMethods, customerId, missingProfileFields, updateProfile } from '../lib/profiles'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

const fields = [
  ['first_name', 'Nombre', 100, 'given-name'],
  ['last_name', 'Apellido', 100, 'family-name'],
  ['birth_date', 'Fecha de nacimiento', null, 'bday'],
  ['phone', 'Teléfono', 50, 'tel'],
  ['street', 'Calle', 200, 'address-line1'],
  ['street_number', 'Número', 30, 'off'],
  ['apartment', 'Piso / departamento', 100, 'address-line2'],
  ['postal_code', 'Código postal', 20, 'postal-code'],
  ['city', 'Ciudad', 100, 'address-level2'],
  ['province', 'Provincia', 100, 'address-level1'],
  ['instructions', 'Indicaciones', 1000, 'off'],
]

function ProfileEditor({ profile, onSaved }) {
  const { t } = useLanguage()
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, profile[key] || ''])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const missing = missingProfileFields(profile)
  const editFields = missing.length ? fields.filter(([key]) => missing.includes(key)) : fields
  const today = new Date()
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  async function save(event) {
    event.preventDefault()
    if (submitting.current) return
    const cleaned = Object.fromEntries(editFields.map(([key]) => [key, values[key].trim()]))
    if (missing.some(key => !cleaned[key])) {
      setError('Completá los datos que faltan.'); return
    }
    if (cleaned.birth_date && (cleaned.birth_date < '0001-01-01' || cleaned.birth_date > maxDate)) {
      setError('Ingresá una fecha de nacimiento válida que no sea futura.'); return
    }
    for (const [key] of fields.slice(3)) if (Object.hasOwn(cleaned, key)) cleaned[key] ||= null
    submitting.current = true; setBusy(true); setError('')
    try {
      await updateProfile(getSupabaseBrowserClient(), profile.user_id, cleaned)
      onSaved()
    } catch {
      setError('No pudimos guardar tu perfil. Revisá los datos y volvé a intentar.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <form className="product-form" onSubmit={save} aria-busy={busy}>
    <h3>{t(missingProfileFields(profile).length ? 'Completá tu perfil' : 'Editar perfil')}</h3>
    <p>{t('Estos datos se usarán para completar futuras compras. Podés cambiarlos en cada pedido.')}</p>
    {error && <p className="auth-message" role="alert">{t(error)}</p>}
    {editFields.map(([key, label, maxLength, autoComplete]) => <label key={key} htmlFor={`profile-${key}`}>{t(label)}<input
      id={`profile-${key}`} name={key} type={key === 'birth_date' ? 'date' : key === 'phone' ? 'tel' : 'text'}
      required={['first_name', 'last_name', 'birth_date'].includes(key)} disabled={busy}
      autoComplete={autoComplete} min={key === 'birth_date' ? '0001-01-01' : undefined}
      max={key === 'birth_date' ? maxDate : undefined} maxLength={maxLength || undefined}
      value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}
    /></label>)}
    <button type="submit" className="button dark" disabled={busy}>{t(busy ? 'Procesando…' : 'Guardar perfil')}</button>
  </form>
}

export default function ProfileForm() {
  const { t } = useLanguage()
  const { user, profile, profileLoading, profileError, reloadProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  if (profileLoading) return <p role="status">{t('Cargando perfil…')}</p>
  if (profileError || !profile) return <div><p className="auth-message" role="alert">{t(profileError || 'No pudimos cargar tu perfil. Volvé a intentar o contactá a la tienda.')}</p><button type="button" className="text-button" onClick={reloadProfile}>{t('Reintentar')}</button></div>
  const incomplete = missingProfileFields(profile).length > 0
  return <>
    <p className="account-role">{t(profile.role === 'admin' ? 'Cuenta de administración' : 'Cuenta de cliente')}</p>
    <dl className="account-details">
      <div><dt>{t('ID de cliente')}</dt><dd>{customerId(profile.id)}</dd></div>
      {profile.first_name && <div><dt>{t('Nombre')}</dt><dd>{profile.first_name}</dd></div>}
      {profile.last_name && <div><dt>{t('Apellido')}</dt><dd>{profile.last_name}</dd></div>}
      {profile.birth_date && <div><dt>{t('Fecha de nacimiento')}</dt><dd>{profile.birth_date.split('-').reverse().join('/')}</dd></div>}
      {profile.phone && <div><dt>{t('Teléfono')}</dt><dd>{profile.phone}</dd></div>}
      {profile.street && <div><dt>{t('Dirección')}</dt><dd>{profile.street} {profile.street_number}, {profile.city}, {profile.province}</dd></div>}
      <div><dt>{t('Métodos de acceso')}</dt><dd>{accessMethods(user)}</dd></div>
    </dl>
    <a className="button outline" href="/pedidos">{t('Mis pedidos')}</a>
    {profile.role === 'admin' && <><a className="button outline" href="/admin">{t('Administración de productos')}</a><a className="button outline" href="/admin/pedidos">{t('Pedidos de la tienda')}</a></>}
    {!incomplete && !editing && <button type="button" className="button outline" onClick={() => setEditing(true)}>{t('Editar perfil')}</button>}
    {(incomplete || editing) && <ProfileEditor key={`${profile.id}:${profile.created_at}`} profile={profile} onSaved={() => { setEditing(false); reloadProfile() }} />}
  </>
}
