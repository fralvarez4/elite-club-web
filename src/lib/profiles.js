// Cast de BIGINT a texto para no perder precisión en JavaScript.
const columns = 'id::text,user_id,first_name,last_name,birth_date,role,created_at'

export async function readProfile(client, userId) {
  const { data, error } = await client.from('profiles').select(columns).eq('user_id', userId).maybeSingle().abortSignal(AbortSignal.timeout(8000))
  if (error) throw error
  if (!data) throw new Error('PROFILE_MISSING')
  return data
}

export async function updateProfile(client, userId, fields) {
  // Lista cerrada: ningún llamador puede enviar role, id o user_id en el PATCH.
  const changes = Object.fromEntries(['first_name', 'last_name', 'birth_date']
    .filter(key => Object.hasOwn(fields, key)).map(key => [key, fields[key]]))
  const { data, error } = await client.from('profiles').update(changes).eq('user_id', userId).select(columns).single().abortSignal(AbortSignal.timeout(8000))
  if (error) throw error
  return data
}

export function missingProfileFields(profile) {
  return ['first_name', 'last_name', 'birth_date'].filter(key => !profile?.[key]?.trim())
}

export function customerId(id) { return `EC-${String(id).padStart(6, '0')}` }

export function accessMethods(user) {
  const labels = { google: 'Google', apple: 'Apple', email: 'Email' }
  const providers = user?.app_metadata?.providers || user?.identities?.map(identity => identity.provider) || [user?.app_metadata?.provider]
  return [...new Set(providers)].map(provider => labels[provider]).filter(Boolean).join(' / ') || 'Email'
}
