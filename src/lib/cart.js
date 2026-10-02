export function addItem(cart, product) {
  const found = cart.find(item => item.id === product.id)
  return found ? cart.map(item => item.id === product.id ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item) : [...cart, { id: product.id, quantity: 1 }]
}
export function setQuantity(cart, id, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return cart
  return cart.map(item => item.id === id ? { ...item, quantity } : item)
}
export function removeItem(cart, id) { return cart.filter(item => item.id !== id) }
