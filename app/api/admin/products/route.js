import { getSupabaseServerClient } from '../../../../src/lib/supabaseServer'
import { requireAdmin, adminFailure, productInput } from '../../../../src/lib/admin'
import { consumeReadQuota, protectedRpc } from '../../../../src/lib/rateLimit'

export async function GET() {
  try {
    const client = await getSupabaseServerClient()
    await requireAdmin(client)
    await consumeReadQuota(client, 'admin')
    const { data, error } = await client.from('products').select('*').order('sort_order').order('id')
    if (error) throw error
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return adminFailure(error) }
}
export async function POST(request) {
  try {
    const client = await getSupabaseServerClient()
    await requireAdmin(client)
    const product = await productInput(request)
    const data = await protectedRpc(client, 'elite_admin_create_product', { p_product: product })
    return Response.json(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return adminFailure(error) }
}
