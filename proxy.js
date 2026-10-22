import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key?.startsWith('sb_publishable_')) return response
  const client = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (values, headers) => {
      values.forEach(({ name, value }) => request.cookies.set(name, value))
      response = NextResponse.next({ request })
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      Object.entries(headers || {}).forEach(([name, value]) => response.headers.set(name, value))
    },
  } })
  await client.auth.getUser()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] }
