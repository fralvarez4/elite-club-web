import Store from '../src/components/Store'
import { connection } from 'next/server'
import { getProducts } from '../src/lib/products'
export default async function Page() {
  await connection()
  const products = await getProducts()
  return <Store initialProducts={products} />
}
