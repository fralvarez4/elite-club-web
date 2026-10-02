'use client'
import { useEffect, useRef, useState } from 'react'
import { addItem, setQuantity, removeItem } from '../lib/cart'
import { groupProducts, sizesFor, resolveCart } from '../lib/catalog'
import { swatchFor } from '../lib/swatches'

function Icon({ name, ...props }) {
  const paths = { bag: 'M5 7h14l1 14H4L5 7ZM9 8V6a3 3 0 0 1 6 0v2', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', arrow: 'M4 12h16m-6-6 6 6-6 6', close: 'm6 6 12 12M6 18 18 6', heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', plus: 'M12 5v14M5 12h14', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7', check: 'm5 12 4 4L19 6' }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.arrow} /></svg>
}
function Logo() { return <span className="wordmark" aria-label="Elite Club"><span>Elite</span><span>Club</span></span> }
function Photo({ product, ...props }) { return <img src={product.image} alt={product.name} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg' }} {...props} /> }
function ProductZoom({ product, compact = false }) {
  const [zoomed, setZoomed] = useState(false)
  function move(event) {
    if (event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))
    const y = Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100))
    event.currentTarget.style.setProperty('--zoom-x', `${x}%`)
    event.currentTarget.style.setProperty('--zoom-y', `${y}%`)
    setZoomed(true)
  }
  return <span className={`hover-photo ${compact ? 'catalog-zoom' : 'detail-zoom'} ${zoomed ? 'is-zoomed' : ''}`}
    onPointerMove={move} onPointerLeave={() => setZoomed(false)} onBlur={() => setZoomed(false)}
    role={compact ? undefined : 'button'} tabIndex={compact ? undefined : 0}
    aria-label={compact ? undefined : 'Ampliar foto del producto'} aria-pressed={compact ? undefined : zoomed}
    onClick={compact ? undefined : () => setZoomed(current => !current)}
    onKeyDown={compact ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setZoomed(current => !current) } if (event.key === 'Escape' && zoomed) { event.preventDefault(); event.stopPropagation(); setZoomed(false) } }}>
    <Photo product={product} loading={compact ? 'lazy' : 'eager'} />
  </span>
}
function Modal({ title, onClose, children, drawer = false }) {
  const ref = useRef(null)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous } }, [])
  return <dialog ref={ref} className={drawer ? 'modal drawer' : 'modal'} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>
}
function useVariantSelection(group, initial = {}) {
  const [color, setColor] = useState(initial.color || group.variants[0].color)
  const [colorChosen, setColorChosen] = useState(Boolean(initial.color || initial.size))
  const [size, setSize] = useState(initial.size || (group.variants.every(v => v.size === '-') ? '-' : ''))
  const variant = group.variants.find(v => v.color === color && v.size === size)
  const photo = variant || group.variants.find(v => v.color === color) || group.variants[0]
  function chooseColor(next) {
    setColorChosen(true)
    setColor(next)
    if (!group.variants.some(v => v.color === next && v.size === size)) setSize(group.variants.every(v => v.size === '-') ? '-' : '')
  }
  return { color, colorChosen, size, variant, photo, chooseColor, setSize }
}
function VariantOptions({ group, products, selection, compact = false }) {
  const oneSize = group.variants.every(v => v.size === '-')
  return <div className={`variant-options ${compact ? 'compact' : ''}`}>
    <fieldset aria-label="Colores disponibles"><div className="variant-buttons colors">{[...new Set(group.variants.map(v => v.color))].map(color => <button className="color-swatch" type="button" key={color} aria-label={color} aria-pressed={selection.color === color} style={{ '--swatch': swatchFor(group.variants.find(v => v.color === color)) }} onClick={() => selection.chooseColor(color)}><span aria-hidden="true" /></button>)}</div></fieldset>
    {!oneSize && selection.colorChosen && <details className="size-picker" key={selection.color} open={!selection.size}><summary>{selection.size ? `Talle ${selection.size}` : 'Elegir talle'}</summary><fieldset aria-label="Talles"><div className="variant-buttons sizes">{sizesFor(group, products).map(size => {
      const available = group.variants.some(v => v.color === selection.color && v.size === size)
      return <button type="button" key={size} disabled={!available} aria-pressed={selection.size === size} aria-label={`Talle ${size === '-' ? 'Único' : size}${available ? '' : ' · No disponible'}`} title={available ? 'Disponible' : 'No disponible en este color'} onClick={event => { selection.setSize(size); event.currentTarget.closest('details').open = false }}>{size === '-' ? 'Único' : size}</button>
    })}</div></fieldset></details>}
  </div>
}
function ProductCard({ group, products, favorite, isFavorite, onOpen, onAdd, initialSize }) {
  const match = group.variants.find(v => v.size === initialSize)
  const selection = useVariantSelection(group, match || {})
  const [added, setAdded] = useState(false)
  return <article className="product-card">
    <div className="product-visual"><button className="photo-button" aria-label={`Ver ${group.name}`} onClick={() => onOpen(group, { color: selection.color, size: selection.size })}><ProductZoom key={selection.photo.id} product={selection.photo} compact /></button><div className="photo-actions"><button className="quick-add" aria-label="Agregar al carrito" title="Agregar al carrito" onClick={() => { if (selection.variant) { onAdd(selection.variant); setAdded(true) } else onOpen(group, { color: selection.color, size: selection.size }) }}><Icon name="plus" /></button><button className={`favorite ${isFavorite ? 'is-favorite' : ''}`} aria-label={`${isFavorite ? 'Quitar de' : 'Agregar a'} favoritos: ${group.name}`} onClick={favorite}><Icon name="heart" fill={isFavorite ? 'currentColor' : 'none'} /></button></div></div>
    <div className="product-meta"><span>{group.brand}</span></div>
    <button className="product-title" onClick={() => onOpen(group, { color: selection.color, size: selection.size })}>{group.name}</button>
    <VariantOptions group={group} products={products} selection={selection} compact />
    {added && <span className="card-added" role="status">Agregado al carrito</span>}
  </article>
}
function ProductDetail({ group, products, initial, cart, onAdd, onCart, count }) {
  const selection = useVariantSelection(group, initial)
  const quantity = selection.variant ? cart.find(i => i.id === selection.variant.id)?.quantity || 0 : 0
  return <div className="detail"><ProductZoom key={selection.photo.id} product={selection.photo} /><div><p className="eyebrow">{group.brand}</p><h2>{group.name}</h2>
    <VariantOptions group={group} products={products} selection={selection} />
    <button className="button dark" disabled={!selection.variant || quantity >= 99} onClick={() => onAdd(selection.variant)}>Agregar al carrito <Icon name="plus" /></button>
    {!selection.variant && <p className="selection-help">Elegí un talle disponible para agregar el producto.</p>}
    <div className="detail-cart-status" role="status" aria-live="polite" aria-atomic="true">{quantity > 0 && <><Icon name="check" /><span>Agregado al carrito · {quantity} {quantity === 1 ? 'unidad' : 'unidades'}</span></>}</div>
    {quantity > 0 && <button className="detail-view-cart" onClick={onCart}>Ver carrito ({count}) <Icon name="arrow" /></button>}
  </div></div>
}
export default function Store({ initialProducts }) {
  const products = initialProducts
  const [cart, setCart] = useState([])
  const [favorites, setFavorites] = useState([])
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todo')
  const [brand, setBrand] = useState('')
  const [size, setSize] = useState('')
  const [sort, setSort] = useState('featured')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [limit, setLimit] = useState(12)
  useEffect(() => {
    try { const data = JSON.parse(localStorage.getItem('elite-club-v1') || 'null'); if (data) { if (Array.isArray(data.cart)) setCart(data.cart.filter(i => typeof i.id === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 99)); if (Array.isArray(data.favorites)) setFavorites(data.favorites.filter(i => typeof i === 'string')) } } catch { setToast('No pudimos recuperar los datos guardados.') } setReady(true)
  }, [])
  useEffect(() => { if (ready) { try { localStorage.setItem('elite-club-v1', JSON.stringify({ cart, favorites })) } catch { setToast('El navegador no permite guardar los cambios. Se conservarán durante esta visita.') } } }, [cart, favorites, ready])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer) }, [toast])
  const categories = ['Todo', 'Remeras', 'Hoodies', 'Pantalones', 'Accesorios']
  const matchesCategory = p => category === 'Todo' || (category === 'Remeras' ? /REMERA|TEE|POLO|MUSCULOSA|BODY/.test(p.type) : category === 'Hoodies' ? /HOODIE|BUZO|SWEATER|CAMPERA/.test(p.type) : category === 'Pantalones' ? /PANTAL|SHORT|BERMUDA|JEAN|JOGGER/.test(p.type) : !/REMERA|TEE|POLO|MUSCULOSA|BODY|HOODIE|BUZO|SWEATER|CAMPERA|PANTAL|SHORT|BERMUDA|JEAN|JOGGER/.test(p.type))
  const groups = groupProducts(products)
  const filtered = groups.filter(p => matchesCategory(p) && (!brand || p.brand === brand) && (!onlyFavorites || p.sourceIds.some(id => favorites.includes(id))) && p.variants.some(v => (!size || v.size === size) && `${p.name} ${v.name} ${v.color} ${p.brand} ${p.type}`.toLowerCase().includes(query.toLowerCase()))).sort((a,b) => sort === 'az' ? a.name.localeCompare(b.name) : sort === 'za' ? b.name.localeCompare(a.name) : 0)
  const items = resolveCart(cart, groups)
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const cartRows = rows => resolveCart(rows, groups).map(({ id, quantity }) => ({ id, quantity }))
  function add(product) { setCart(current => addItem(cartRows(current), product)); setToast(`${product.name}${product.size === '-' ? '' : ` · Talle ${product.size}`} agregado al carrito`) }
  function favorite(group) { setFavorites(current => group.sourceIds.some(id => current.includes(id)) ? current.filter(id => !group.sourceIds.includes(id)) : [...current, group.id]) }
  function openProduct(group, initial) { setModal({ type: 'detail', product: group, initial }) }
  function reset() { setQuery(''); setCategory('Todo'); setBrand(''); setSize(''); setOnlyFavorites(false); setLimit(12) }

  return <>
    <header className="header"><a href="#" className="logo-link" aria-label="Elite Club, inicio"><Logo /></a><nav aria-label="Navegación principal"><a href="#catalogo" className="nav-active" onClick={reset}>Colección</a><a href="#marcas">Marcas</a></nav><div className="header-actions"><button className="icon-button" aria-label="Buscar productos" onClick={() => { document.getElementById('catalogo').scrollIntoView(); document.getElementById('search').focus() }}><Icon name="search" /></button><button className={`icon-button ${onlyFavorites ? 'selected' : ''}`} aria-label="Ver favoritos" onClick={() => { setOnlyFavorites(!onlyFavorites); document.getElementById('catalogo').scrollIntoView() }}><Icon name="heart" /></button><button className="cart-button" onClick={() => setModal({ type: 'cart' })}><Icon name="bag" /><span>Carrito</span><b>{count}</b></button></div></header>
    <main><section className="campaign"><div className="campaign-images"><div><img className="hero-product" src="/products/image25.webp" alt="Hoodie Balenciaga negro con letras naranjas" /></div><div><img src="/products/image25.webp" alt="Hoodie Balenciaga completo" /></div></div></section>
    <section className="brand-strip" id="marcas" aria-label="Marcas de la colección">{['NIKE', 'PALM ANGELS', 'OFF WHITE', 'BALENCIAGA', 'CORTEIZ'].map(b => <a href="#catalogo" key={b} onClick={() => { reset(); setBrand(b) }}>{b === 'OFF WHITE' ? 'Off-White™' : b === 'PALM ANGELS' ? 'Palm Angels' : b}</a>)}</section>
    <section className="catalog" id="catalogo"><div className="section-heading"><h1>La colección</h1></div><div className="catalog-tabs"><div className="tabs" role="group" aria-label="Categorías">{categories.map(c => <button className={category === c ? 'active' : ''} key={c} onClick={() => { setCategory(c); setLimit(12) }}>{c}{c === 'Todo' && <small>{groups.length}</small>}</button>)}</div></div>
    <div className="filters"><label className="search"><Icon name="search" /><input id="search" placeholder="Buscá tu próxima pieza" value={query} onChange={e => { setQuery(e.target.value); setLimit(12) }} /></label><select aria-label="Filtrar por marca" value={brand} onChange={e => setBrand(e.target.value)}><option value="">Todas las marcas</option>{[...new Set(products.map(p => p.brand))].sort().map(b => <option key={b}>{b}</option>)}</select><select aria-label="Filtrar por talle" value={size} onChange={e => setSize(e.target.value)}><option value="">Todos los talles</option>{[...new Set(products.map(p => p.size))].sort().map(s => <option key={s} value={s}>{s === '-' ? 'Único' : s}</option>)}</select><select aria-label="Ordenar productos" value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Orden original</option><option value="az">Nombre: A–Z</option><option value="za">Nombre: Z–A</option></select></div>
    <div className="results"><span>{filtered.length} productos{onlyFavorites && ' · Tus favoritos'}</span>{(query || category !== 'Todo' || brand || size || onlyFavorites) && <button onClick={reset}>Limpiar filtros ×</button>}</div>
    <div className="product-grid">{filtered.slice(0, limit).map(p => <ProductCard key={p.id + ':' + size + ':' + p.variants.map(v => v.name + v.size).join('|')} group={p} products={products} initialSize={size} isFavorite={p.sourceIds.some(id => favorites.includes(id))} favorite={() => favorite(p)} onOpen={openProduct} onAdd={add} />)}</div>
    {!filtered.length && <div className="empty"><Icon name="search" width="36" height="36" /><h3>No encontramos esa pieza.</h3><p>Probá con otra marca, talle o palabra.</p><button className="button dark" onClick={reset}>Ver toda la colección</button></div>}{filtered.length > limit && <div className="load-more"><button className="button outline" onClick={() => setLimit(limit + 12)}>Descubrir más piezas <Icon name="plus" /></button><p>Viendo {Math.min(limit, filtered.length)} de {filtered.length} productos</p></div>}</section>
    </main>
    <footer><a href="#" className="logo-link" aria-label="Volver al inicio"><Logo /></a><span>© {new Date().getFullYear()} Elite Club</span></footer>
    {toast && !modal && <div className="toast" role="status"><Icon name="check" />{toast}</div>}
    {modal?.type === 'detail' && <Modal title="Detalle del producto" onClose={() => setModal(null)}><ProductDetail group={modal.product} products={products} initial={modal.initial} cart={items} onAdd={add} count={count} onCart={() => setModal({ type: 'cart' })} /></Modal>}
    {modal?.type === 'cart' && <Modal title={`Tu carrito (${count})`} drawer onClose={() => setModal(null)}>{items.length ? <><div className="cart-items">{items.map(({ product: p, quantity }) => <article className="cart-item" key={p.id}><Photo product={p} /><div><p className="eyebrow">{p.brand}</p><h3>{p.name}</h3><div className="cart-variant"><span className="cart-swatch" role="img" aria-label={p.color} style={{ background: swatchFor(p) }} />{p.size !== '-' && <span>Talle {p.size}</span>}</div><div className="quantity"><button disabled={quantity === 1} aria-label={`Restar ${p.name}`} onClick={() => setCart(c => setQuantity(cartRows(c), p.id, quantity - 1))}>−</button><span>{quantity}</span><button disabled={quantity === 99} aria-label={`Sumar ${p.name}`} onClick={() => setCart(c => setQuantity(cartRows(c), p.id, quantity + 1))}>+</button></div></div><button className="icon-button" aria-label={`Eliminar ${p.name} del carrito`} onClick={() => setCart(c => removeItem(cartRows(c), p.id))}><Icon name="trash" /></button></article>)}</div><div className="cart-summary"><div><span>Total de prendas</span><strong>{count}</strong></div><p>Compra de demostración. Este catálogo no incluye precios ni procesa pagos.</p><button className="button dark" onClick={() => { setCart([]); setModal({ type: 'success', count }) }}>Confirmar pedido simulado <Icon name="arrow" /></button><button className="text-button" onClick={() => setModal({ type: 'empty-cart' })}>Vaciar carrito</button></div></> : <div className="empty"><Icon name="bag" width="44" height="44" /><h3>Carrito vacío</h3><p>Todavía no agregaste productos.</p><button className="button dark" onClick={() => { setModal(null); document.getElementById('catalogo').scrollIntoView() }}>Explorar colección</button></div>}</Modal>}
    {modal?.type === 'empty-cart' && <Modal title="¿Vaciar tu carrito?" onClose={() => setModal({ type: 'cart' })}><p>Se quitarán todas las prendas que elegiste.</p><div className="modal-actions"><button className="button outline" onClick={() => setModal({ type: 'cart' })}>Cancelar</button><button className="button dark" onClick={() => { setCart([]); setModal({ type: 'cart' }) }}>Vaciar carrito</button></div></Modal>}
    {modal?.type === 'success' && <Modal title="Pedido confirmado" onClose={() => setModal(null)}><div className="empty"><Icon name="check" width="48" height="48" /><h3>¡Pedido simulado confirmado!</h3><p>Elegiste {modal.count} prendas. El carrito quedó vacío.<br />No se realizó ningún cobro ni envío.</p><button className="button dark" onClick={() => setModal(null)}>Seguir explorando</button></div></Modal>}
  </>
}

