import { getSupabaseServerClient } from '../../../../src/lib/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { requireOrderUser, orderReader, orderInput, orderPagination, orderColumns, ordersResponse, ordersFailure, OrderError } from '../../../../src/lib/orders'
import { consumeReadQuota, protectedRpc } from '../../../../src/lib/rateLimit'
import { getMepQuote } from '../../../../src/lib/fx'

export async function POST(request) {
  try {
    const client = await getSupabaseServerClient()
    await requireOrderUser(client)
    const { items, delivery } = await orderInput(request)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new OrderError(503, 'Falta configurar la cotización segura del pedido.')
    let quote
    try { quote = await getMepQuote() } catch { throw new OrderError(503, 'No hay una cotización MEP reciente. Probá más tarde.') }
    const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } })
    const stored = await protectedRpc(serviceClient, 'elite_store_mep_rate', {
      p_rate: quote.rate, p_updated_at: quote.updated_at, p_fetched_at: quote.fetched_at,
    })
    if (stored !== true) throw new OrderError(503, 'No se pudo verificar la cotización del pedido.')
    const data = await protectedRpc(client, 'elite_create_order', { p_items: items, p_delivery: delivery })
    if (!data?.id) throw new Error('Supabase no devolvió el pedido creado.')
    return ordersResponse({ order: data }, 201, { Location: `/api/v1/orders/${data.id}` })
  } catch (error) { return ordersFailure(error) }
}

export async function GET(request) {
  try {
    const client = await getSupabaseServerClient()
    const { user, isAdmin } = await orderReader(client)
    const { limit, offset, scope } = orderPagination(request.url)
    if (scope === 'all' && !isAdmin) throw new OrderError(403, 'Forbidden')
    await consumeReadQuota(client, 'orders')
    let query = client.from('orders').select(orderColumns).order('created_at', { ascending: false }).order('id', { ascending: false })
    if (scope === 'mine') query = query.eq('user_id', user.id)
    const { data, error } = await query.range(offset, offset + limit)
    if (error) throw error
    return ordersResponse({ orders: data.slice(0, limit), limit, offset, has_more: data.length > limit })
  } catch (error) { return ordersFailure(error) }
}
