'use client'

import { createBrowserClient } from '@supabase/ssr'

let browserClient
let restoration

// Importación única de sesiones anteriores y enlaces enviados con el flujo implicit.
export function restoreBrowserSession(client) {
  if (restoration) return restoration
  restoration = (async () => {
    const url = new URL(window.location.href)
    const fragment = new URLSearchParams(url.hash.slice(1))
    if (url.searchParams.has('auth_error') || fragment.has('error')) throw Object.assign(new Error('Enlace inválido'), { code: 'otp_expired' })
    if (fragment.has('access_token') && fragment.has('refresh_token')) {
      const { error } = await client.auth.setSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') })
      if (error) throw error
    }
    const key = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
    let legacy
    try { legacy = window.localStorage.getItem(key) } catch { return }
    if (!legacy) return
    const { data } = await client.auth.getSession()
    try {
      if (!data.session) {
        const old = JSON.parse(legacy)
        const { error } = await client.auth.setSession({ access_token: old.access_token, refresh_token: old.refresh_token })
        if (error) throw error
      }
    } catch {
      throw Object.assign(new Error('Volvé a iniciar sesión.'), { code: 'legacy_session_expired' })
    } finally {
      // Impide que una sesión vieja reaparezca después de cerrar sesión.
      window.localStorage.removeItem(key)
    }
  })()
  return restoration
}

export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') throw new Error('Auth solo se inicializa en el navegador.')
  if (browserClient) return browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key?.startsWith('sb_publishable_')) {
    throw new Error('Auth requiere la URL de Supabase y una Publishable Key.')
  }
  browserClient = createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return browserClient
}
