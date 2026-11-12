import { forbidden, unauthorized } from 'next/navigation'
import { getSupabaseServerClient } from '../../../src/lib/supabaseServer'
import { requireAdmin } from '../../../src/lib/admin'
import OrdersView from '../../../src/components/OrdersView'

export default async function AdminOrdersPage() {
  const client = await getSupabaseServerClient()
  try { await requireAdmin(client) } catch (error) {
    if (error.status === 401) unauthorized()
    if (error.status === 403) forbidden()
    throw error
  }
  return <OrdersView admin />
}
