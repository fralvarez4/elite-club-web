import backupProducts from '../data/products.json' with { type: 'json' }
import { getSupabaseClient } from './supabase.js'

// Se ejecuta desde las páginas del servidor; los avisos aparecen en la terminal de Next.js.
export async function getProducts({ clientFactory = getSupabaseClient, logger = console } = {}) {
  try {
    const client = clientFactory()
    if (!client) {
      logger.warn('[Elite Club/products] Supabase sin configurar. Usando respaldo temporal products.json.')
      return backupProducts
    }
    const { data, error } = await client.from('products')
      .select('id,name,size,brand,type,image,price')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .abortSignal(AbortSignal.timeout(8000))
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Supabase devolvió una respuesta de productos inválida.')
    if (!data.length) logger.warn('[Elite Club/products] Supabase devolvió 0 productos. Revisá el seed y la política SELECT. No se sustituye por el JSON.')
    return data
  } catch (error) {
    logger.error('[Elite Club/products] ERROR al leer Supabase. Usando respaldo temporal products.json.', {
      category: error?.code === '42501' ? 'permission_denied' : 'catalog_read_failed',
    })
    return backupProducts
  }
}
