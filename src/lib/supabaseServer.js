import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function sessionClient(cookieAdapter) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Supabase no está configurado.')
  return createServerClient(url, key, {
    cookies: cookieAdapter,
    global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) },
  })
}

export async function getSupabaseServerClient() {
  const store = await cookies()
  return sessionClient({
    getAll: () => store.getAll(),
    setAll: values => {
      // Server Components no pueden escribir cookies; proxy renueva la sesión.
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* render */ }
    },
  })
}
