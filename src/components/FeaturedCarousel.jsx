'use client'
import { useLanguage } from '../lib/i18n'

import { useState } from 'react'

const featuredImages = ['/products/image25.webp', '/products/image54.webp', '/products/image4.webp', '/products/image28.webp', '/products/image50.webp']

export default function FeaturedCarousel({ products, onOpen }) {
  const { t } = useLanguage()
  const [index, setIndex] = useState(0)
  const slides = featuredImages.map(image => products.find(product => product.image === image)).filter(Boolean)
  if (!slides.length) return null
  const product = slides[index % slides.length]
  function move(step) { setIndex(current => (current + step + slides.length) % slides.length) }
  return <section className="campaign" style={{ '--slide-index': index }} aria-label={t("Productos destacados")} aria-roledescription="carrusel"
    onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) } }}>
    <div className="campaign-orbit" aria-hidden="true" /><div className="campaign-orbit orbit-secondary" aria-hidden="true" />
    <div className="campaign-accents" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 0Q22 18 40 20Q22 22 20 40Q18 22 0 20Q18 18 20 0Z" /></svg><svg viewBox="0 0 40 40"><path d="M20 0Q22 18 40 20Q22 22 20 40Q18 22 0 20Q18 18 20 0Z" /></svg></div>
    {slides.map((slide, slideIndex) => <button key={slide.id}
      className={`featured-product ${slideIndex === index ? 'is-active' : ''}`}
      aria-label={t(`Ver destacado: ${slide.name}`)} aria-hidden={slideIndex !== index}
      tabIndex={slideIndex === index ? 0 : -1} disabled={slideIndex !== index}
      onClick={() => onOpen(slide)}>
      <img className="hero-product" src={slide.image} alt={slide.name} fetchPriority={slideIndex === 0 ? 'high' : 'auto'} />
    </button>)}
    <button className="carousel-arrow previous" aria-label={t("Producto anterior")} onClick={() => move(-1)}>←</button>
    <button className="carousel-arrow next" aria-label={t("Producto siguiente")} onClick={() => move(1)}>→</button>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{product.name}</div>
  </section>
}
