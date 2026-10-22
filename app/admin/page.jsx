import { forbidden, unauthorized } from 'next/navigation'
import { getSupabaseServerClient } from '../../src/lib/supabaseServer'
import { requireAdmin } from '../../src/lib/admin'
import AdminProducts from '../../src/components/AdminProducts'

export default async function AdminPage() {
  const client = await getSupabaseServerClient()
  try { await requireAdmin(client) } catch (error) {
    if (error.status === 401) unauthorized()
    if (error.status === 403) forbidden()
    throw error
  }
  return <AdminProducts />
}
