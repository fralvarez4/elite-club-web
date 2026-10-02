const COLORS = {
  'dark oatmeal': 'Avena oscuro', 'light oatmeal': 'Avena claro', 'stretch limo': 'Negro Stretch Limo',
  'jet black': 'Negro Jet', black: 'Negro', white: 'Blanco', blue: 'Azul', navy: 'Azul marino',
  orange: 'Naranja', green: 'Verde', yellow: 'Amarillo', pink: 'Rosa', brown: 'Marrón',
  gold: 'Dorado', red: 'Rojo', grey: 'Gris', gray: 'Gris', heather: 'Gris jaspeado',
}
export const ALPHA_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL']
const colorPattern = new RegExp(`\\b(${Object.keys(COLORS).join('|')})\\b`, 'gi')
export function productIdentity(product) {
  // Brand names (e.g. Off White) must never be interpreted as garment colors.
  const name = product.name.trim().replace(/\s+/g, ' ')
  const prefix = name.toLowerCase().startsWith(product.brand.toLowerCase() + ' ') ? name.slice(0, product.brand.length) : ''
  const body = prefix ? name.slice(prefix.length).trim() : name
  const colors = [...body.matchAll(colorPattern)].map(match => COLORS[match[0].toLowerCase()])
  const model = `${prefix} ${body.replace(colorPattern, '').replace(/\s*\/\s*(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()}`.trim()
    .replace(/^Corteiz Hoodie Alcatraz$/i, 'Corteiz Alcatraz Hoodie')
  return { model, color: [...new Set(colors)].join(' / ') || 'Sin especificar' }
}
export function groupProducts(products) {
  const groups = new Map()
  for (const product of products) {
    const { model, color } = productIdentity(product)
    const key = `${product.brand}|${product.type}|${model}`.toLowerCase()
    if (!groups.has(key)) groups.set(key, { ...product, name: model, variants: [], sourceIds: [] })
    const group = groups.get(key)
    const size = product.size.trim().toUpperCase() || '-'
    group.sourceIds.push(product.id)
    const existing = group.variants.find(v => v.color === color && v.size === size)
    if (existing) existing.sourceIds.push(product.id)
    else group.variants.push({ ...product, size, color, sourceIds: [product.id] })
  }
  return [...groups.values()]
}
export function sizesFor(group, products) {
  const available = group.variants.map(v => v.size)
  if (available.every(s => s === '-')) return ['-']
  if (available.every(s => /^\d+(\.\d+)?$/.test(s))) {
    return [...new Set(products.map(p => p.size).filter(s => /^\d+(\.\d+)?$/.test(s)))].sort((a, b) => Number(a) - Number(b))
  }
  return [...new Set([...ALPHA_SIZES, ...available])]
}
// Resolve carts saved before grouping without losing their quantities or selected variants.
export function resolveCart(cart, groups) {
  const variants = groups.flatMap(g => g.variants)
  const result = []
  for (const item of cart) {
    const product = variants.find(v => v.sourceIds.includes(item.id))
    if (!product) continue
    const existing = result.find(row => row.id === product.id)
    if (existing) existing.quantity = Math.min(99, existing.quantity + item.quantity)
    else result.push({ id: product.id, quantity: item.quantity, product })
  }
  return result
}
