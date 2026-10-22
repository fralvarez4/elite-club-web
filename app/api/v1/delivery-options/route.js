import { getSupabaseServerClient } from '../../../../src/lib/supabaseServer'
import { ordersResponse, ordersFailure } from '../../../../src/lib/orders'

export async function GET() {
  try {
    const client = await getSupabaseServerClient()
    const { data, error } = await client.from('delivery_options')
      .select('method,cost,pickup_name,pickup_address,pickup_hours,pickup_contact').eq('enabled', true)
    if (error) throw error
    return ordersResponse({ options: data })
  } catch (error) { return ordersFailure(error) }
}
