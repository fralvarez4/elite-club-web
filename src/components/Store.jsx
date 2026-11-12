'use client'
import { useLanguage, LanguageProvider, LanguageSwitcher } from '../lib/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'

import { addItem, setQuantity, removeItem } from '../lib/cart'
import { groupProducts, sizesFor, resolveCart } from '../lib/catalog'
import { swatchFor } from '../lib/swatches'
import CatalogNavigation from './CatalogNavigation'
import CatalogFilters from './CatalogFilters'
import FeaturedCarousel from './FeaturedCarousel'
import AuthForm from './AuthForm'
import CheckoutFlow from './CheckoutFlow'
import { useAuth } from '../lib/auth'
import { missingProfileFields } from '../lib/profiles'
import { CurrencyProvider, CurrencySwitcher, useCurrency } from '../lib/currency'

function Icon({ name, ...props }) {
  const paths = { bag: 'M5 7h14l1 14H4L5 7ZM9 8V6a3 3 0 0 1 6 0v2', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', arrow: 'M4 12h16m-6-6 6 6-6 6', close: 'm6 6 12 12M6 18 18 6', heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', plus: 'M12 5v14M5 12h14', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7', check: 'm5 12 4 4L19 6' }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.arrow} /></svg>
}
function Logo() {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(null)
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true) }, [])
  return <span>
    <img ref={ref} className="brand-logo" style={{ display: loaded ? 'block' : 'none' }} src="/elite-club-logo.png" alt="Elite Club" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
    {!loaded && <span className="wordmark" aria-label="Elite Club"><span>Elite</span><span>Club</span></span>}
  </span>
}
function Photo({ product, ...props }) { return <img src={product.image} alt={product.name} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/placeholder.svg' }} {...props} /> }
function ProductZoom({ product, compact = false }) {
  const { t } = useLanguage()
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
    aria-label={compact ? undefined : t('Ampliar foto del producto')} aria-pressed={compact ? undefined : zoomed}
    onClick={compact ? undefined : () => setZoomed(current => !current)}
    onKeyDown={compact ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setZoomed(current => !current) } if (event.key === 'Escape' && zoomed) { event.preventDefault(); event.stopPropagation(); setZoomed(false) } }}>
    <Photo product={product} loading={compact ? 'lazy' : 'eager'} />
  </span>
}
function Modal({ title, onClose, children, drawer = false, guardChanges = false, formResetKey }) {
  const { t } = useLanguage()
  const ref = useRef(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous } }, [])
  useEffect(() => { setDirty(false) }, [formResetKey])
  function close() {
    if (guardChanges && dirty && !window.confirm(t('Hay cambios sin guardar. ¿Querés cerrar esta ventana?'))) return
    onClose()
  }
  return <dialog ref={ref} className={drawer ? 'modal drawer' : 'modal'} onInputCapture={() => setDirty(true)} onChangeCapture={() => setDirty(true)} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (!guardChanges && event.target === event.currentTarget) close() }}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label={t("Cerrar")} onClick={close}><Icon name="close" /></button></div>{children}</dialog>
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
  const { t } = useLanguage()
  const oneSize = group.variants.every(v => v.size === '-')
  return <div className={`variant-options ${compact ? 'compact' : ''}`}>
    <fieldset aria-label={t("Colores disponibles")}><div className="variant-buttons colors">{[...new Set(group.variants.map(v => v.color))].map(color => <button className="color-swatch" type="button" key={color} aria-label={color} aria-pressed={selection.color === color} style={{ '--swatch': swatchFor(group.variants.find(v => v.color === color)) }} onClick={() => selection.chooseColor(color)}><span aria-hidden="true" /></button>)}</div></fieldset>
    {!oneSize && selection.colorChosen && <details className="size-picker" key={selection.color} open={!selection.size}><summary>{t(selection.size ? `Talle ${selection.size}` : 'Elegir talle')}</summary><fieldset aria-label={t("Talles")}><div className="variant-buttons sizes">{sizesFor(group, products).map(size => {
      const available = group.variants.some(v => v.color === selection.color && v.size === size)
      return <button type="button" key={size} disabled={!available} aria-pressed={selection.size === size} aria-label={t(`Talle ${size === '-' ? t('Único') : size}${available ? '' : ' · No disponible'}`)} title={t(available ? 'Disponible' : 'No disponible en este color')} onClick={event => { selection.setSize(size); event.currentTarget.closest('details').open = false }}>{size === '-' ? t('Único') : size}</button>
    })}</div></fieldset></details>}
  </div>
}
function ProductPrice({ group, selection }) {
  const { language, t } = useLanguage()
  const { currency, quote } = useCurrency()
  const variants = selection.variant ? [selection.variant] : group.variants.filter(variant => variant.color === selection.color)
  const prices = variants.map(variant => typeof variant.price === 'number' || (typeof variant.price === 'string' && variant.price.trim()) ? Number(variant.price) : NaN)
  const valid = prices.length > 0 && prices.every(price => Number.isFinite(price) && price > 0)
  const displayArs = currency === 'ARS' && quote?.rate > 0
  const formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-AR', { style: 'currency', currency: displayArs ? 'ARS' : 'USD' })
  const low = Math.min(...prices) * (displayArs ? quote.rate : 1)
  const high = Math.max(...prices) * (displayArs ? quote.rate : 1)
  return <p className="product-price">{valid ? (low === high ? formatter.format(low) : formatter.formatRange(low, high)) : t('Precio no disponible')}</p>
}
function ProductCard({ group, products, favorite, isFavorite, onOpen, onAdd, initialSize, initialColor }) {
  const { t } = useLanguage()
  const match = (initialSize || initialColor) ? group.variants.find(v => (!initialSize || v.size === initialSize) && (!initialColor || v.color.split(' / ').includes(initialColor))) : undefined
  const selection = useVariantSelection(group, match ? { color: match.color, size: initialSize || undefined } : {})
  const [added, setAdded] = useState(false)
  return <article className="product-card">
    <div className="product-visual"><button className="photo-button" aria-label={t(`Ver ${group.name}`)} onClick={() => onOpen(group, { color: selection.color, size: selection.size })}><ProductZoom key={selection.photo.id} product={selection.photo} compact /></button><div className="photo-actions"><button className="quick-add" aria-label={t("Agregar al carrito")} title={t("Agregar al carrito")} onClick={() => { if (selection.variant) { onAdd(selection.variant); setAdded(true) } else onOpen(group, { color: selection.color, size: selection.size }) }}><Icon name="plus" /></button><button className={`favorite ${isFavorite ? 'is-favorite' : ''}`} aria-label={t(`${isFavorite ? 'Quitar de' : 'Agregar a'} favoritos: ${group.name}`)} onClick={favorite}><Icon name="heart" fill={isFavorite ? 'currentColor' : 'none'} /></button></div></div>
    <div className="product-meta"><span>{group.brand}</span></div>
    <button className="product-title" onClick={() => onOpen(group, { color: selection.color, size: selection.size })}>{group.name}</button>
    <ProductPrice group={group} selection={selection} />
    <VariantOptions group={group} products={products} selection={selection} compact />
    {added && <span className="card-added" role="status">{t("Agregado al carrito")}</span>}
  </article>
}
function ProductDetail({ group, products, initial, cart, onAdd, onCart, count }) {
  const { t } = useLanguage()
  const selection = useVariantSelection(group, initial)
  const quantity = selection.variant ? cart.find(i => i.id === selection.variant.id)?.quantity || 0 : 0
  return <div className="detail"><ProductZoom key={selection.photo.id} product={selection.photo} /><div><p className="eyebrow">{group.brand}</p><h2>{group.name}</h2>
    <ProductPrice group={group} selection={selection} />
    <VariantOptions group={group} products={products} selection={selection} />
    <button className="button dark" disabled={!selection.variant || quantity >= 99} onClick={() => onAdd(selection.variant)}>{t("Agregar al carrito")} <Icon name="plus" /></button>
    {!selection.variant && <p className="selection-help">{t("Elegí un talle disponible para agregar el producto.")}</p>}
    <div className="detail-cart-status" role="status" aria-live="polite" aria-atomic="true">{quantity > 0 && <><Icon name="check" /><span>{t(`Agregado al carrito · ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`)}</span></>}</div>
    {quantity > 0 && <button className="detail-view-cart" onClick={onCart}>{t(`Ver carrito (${count})`)} <Icon name="arrow" /></button>}
  </div></div>
}
function Store({ initialProducts, initialFilters = {} }) {
  const { t } = useLanguage()
  const { user, loading: authLoading, returningFromEmail, acknowledgeEmailReturn, profile } = useAuth()

  const products = initialProducts
  const [cart, setCart] = useState([])
  const [favorites, setFavorites] = useState([])
  const [storageScope, setStorageScope] = useState(null)
  const previousScope = useRef(null)
  const scope = authLoading ? null : (user?.id || 'guest')
  const ready = Boolean(scope && storageScope === scope)
  const [query, setQuery] = useState(initialFilters.query || '')
  const [category, setCategory] = useState(initialFilters.category || 'Todo')
  const [department, setDepartment] = useState(initialFilters.department || '')
  const [brand, setBrand] = useState(initialFilters.brand || '')
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [sort, setSort] = useState('featured')
  const [onlyFavorites, setOnlyFavorites] = useState(initialFilters.onlyFavorites || false)
  const [modal, setModal] = useState(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [paymentResult, setPaymentResult] = useState(null)
  const loadPayment = useCallback(async id => {
    setPaymentResult({ loading: true })
    try {
      const response = await fetch(`/api/v1/orders/${id}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo consultar el pedido.')
      const { order } = await response.json()
      if (!order || order.id !== id) throw new Error('Respuesta de pedido inválida.')
      setPaymentResult({ order })
      if (order.status === 'approved' && Array.isArray(order.order_items)) {
        const purchased = new Map(order.order_items.map(item => [item.product_id, item.quantity]))
        setCart(current => current.length === purchased.size && current.every(item => purchased.get(item.id) === item.quantity) ? [] : current)
      }
    } catch { setPaymentResult({ error: 'No pudimos verificar el estado del pedido. Volvé a intentar.' }) }
  }, [])
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('order_id')
    if (!['success', 'pending', 'failure'].includes(params.get('checkout')) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return
    setModal({ type: 'payment-result', id })
    void loadPayment(id)
  }, [user, loadPayment])
  useEffect(() => {
    if (returningFromEmail) { setModal({ type: 'auth' }); acknowledgeEmailReturn() }
  }, [returningFromEmail, acknowledgeEmailReturn])
  useEffect(() => {
    if (profile && missingProfileFields(profile).length) setModal({ type: 'auth' })
  }, [profile])
  const [toast, setToast] = useState('')
  const [limit, setLimit] = useState(12)
  useEffect(() => {
    if (!scope) return
    try {
      // La clave antigua mezclaba sesiones: se descarta para no mostrar compras de otra cuenta.
      localStorage.removeItem('elite-club-v1')
      if (scope === 'guest' && previousScope.current && previousScope.current !== 'guest') sessionStorage.removeItem('elite-club-v2:guest')
      const storage = scope === 'guest' ? sessionStorage : localStorage
      const data = JSON.parse(storage.getItem(`elite-club-v2:${scope}`) || 'null')
      let nextCart = Array.isArray(data?.cart) ? data.cart.filter(i => typeof i.id === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 99) : []
      let nextFavorites = Array.isArray(data?.favorites) ? data.favorites.filter(i => typeof i === 'string') : []
      if (scope !== 'guest' && previousScope.current === 'guest') {
        const guest = JSON.parse(sessionStorage.getItem('elite-club-v2:guest') || 'null')
        const counts = new Map(nextCart.map(item => [item.id, item.quantity]))
        for (const item of Array.isArray(guest?.cart) ? guest.cart : []) {
          if (typeof item.id === 'string' && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99) counts.set(item.id, Math.min(99, (counts.get(item.id) || 0) + item.quantity))
        }
        nextCart = [...counts].map(([id, quantity]) => ({ id, quantity }))
        nextFavorites = [...new Set([...nextFavorites, ...(Array.isArray(guest?.favorites) ? guest.favorites.filter(id => typeof id === 'string') : [])])]
        storage.setItem(`elite-club-v2:${scope}`, JSON.stringify({ cart: nextCart, favorites: nextFavorites }))
        sessionStorage.removeItem('elite-club-v2:guest')
      }
      setCart(nextCart)
      setFavorites(nextFavorites)
    } catch { setCart([]); setFavorites([]); setToast('No pudimos recuperar los datos guardados.') }
    previousScope.current = scope
    setStorageScope(scope)
  }, [scope])
  useEffect(() => { if (ready) { try { const storage = scope === 'guest' ? sessionStorage : localStorage; storage.setItem(`elite-club-v2:${scope}`, JSON.stringify({ cart, favorites })) } catch { setToast('El navegador no permite guardar los cambios. Se conservarán durante esta visita.') } } }, [cart, favorites, ready, scope])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer) }, [toast])
  const categories = ['Todo', 'Remeras', 'Hoodies', 'Pantalones', 'Accesorios']
  const matchesCategory = p => category === 'Todo' || (category === 'Remeras' ? /REMERA|TEE|POLO|MUSCULOSA|BODY/.test(p.type) : category === 'Hoodies' ? /HOODIE|BUZO|SWEATER|CAMPERA/.test(p.type) : category === 'Pantalones' ? /PANTAL|SHORT|BERMUDA|JEAN|JOGGER/.test(p.type) : !/REMERA|TEE|POLO|MUSCULOSA|BODY|HOODIE|BUZO|SWEATER|CAMPERA|PANTAL|SHORT|BERMUDA|JEAN|JOGGER/.test(p.type))
  const groups = groupProducts(products)

  const groupPrice = group => Math.min(...group.variants.map(variant => Number(variant.price)).filter(price => Number.isFinite(price) && price > 0))
  const visibleFavorites = ready ? favorites : []
  const filtered = groups.filter(p => (!department || (/\b(wom[ae]n(?:s|'s)?|mujer(?:es)?)\b/i.test(p.name) ? 'Mujer' : 'Hombre') === department) && matchesCategory(p) && (!brand || p.brand === brand) && (!onlyFavorites || p.sourceIds.some(id => visibleFavorites.includes(id))) && p.variants.some(v => (!size || v.size === size) && (!color || v.color.split(' / ').includes(color)) && `${p.name} ${v.name} ${v.color} ${p.brand} ${p.type}`.toLowerCase().includes(query.toLowerCase()))).sort((a,b) => {
    if (sort === 'az') return a.name.localeCompare(b.name)
    if (sort === 'za') return b.name.localeCompare(a.name)
    if (sort.startsWith('price-')) {
      const first = groupPrice(a), second = groupPrice(b)
      if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0
      if (!Number.isFinite(second)) return -1
      return sort === 'price-asc' ? first - second : second - first
    }
    return 0
  })
  const items = resolveCart(ready ? cart : [], groups)
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const cartRows = rows => resolveCart(rows, groups).map(({ id, quantity }) => ({ id, quantity }))
  function add(product) { if (!ready) return; setCart(current => addItem(cartRows(current), product)); setToast(`${product.name}${product.size === '-' ? '' : ` · Talle ${product.size}`} agregado al carrito`) }
  function favorite(group) { if (!ready) return; setFavorites(current => group.sourceIds.some(id => current.includes(id)) ? current.filter(id => !group.sourceIds.includes(id)) : [...current, group.id]) }
  function openProduct(group, initial) { setModal({ type: 'detail', product: group, initial }) }
  function reset() { setQuery(''); setCategory('Todo'); setBrand(''); setSize(''); setColor(''); setSort('featured'); setOnlyFavorites(false); setLimit(12) }
  function navigateCatalog(nextDepartment = '', nextCategory = 'Todo') {
    reset(); setDepartment(nextDepartment); setCategory(nextCategory)
    document.getElementById('catalogo').scrollIntoView()
  }

  return <>
    <LanguageSwitcher />
    <header className="header"><a href="/" className="logo-link" aria-label={t("Elite Club, inicio")}><Logo /></a><CatalogNavigation department={department} categories={categories} onSelect={navigateCatalog} /><div className="header-actions"><button className="icon-button" aria-label={t("Buscar productos")} onClick={() => { document.getElementById('catalogo').scrollIntoView(); document.getElementById('search').focus() }}><Icon name="search" /></button><button className={`icon-button ${onlyFavorites ? 'selected' : ''}`} aria-label={t("Ver favoritos")} onClick={() => { setOnlyFavorites(!onlyFavorites); document.getElementById('catalogo').scrollIntoView() }}><Icon name="heart" /></button><button className={`icon-button account-button ${user ? 'selected' : ''}`} aria-label={t(user ? 'Mi cuenta' : 'Iniciar sesión')} title={user?.email || t('Iniciar sesión')} onClick={() => setModal({ type: 'auth' })}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>{user && <Icon name="check" className="account-check" width="10" height="10" />}</button><button className="cart-button" onClick={() => setModal({ type: 'cart' })}><Icon name="bag" /><span>{t("Carrito")}</span><b>{count}</b></button></div></header>
    <main><FeaturedCarousel products={groups} onOpen={openProduct} />
    <section className="brand-strip" id="marcas" aria-label={t("Marcas de la colección")}>{['NIKE', 'PALM ANGELS', 'OFF WHITE', 'BALENCIAGA', 'CORTEIZ'].map(b => <a href="#catalogo" key={b} onClick={() => { reset(); setBrand(b) }}>{b === 'OFF WHITE' ? 'Off-White™' : b === 'PALM ANGELS' ? 'Palm Angels' : b}</a>)}</section>
    <section className="catalog" id="catalogo"><div className="section-heading"><h1>{t(department || "La colección")}{category !== "Todo" && <span className="heading-category"> / {t(category)}</span>}</h1></div>
    <div className="catalog-toolbar"><form className="search" onSubmit={event => event.preventDefault()}><label className="sr-only" htmlFor="search">{t("Buscar productos")}</label><Icon name="search" /><input id="search" name="q" placeholder={t("Buscá tu próxima pieza")} value={query} onChange={e => { setQuery(e.target.value); setLimit(12) }} />{department && <input type="hidden" name="seccion" value={department} />}<button type="submit" aria-label={t("Enviar búsqueda")}><Icon name="arrow" /></button></form><CurrencySwitcher />
    <CatalogFilters brands={[...new Set(products.map(p => p.brand))].sort()} sizes={[...new Set(products.map(p => p.size))].sort()} colors={[...new Set(groups.flatMap(p => p.variants.flatMap(v => v.color.split(' / '))))].sort()} categories={categories} values={{ brand, size, color, category, sort }} onChange={(field, value) => { ({ brand: setBrand, size: setSize, color: setColor, category: setCategory, sort: setSort })[field](value); setLimit(12) }} onClear={() => { setBrand(''); setSize(''); setColor(''); setCategory('Todo'); setSort('featured'); setLimit(12) }} /></div>
    <div className="results"><span>{t(`${filtered.length} productos${onlyFavorites ? ' · Tus favoritos' : ''}`)}</span>{(query || department || category !== 'Todo' || brand || size || color || onlyFavorites) && <button onClick={reset}>{t("Limpiar filtros ×")}</button>}</div>
    <div className="product-grid">{filtered.slice(0, limit).map(p => <ProductCard key={p.id + ':' + color + ':' + size + ':' + p.variants.map(v => v.name + v.size).join('|')} group={p} products={products} initialSize={size} initialColor={color} isFavorite={p.sourceIds.some(id => visibleFavorites.includes(id))} favorite={() => favorite(p)} onOpen={openProduct} onAdd={add} />)}</div>
    {!filtered.length && <div className="empty"><Icon name="search" width="36" height="36" /><h3>{t("No encontramos esa pieza.")}</h3><p>{t("Probá con otra marca, talle o palabra.")}</p><button className="button dark" onClick={reset}>{t("Ver toda la colección")}</button></div>}{filtered.length > limit && <div className="load-more"><button className="button outline" onClick={() => setLimit(limit + 12)}><span>{t("Descubrir más piezas")}</span><Icon name="plus" /></button><p>{t(`Viendo ${Math.min(limit, filtered.length)} de ${filtered.length} productos`)}</p></div>}</section>
    </main>
    <footer><div className="footer-identity"><a href="/" className="logo-link" aria-label={t("Volver al inicio")}><Logo /></a><span>© {new Date().getFullYear()} Elite Club</span></div></footer>
    {toast && !modal && <div className="toast" role="status"><Icon name="check" />{t(toast)}</div>}
    {modal?.type === 'search' && <Modal title={t("Buscar productos")} onClose={() => setModal(null)}><form className="site-search search" action="/catalogo"><label className="sr-only" htmlFor="header-search">{t("Buscar productos")}</label><input id="header-search" name="q" placeholder={t("Buscá tu próxima pieza")} defaultValue={query} autoFocus /><button type="submit" aria-label={t("Enviar búsqueda")}><Icon name="arrow" /></button></form></Modal>}
    {modal?.type === 'detail' && <Modal title={t("Detalle del producto")} onClose={() => setModal(null)}><ProductDetail group={modal.product} products={products} initial={modal.initial} cart={items} onAdd={add} count={count} onCart={() => setModal({ type: 'cart' })} /></Modal>}
    {modal?.type === 'auth' && <Modal title={t('Mi cuenta')} guardChanges formResetKey={profile} onClose={() => setModal(null)}><AuthForm /></Modal>}
    {modal?.type === 'cart' && <Modal title={t(`Tu carrito (${count})`)} drawer onClose={() => setModal(null)}>{items.length ? <><div className="cart-items">{items.map(({ product: p, quantity }) => <article className="cart-item" key={p.id}><Photo product={p} /><div><p className="eyebrow">{p.brand}</p><h3>{p.name}</h3><div className="cart-variant"><span className="cart-swatch" role="img" aria-label={p.color} style={{ background: swatchFor(p) }} />{p.size !== '-' && <span>{t(`Talle ${p.size}`)}</span>}</div><div className="quantity"><button disabled={quantity === 1} aria-label={t(`Restar ${p.name}`)} onClick={() => setCart(c => setQuantity(cartRows(c), p.id, quantity - 1))}>−</button><span>{quantity}</span><button disabled={quantity === 99} aria-label={t(`Sumar ${p.name}`)} onClick={() => setCart(c => setQuantity(cartRows(c), p.id, quantity + 1))}>+</button></div></div><button className="icon-button" aria-label={t(`Eliminar ${p.name} del carrito`)} onClick={() => setCart(c => removeItem(cartRows(c), p.id))}><Icon name="trash" /></button></article>)}</div><div className="cart-summary"><div><span>{t("Total de prendas")}</span><strong>{count}</strong></div><button className="button dark" onClick={() => setModal({ type: 'checkout' })}>{t("Continuar")} <Icon name="arrow" /></button><button className="text-button" onClick={() => setModal({ type: 'empty-cart' })}>{t("Vaciar carrito")}</button></div></> : <div className="empty"><Icon name="bag" width="44" height="44" /><h3>{t("Carrito vacío")}</h3><p>{t("Todavía no agregaste productos.")}</p><button className="button dark" onClick={() => { setModal(null); document.getElementById('catalogo').scrollIntoView() }}>{t("Explorar colección")}</button></div>}</Modal>}
    {modal?.type === 'empty-cart' && <Modal title={t("¿Vaciar tu carrito?")} onClose={() => setModal({ type: 'cart' })}><p>{t("Se quitarán todas las prendas que elegiste.")}</p><div className="modal-actions"><button className="button outline" onClick={() => setModal({ type: 'cart' })}>{t("Cancelar")}</button><button className="button dark" onClick={() => { setCart([]); setModal({ type: 'cart' }) }}>{t("Vaciar carrito")}</button></div></Modal>}
    {modal?.type === 'checkout' && <Modal title="Finalizar compra" guardChanges onClose={() => { if (!checkoutBusy) setModal(null) }}><CheckoutFlow items={items} onBusy={setCheckoutBusy} onBack={() => setModal({ type: 'cart' })} /></Modal>}
    {modal?.type === 'payment-result' && <Modal title={t('Estado del pedido')} onClose={() => setModal(null)}>
      <p>Pedido {modal.id}</p>
      {paymentResult?.loading ? <p role="status">{t('Verificando pago…')}</p> : paymentResult?.error ? <p role="alert">{t(paymentResult.error)}</p> :
        <p role="status">{t(paymentResult?.order?.status === 'approved' ? 'Pago confirmado por Mercado Pago.' : 'Pago todavía no confirmado. Consultá nuevamente antes de repetir la compra.')}</p>}
      <button className="button outline" onClick={() => loadPayment(modal.id)} disabled={paymentResult?.loading}>{t('Actualizar estado')}</button>
    </Modal>}
  </>
}


export default function LocalizedStore(props) { return <LanguageProvider><CurrencyProvider><Store {...props} /></CurrencyProvider></LanguageProvider> }
