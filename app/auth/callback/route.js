import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../src/lib/supabaseServer'

export async function GET(request) {
  const url = new URL(request.url)
  const flow = url.searchParams.get('flow') === 'confirm' ? 'confirm' : 'oauth'
  const target = new URL(`/?auth=${flow}`, url.origin)
  try {
    const code = url.searchParams.get('code')
    if (!code || url.searchParams.has('error')) throw new Error('Callback incompleto')
    const client = await getSupabaseServerClient()
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (error) throw error
  } catch {
    target.searchParams.set('auth_error', 'callback')
  }
  const response = NextResponse.redirect(target)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
