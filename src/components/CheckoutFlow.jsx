'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { deliverySchema } from '../lib/delivery'
import AuthForm from './AuthForm'

const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
const contact = [['first_name', 'Nombre', 100], ['last_name', 'Apellido', 100], ['phone', 'Teléfono', 50]]
const address = [['street', 'Calle', 200], ['street_number', 'Número', 30], ['apartment', 'Piso / departamento (opcional)', 100], ['postal_code', 'Código postal', 20], ['city', 'Ciudad', 100], ['province', 'Provincia', 100], ['instructions', 'Indicaciones (opcional)', 1000]]

async function jsonRequest(url, body) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.')
  return data
}

export default function CheckoutFlow({ items, onBack, onBusy }) {
  const { user, profile } = useAuth()
  const [options, setOptions] = useState(null)
  const [load, setLoad] = useState(0)
  const [method, setMethod] = useState('shipping')
  const [delivery, setDelivery] = useState(null)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const lock = useRef(false)
  const [draft, setDraft] = useState({})
  useEffect(() => {
    let active = true
    jsonRequest('/api/v1/delivery-options').then(data => {
      if (active) { setOptions(data.options); setError('') }
    }).catch(() => { if (active) setError('No se pudieron cargar las opciones de entrega. Verificá que la migración 006 esté aplicada.') })
    return () => { active = false }
  }, [load])
  const option = options?.find(value => value.method === (delivery?.method || method))
  const validPrices = items.length > 0 && items.every(({ product, quantity }) => Number.isFinite(Number(product.price)) && Number(product.price) > 0 && Number.isInteger(quantity) && quantity > 0)
  const subtotal = items.reduce((sum, { product, quantity }) => sum + Math.round(Number(product.price) * 100) * quantity, 0) / 100
  const shipping = Number(option?.cost)
  const ready = validPrices && option && Number.isFinite(shipping) && shipping >= 0

  function review(event) {
    event.preventDefault()
    const parsed = deliverySchema.safeParse({ ...Object.fromEntries(new FormData(event.currentTarget)), method })
    if (!parsed.success) { setError('Completá correctamente los datos de entrega.'); return }
    setDraft(parsed.data); setError(''); setDelivery(parsed.data)
  }
  async function pay() {
    if (lock.current || !ready || uncertain) return
    lock.current = true; setBusy(true); onBusy(true); setError('')
    try {
      let current = order
      if (!current) {
        // No se envían precios, importes, estado ni datos del punto de retiro.
        try {
          const result = await jsonRequest('/api/v1/orders', {
            items: items.map(({ product, quantity }) => ({ product_id: product.id, quantity })), delivery,
          })
          current = result.order
          if (!current?.id) throw new Error('Respuesta de pedido inválida.')
          setOrder(current)
        } catch (failure) {
          // Ante una respuesta perdida no repetir automáticamente un POST no idempotente.
          if (failure instanceof TypeError || failure instanceof SyntaxError) {
            setUncertain(true)
            throw new Error('No pudimos confirmar si se creó el pedido. No repitas el pago: consultá a la tienda antes de volver a intentar.', { cause: failure })
          }
          throw failure
        }
        if (Math.round(Number(current.total) * 100) !== Math.round((subtotal + shipping) * 100)) {
          setError('El importe cambió al crear el pedido. Revisá el total actualizado y confirmá nuevamente para continuar.'); return
        }
      }
      const result = await jsonRequest('/api/v1/checkout', { order_id: current.id })
      window.location.assign(result.init_point)
    } catch (failure) { setError(failure.message || 'No pudimos iniciar el pago. Volvé a intentar.') }
    finally { lock.current = false; setBusy(false); onBusy(false) }
  }

  if (!user) return <><p>Iniciá sesión para continuar con tu pedido. Tu carrito se conserva.</p><AuthForm /></>
  return <div className="checkout-flow" aria-busy={busy}>
    <p className="eyebrow">Carrito → <strong>{delivery ? 'Revisión' : 'Datos de entrega'}</strong> → Mercado Pago</p>
    {error && <p className="auth-message" role="alert">{error}</p>}
    {!options ? <><p>Cargando opciones de entrega…</p>{error && <button className="text-button" onClick={() => setLoad(value => value + 1)}>Reintentar</button>}</> : !delivery ?
      <form className="product-form" onSubmit={review}>
        <fieldset className="checkout-methods"><legend>Método de entrega</legend>
          {['shipping', 'pickup'].map(value => {
            const available = options.find(o => o.method === value)
            return <label key={value}><input type="radio" name="method" value={value} checked={method === value} disabled={!available} onChange={() => setMethod(value)} />{value === 'shipping' ? 'Envío' : 'Retiro'}{Number(available?.cost) === 0 ? ' gratis' : available ? ` · ${money(available.cost)}` : ' no disponible'}{value === 'shipping' ? ' a domicilio' : ''}</label>
          })}
        </fieldset>
        {[...contact, ...(method === 'shipping' ? address : [])].map(([name, label, max]) => <label key={name}>{label}<input name={name} type={name === 'phone' ? 'tel' : 'text'} maxLength={max} required={!['apartment', 'instructions'].includes(name)} defaultValue={draft[name] ?? (contact.some(([field]) => field === name) ? profile?.[name] || '' : '')} /></label>)}
        {method === 'pickup' && option && <Pickup option={option} />}
        {!validPrices && <p role="alert">No pudimos obtener los precios actuales. Actualizá el catálogo antes de continuar.</p>}
        <button className="button dark" disabled={!ready}>Revisar pedido</button>
        <button type="button" className="text-button" onClick={onBack}>Volver al carrito</button>
      </form> : <>
        <h3>Revisión del pedido</h3>
        <ul className="checkout-items">{items.map(({ product, quantity }) => <li key={product.id}>{product.name} · {product.size} × {quantity}</li>)}</ul>
        <p>{delivery.first_name} {delivery.last_name} · {delivery.phone}</p>
        {delivery.method === 'pickup' ? <Pickup option={order?.order_delivery || option} /> : <p>{delivery.street} {delivery.street_number} {delivery.apartment}<br />{delivery.postal_code} · {delivery.city} · {delivery.province}<br />{delivery.instructions}</p>}
        <dl className="account-details"><dt>Subtotal</dt><dd>{money(order?.subtotal ?? subtotal)}</dd><dt>Envío</dt><dd>{money(order?.shipping_cost ?? shipping)}</dd><dt>Total</dt><dd><strong>{money(order?.total ?? subtotal + shipping)}</strong></dd></dl>
        {!order && <p className="auth-message">Los importes se verifican al confirmar el pago.</p>}
        {order && <p className="auth-message">Pedido pendiente: {order.id}. Si el pago falla, podés reintentar con este mismo pedido.</p>}
        <button className="button dark" disabled={busy || !ready || uncertain} onClick={pay}>{busy ? 'Procesando…' : 'Pagar con Mercado Pago'}</button>
        {!order && <button className="text-button" disabled={busy || uncertain} onClick={() => { setDelivery(null); setError('') }}>Editar entrega</button>}
      </>}
  </div>
}

function Pickup({ option }) {
  return <address className="checkout-pickup"><strong>{option.pickup_name}</strong><br />{option.pickup_address}<br />Horario: {option.pickup_hours}<br />Tel: {option.pickup_contact}</address>
}
