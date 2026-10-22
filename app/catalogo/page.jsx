import Store from '../../src/components/Store'
import { getProducts } from '../../src/lib/products'

export default async function CatalogPage({ searchParams }) {
  const params = await searchParams
  const products = await getProducts()
  const value = name => typeof params[name] === 'string' ? params[name] : ''
  const initialFilters = {
    department: ['Hombre', 'Mujer'].includes(value('seccion')) ? value('seccion') : '',
    category: ['Remeras', 'Hoodies', 'Pantalones', 'Accesorios'].includes(value('categoria')) ? value('categoria') : 'Todo',
    query: value('q'), brand: value('marca'), onlyFavorites: value('favoritos') === '1',
  }
  return <Store key={JSON.stringify(initialFilters)} initialProducts={products} view="catalog" initialFilters={initialFilters} />
}
