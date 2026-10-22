'use client'

import { useEffect, useState } from 'react'

const labels = { name: 'Nombre', price: 'Precio (ARS)', size: 'Talle', brand: 'Marca', type: 'Tipo', image: 'Imagen (ruta o URL HTTPS)', sort_order: 'Orden en el catálogo' }
const empty = { name: '', price: '', size: '', brand: '', type: '', image: '', sort_order: 0 }

async function requestProducts(path = '', options) {
  const response = await fetch(`/api/admin/products${path}`, { cache: 'no-store', ...options })
  const result = await response.json()
  if (!response.ok) throw new Error(response.status === 401 ? 'Tu sesión venció. Volvé al inicio e iniciá sesión.' : response.status === 403 ? 'No tenés permisos de administración.' : result.error)
  return result
}

export default function AdminProducts() {
  const [products, setProducts] = useState([])
  const [editing, setEditing] = useState(null)
  const [values, setValues] = useState(empty)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setBusy(true)
    requestProducts().then(data => { if (active) { setProducts(data); setError('') } })
      .catch(cause => { if (active) setError(cause.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [version])
  function edit(product) {
    setEditing(product?.id || 'new')
    setValues(product ? Object.fromEntries(Object.keys(empty).map(key => [key, product[key]])) : { ...empty, sort_order: Math.max(-1, ...products.map(item => item.sort_order)) + 1 })
    setError(''); setMessage('')
  }
  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      await requestProducts(editing === 'new' ? '' : `/${encodeURIComponent(editing)}`, {
        method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, price: Number(values.price) }),
      })
      setEditing(null); setMessage('Producto guardado.'); setVersion(value => value + 1)
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  async function remove(product) {
    if (busy || !window.confirm(`¿Eliminar ${product.name}, talle ${product.size}?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await requestProducts(`/${encodeURIComponent(product.id)}`, { method: 'DELETE' })
      if (editing === product.id) setEditing(null)
      setMessage('Producto eliminado.'); setVersion(value => value + 1)
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <main className="admin-panel">
    <header><a href="/">← Volver a Elite Club</a><h1>Administración</h1><p>Productos · {products.length} registros</p></header>
    {error && <p role="alert" className="auth-message">{error} <button onClick={() => setVersion(value => value + 1)} disabled={busy}>Reintentar</button></p>}
    {message && <p role="status">{message}</p>}
    <button className="button dark" disabled={busy} onClick={() => edit(null)}>Agregar producto</button>
    {editing && <section className="admin-editor"><h2>{editing === 'new' ? 'Agregar producto' : 'Editar producto'}</h2>
      <form className="product-form" onSubmit={save} aria-busy={busy}>
        {Object.entries(labels).map(([key, label]) => <label key={key}>{label}<input required disabled={busy} type={['sort_order', 'price'].includes(key) ? 'number' : 'text'} min={key === 'price' ? 0.01 : key === 'sort_order' ? 0 : undefined} step={key === 'price' ? '0.01' : undefined} max={key === 'sort_order' ? 2147483647 : undefined} maxLength={key === 'image' ? 2000 : 200} value={values[key] ?? ''} onChange={event => setValues(current => ({ ...current, [key]: key === 'sort_order' ? Number(event.target.value) : event.target.value }))}/></label>)}
        <div className="admin-actions"><button className="button dark" disabled={busy}>Guardar</button><button type="button" className="button outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></div>
      </form>
    </section>}
    {busy && <p role="status">Cargando…</p>}
    <div className="admin-table"><table><thead><tr><th>Producto</th><th>Marca</th><th>Talle</th><th>Tipo</th><th>Orden</th><th>Acciones</th></tr></thead>
      <tbody>{products.map(product => <tr key={product.id}><td>{product.name}</td><td>{product.brand}</td><td>{product.size}</td><td>{product.type}</td><td>{product.sort_order}</td><td><div className="admin-actions"><button disabled={busy} onClick={() => edit(product)}>Editar</button><button disabled={busy} onClick={() => remove(product)}>Eliminar</button></div></td></tr>)}</tbody></table></div>
  </main>
}
