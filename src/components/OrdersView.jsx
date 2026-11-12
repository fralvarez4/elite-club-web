'use client'

import { useEffect, useState } from 'react'
import { LanguageProvider, LanguageSwitcher, useLanguage } from '../lib/i18n'

const status = { pending: 'Pendiente de pago', approved: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado' }

async function read(url) {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(response.status === 401 ? 'Iniciá sesión para ver tus pedidos.' : response.status === 403 ? 'No tenés permiso para ver estos pedidos.' : data.error || 'No pudimos cargar los pedidos.')
  return data
}

export default function OrdersView(props) { return <LanguageProvider><LanguageSwitcher /><OrdersContent {...props} /></LanguageProvider> }

function OrdersContent({ admin = false }) {
  const { language, t } = useLanguage()
  const money = value => new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value))
  const date = value => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const [list, setList] = useState({ orders: [], has_more: false })
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(null)
  const [paymentError, setPaymentError] = useState('')
  const limit = 10

  useEffect(() => {
    let active = true
    read(`/api/v1/orders?scope=${admin ? 'all' : 'mine'}&limit=${limit}&offset=${offset}`)
      .then(data => { if (active) { setList(data); setError('') } })
      .catch(cause => { if (active) { setList({ orders: [], has_more: false }); setSelected(null); setError(cause.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [admin, offset, version])

  async function showDetail(id) {
    if (selected?.id === id) { setSelected(null); return }
    setSelected({ id, loading: true }); setDetailError('')
    try { const data = await read(`/api/v1/orders/${id}`); setSelected(data.order) }
    catch (cause) { setSelected(null); setDetailError(cause.message) }
  }

  async function continuePayment(id) {
    if (paymentBusy) return
    setPaymentBusy(id); setPaymentError('')
    try {
      const { order } = await read(`/api/v1/orders/${id}`)
      if (order.status !== 'pending') {
        setPaymentError('El estado del pedido cambió. Actualizá la lista antes de intentar pagar.')
        refresh()
        return
      }
      const response = await fetch('/api/v1/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id }), cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No pudimos continuar el pago. Actualizá el pedido y volvé a intentar.')
      const target = new URL(data.init_point)
      if (target.protocol !== 'https:' || !/(^|\.)mercadopago\.com(\.ar)?$/.test(target.hostname)) throw new Error('El enlace de pago no es válido. Contactá a la tienda.')
      window.location.assign(target.href)
    } catch (cause) { setPaymentError(cause.message) }
    finally { setPaymentBusy(null) }
  }

  function refresh() { setLoading(true); setVersion(value => value + 1); if (selected?.id && !selected.loading) void showDetail(selected.id) }

  return <main className="orders-page">
    <div className="orders-top"><a href={admin ? '/admin' : '/'}>← {t(admin ? 'Administración' : 'Volver a la tienda')}</a><a href="/" className="orders-logo" aria-label="Elite Club"><img src="/elite-club-logo.png" alt="Elite Club" /></a><button className="button outline" onClick={refresh} disabled={loading}>{t('Actualizar estados')}</button></div>
    <h1>{t(admin ? 'Pedidos de la tienda' : 'Mis pedidos')}</h1>
    <p>{t(admin ? 'Consultá los pedidos y sus estados. Los pagos se confirman mediante Mercado Pago.' : 'Encontrá tus compras anteriores y consultá el estado actualizado de cada una.')}</p>
    {error && <p className="auth-message" role="alert">{t(error)} <button className="text-button" onClick={refresh}>{t('Reintentar')}</button></p>}
    {detailError && <p className="auth-message" role="alert">{t(detailError)}</p>}
    {paymentError && <p className="auth-message" role="alert">{t(paymentError)}</p>}
    {loading ? <p role="status">{t('Cargando pedidos…')}</p> : !error && list.orders.length === 0 ? <div className="orders-empty">{t(offset ? 'No hay más pedidos.' : 'Todavía no hay pedidos para mostrar.')}</div> : <div className="orders-list">{list.orders.map(order => <article className="order-card" key={order.id}>
      <div><span className="order-date">{date(order.created_at)}</span><h2>{t('Pedido')} #{order.id.slice(0, 8).toUpperCase()}</h2>{admin && <p>{order.order_delivery?.first_name} {order.order_delivery?.last_name}</p>}</div>
      <span className={`order-status status-${order.status}`}>{t(status[order.status] || order.status)}</span><strong>{money(order.total)}</strong>
      <div className="order-actions"><button className="button outline" onClick={() => showDetail(order.id)} aria-expanded={selected?.id === order.id} aria-controls={`detail-${order.id}`} aria-label={`${t('Ver detalle del pedido')} ${order.id.slice(0, 8)}`}>{t(selected?.id === order.id ? 'Ocultar detalle' : 'Ver detalle')}</button>{!admin && order.status === 'pending' && <button className="button dark" disabled={Boolean(paymentBusy)} onClick={() => continuePayment(order.id)}>{t(paymentBusy === order.id ? 'Comprobando pago…' : 'Continuar pago')}</button>}</div>
      {selected?.id === order.id && <section id={`detail-${order.id}`} className="order-detail" aria-label={t('Detalle del pedido')}><div className="order-detail-head"><h3>{t('Detalle')} #{selected.id.slice(0, 8).toUpperCase()}</h3><button onClick={() => setSelected(null)} aria-label={t('Cerrar detalle')}>×</button></div>{selected.loading ? <p role="status">{t('Cargando detalle…')}</p> : <>
        <p className={`order-status status-${selected.status}`}>{t(status[selected.status] || selected.status)}</p><p>{date(selected.created_at)}</p>
        <h3>{t('Productos')}</h3><ul>{selected.order_items?.map(item => <li key={item.id}><span>{item.products?.name || item.product_id}{item.products?.size && item.products.size !== '-' ? ` · ${t('Talle')} ${item.products.size}` : ''} × {item.quantity}</span><strong>{money(Number(item.unit_price) * item.quantity)}</strong></li>)}</ul>
        <h3>{t('Entrega')}</h3><p>{selected.order_delivery?.first_name} {selected.order_delivery?.last_name} · {selected.order_delivery?.phone}</p>
        {selected.order_delivery?.method === 'pickup' ? <p>{t('Retiro en')} {selected.order_delivery.pickup_name}<br />{selected.order_delivery.pickup_address}</p> : <p>{selected.order_delivery?.street} {selected.order_delivery?.street_number} {selected.order_delivery?.apartment}<br />{selected.order_delivery?.postal_code} · {selected.order_delivery?.city}, {selected.order_delivery?.province}</p>}
        <div className="order-total"><span>{t('Total')}</span><strong>{money(selected.total)}</strong></div>
        {selected.status === 'pending' && <p>{t('Si cerraste Mercado Pago, podés continuar el pago de este pedido. El estado se verifica antes de abrirlo. Si Mercado Pago indica que el enlace venció o si ya pagaste, contactá a la tienda antes de reintentar.')}</p>}
      </>}</section>}
    </article>)}</div>}
    {!error && !loading && (offset > 0 || list.has_more) && <div className="orders-pagination"><button className="button outline" disabled={offset === 0} onClick={() => { setLoading(true); setSelected(null); setOffset(value => Math.max(0, value - limit)) }}>{t('Anteriores')}</button><span>{t('Página')} {offset / limit + 1}</span><button className="button outline" disabled={!list.has_more} onClick={() => { setLoading(true); setSelected(null); setOffset(value => value + limit) }}>{t('Siguientes')}</button></div>}
  </main>
}
