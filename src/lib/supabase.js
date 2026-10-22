import { createClient } from '@supabase/supabase-js'

export function getSupabaseClient({
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  fetch: fetchImplementation = globalThis.fetch,
} = {}) {
  if (!url && !key) return null
  if (!url || !key) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')
  if (!key.startsWith('sb_publishable_')) throw new Error('Usá exclusivamente una Publishable Key (sb_publishable_).')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetchImplementation(input, { ...init, cache: 'no-store' }) },
  })
}
