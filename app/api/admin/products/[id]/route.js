import { getSupabaseServerClient } from '../../../../../src/lib/supabaseServer'
import { requireAdmin, adminFailure, productInput, AdminError } from '../../../../../src/lib/admin'
import { protectedRpc } from '../../../../../src/lib/rateLimit'

export async function PATCH(request, { params }) {
  try {
    const client = await getSupabaseServerClient()
    await requireAdmin(client)
    const product = await productInput(request)
    const { id } = await params
    const data = await protectedRpc(client, 'elite_admin_update_product', { p_id: id, p_product: product })
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return adminFailure(error) }
}
export async function DELETE(request, { params }) {
  try {
    const client = await getSupabaseServerClient()
    await requireAdmin(client)
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new AdminError(403, 'Origen no permitido.')
    const { id } = await params
    const data = await protectedRpc(client, 'elite_admin_delete_product', { p_id: id })
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return adminFailure(error) }
}
