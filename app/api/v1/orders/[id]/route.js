import { getSupabaseServerClient } from '../../../../../src/lib/supabaseServer'
import { orderReader, validateOrderId, orderDetailColumns, OrderError, ordersResponse, ordersFailure } from '../../../../../src/lib/orders'
import { consumeReadQuota } from '../../../../../src/lib/rateLimit'

export async function GET(_request, { params }) {
  try {
    const client = await getSupabaseServerClient()
    const { user, isAdmin } = await orderReader(client)
    const { id } = await params
    validateOrderId(id)
    await consumeReadQuota(client, 'orders')
    let query = client.from('orders').select(orderDetailColumns).eq('id', id)
    if (!isAdmin) query = query.eq('user_id', user.id)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) throw new OrderError(404, 'Pedido no encontrado.')
    return ordersResponse({ order: data })
  } catch (error) { return ordersFailure(error) }
}
