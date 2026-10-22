'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getSupabaseBrowserClient, restoreBrowserSession } from './supabaseBrowser'
import { readProfile } from './profiles'

const AuthContext = createContext(null)

export function authErrorMessage(error) {
  const code = error?.code || error?.details?.code
  if (code === 'legacy_session_expired') return 'Actualizamos la sesión de la tienda. Volvé a iniciar sesión con tu cuenta.'
  if (code === 'invalid_credentials') return 'El email o la contraseña son incorrectos.'
  if (code === 'email_not_confirmed') return 'Confirmá tu email antes de iniciar sesión. Revisá también la carpeta de spam.'
  if (code === 'user_already_exists' || code === 'email_exists') return 'No se pudo crear la cuenta. Si ya tenés una, iniciá sesión.'
  if (code === 'weak_password') return 'La contraseña no cumple los requisitos de seguridad. Elegí una más larga y combiná letras, números y símbolos.'
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'Revisá el email y la contraseña ingresados.'
  if (code === 'signup_disabled') return 'El registro de cuentas no está habilitado en este momento.'
  if (code === 'email_address_not_authorized') return 'No se pudo enviar el email de confirmación a esta dirección. Contactá a la tienda.'
  if (code === 'otp_expired' || error?.name === 'AuthImplicitGrantRedirectError') return 'El enlace de confirmación venció o no es válido. Si ya confirmaste tu email, iniciá sesión.'
  if (error?.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Se hicieron demasiados intentos. Esperá unos minutos y volvé a intentar.'
  if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) return 'No pudimos conectar con el servicio. Revisá tu conexión y volvé a intentar.'
  return 'No pudimos completar la operación. Volvé a intentar en unos minutos.'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [returningFromEmail, setReturningFromEmail] = useState(false)
  const [profileState, setProfileState] = useState({ userId: null, data: null, error: '', loading: false })
  const [profileVersion, setProfileVersion] = useState(0)
  const reloadProfile = useCallback(() => setProfileVersion(version => version + 1), [])
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return
    let active = true
    setProfileState({ userId, data: null, error: '', loading: true })
    readProfile(getSupabaseBrowserClient(), userId).then(data => {
      if (active) setProfileState({ userId, data, error: '', loading: false })
    }).catch(() => {
      console.error('[Elite Club/profiles] No se pudo consultar el perfil.', { category: 'profile_lookup_failed' })
      if (active) setProfileState({ userId, data: null, error: 'No pudimos cargar tu perfil. Volvé a intentar o contactá a la tienda.', loading: false })
    })
    return () => { active = false }
  }, [userId, profileVersion])
  const clearError = useCallback(() => setError(''), [])
  const acknowledgeEmailReturn = useCallback(() => setReturningFromEmail(false), [])

  useEffect(() => {
    let active = true
    let subscription
    let sessionEvents = 0
    const currentUrl = new URL(window.location.href)
    const fragment = new URLSearchParams(currentUrl.hash.slice(1))
    const oauthReturn = currentUrl.searchParams.get('auth') === 'oauth'
    const emailReturn = ['confirm', 'oauth'].includes(currentUrl.searchParams.get('auth')) || fragment.has('access_token') || fragment.has('error')
    if (emailReturn) setReturningFromEmail(true)

    async function restoreSession() {
      try {
        const client = getSupabaseBrowserClient()
        subscription = client.auth.onAuthStateChange((event, nextSession) => {
          if (!active) return
          sessionEvents += 1
          setSession(nextSession)
          if (event === 'SIGNED_IN') setError('')
          // No se hacen llamadas async a Auth desde este callback.
        }).data.subscription
        const { error: initializationError } = await client.auth.initialize()
        if (initializationError) throw initializationError
        await restoreBrowserSession(client)
        const beforeRead = sessionEvents
        const { data, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (active && beforeRead === sessionEvents) setSession(data.session)
      } catch (cause) {
        if (active) setError(oauthReturn ? 'No se completó el acceso con el proveedor. Volvé a intentar.' : authErrorMessage(cause))
      } finally {
        if (active) setLoading(false)
        if (emailReturn) {
          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete('auth')
          cleanUrl.searchParams.delete('auth_error')
          cleanUrl.hash = ''
          window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search)
        }
      }
    }
    restoreSession()
    return () => { active = false; subscription?.unsubscribe() }
  }, [])

  const profile = userId && profileState.userId === userId ? profileState.data : null
  const profileError = userId && profileState.userId === userId ? profileState.error : ''
  const profileLoading = Boolean(userId && (profileState.userId !== userId || profileState.loading))
  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, error, clearError, returningFromEmail, acknowledgeEmailReturn, profile, profileError, profileLoading, reloadProfile }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
