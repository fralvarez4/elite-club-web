import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function generateProductsSeed(products) {
  const fields = ['id', 'name', 'size', 'brand', 'type', 'image']
  const ids = new Set()
  if (!Array.isArray(products) || !products.length) throw new Error('El inventario debe contener productos.')
  const rows = products.map((product, index) => {
    for (const field of fields) {
      if (typeof product[field] !== 'string' || !product[field].trim()) throw new Error(`Producto ${index}: ${field} inválido.`)
    }
    if (ids.has(product.id)) throw new Error(`ID duplicado: ${product.id}`)
    ids.add(product.id)
    const values = fields.map(field => `'${product[field].replaceAll("'", "''")}'`)
    return `  (${[...values, index].join(', ')})`
  })
  return `-- Generado desde src/data/products.json. Ejecutar DESPUÉS de 001_products.sql.
-- ${products.length} registros; sort_order conserva el orden original (desde 0).
begin;
set local standard_conforming_strings = on;
insert into public.products (id, name, size, brand, type, image, sort_order)
values
${rows.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  size = excluded.size,
  brand = excluded.brand,
  type = excluded.type,
  image = excluded.image,
  sort_order = excluded.sort_order;
commit;
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const products = JSON.parse(readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8'))
  writeFileSync(new URL('../supabase/seed.sql', import.meta.url), generateProductsSeed(products), 'utf8')
  console.log(`Seed generado: ${products.length} productos en supabase/seed.sql.`)
}
