'use client'
import { useLanguage } from '../lib/i18n'

import { useEffect, useRef, useState } from 'react'

export default function CatalogNavigation({ categories, onSelect, department }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(null)
  const [ready, setReady] = useState(false)
  const nav = useRef(null)
  useEffect(() => {
    setReady(true)
    function dismiss(event) { if (!nav.current?.contains(event.target)) setOpen(null) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  return <nav ref={nav} className="shop-navigation" aria-label={t("Navegación principal")}
    onPointerLeave={event => { if (event.pointerType === 'mouse' && !nav.current.contains(document.activeElement)) setOpen(null) }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null) }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); nav.current.querySelector(`[aria-controls="menu-${open}"]`)?.focus(); setOpen(null) } }}>
    {['Hombre', 'Mujer'].map(section => <div className="nav-department" key={section}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(section) }}>
      <button disabled={!ready} className={`nav-trigger ${department === section ? 'is-selected' : ''}`} aria-pressed={department === section} aria-expanded={open === section} aria-controls={`menu-${section}`}
        onFocus={() => setOpen(section)} onClick={() => { onSelect(section, 'Todo'); setOpen(null) }}><span>{t(section)}</span></button>
      <div id={`menu-${section}`} className="product-menu" hidden={open !== section}>
        <div className="menu-heading">{t(section)}<button aria-label={t("Cerrar menú")} onClick={() => setOpen(null)}>×</button></div>
        <div className="menu-categories">{categories.map(category => <a href={`/catalogo?seccion=${section}&categoria=${encodeURIComponent(category)}`} key={category}
          onClick={event => { event.preventDefault(); onSelect(section, category); setOpen(null) }}>
          {t(category === 'Todo' ? 'Ver todo' : category)}<span aria-hidden="true">↗</span>
        </a>)}</div>
      </div>
    </div>)}
  </nav>
}
