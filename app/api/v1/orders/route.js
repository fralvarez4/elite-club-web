import { getSupabaseServerClient } from '../../../../src/lib/supabaseServer'
import { requireOrderUser, orderReader, orderInput, orderPagination, orderColumns, ordersResponse, ordersFailure } from '../../../../src/lib/orders'
import { consumeReadQuota, protectedRpc } from '../../../../src/lib/rateLimit'

export async function POST(request) {
  try {
    const client = await getSupabaseServerClient()
    await requireOrderUser(client)
    const { items, delivery } = await orderInput(request)
    const data = await protectedRpc(client, 'elite_create_order', { p_items: items, p_delivery: delivery })
    if (!data?.id) throw new Error('Supabase no devolvió el pedido creado.')
    return ordersResponse({ order: data }, 201, { Location: `/api/v1/orders/${data.id}` })
  } catch (error) { return ordersFailure(error) }
}

export async function GET(request) {
  try {
    const client = await getSupabaseServerClient()
    const { user, isAdmin } = await orderReader(client)
    const { limit, offset } = orderPagination(request.url)
    await consumeReadQuota(client, 'orders')
    let query = client.from('orders').select(orderColumns).order('created_at', { ascending: false }).order('id', { ascending: false })
    if (!isAdmin) query = query.eq('user_id', user.id)
    const { data, error } = await query.range(offset, offset + limit)
    if (error) throw error
    return ordersResponse({ orders: data.slice(0, limit), limit, offset, has_more: data.length > limit })
  } catch (error) { return ordersFailure(error) }
}
