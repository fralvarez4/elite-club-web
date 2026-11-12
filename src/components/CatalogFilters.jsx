'use client'
import { useLanguage } from '../lib/i18n'
import { ALPHA_SIZES } from '../lib/catalog'

export default function CatalogFilters({ brands, sizes, colors, categories, values, onChange, onClear }) {
  const { t } = useLanguage()
  const count = [values.brand, values.size, values.color, values.category !== 'Todo'].filter(Boolean).length
  return <details className="filter-panel">
    <summary>{t('Filtros')} {count > 0 && <span>({count})</span>}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 6h18M6 12h12M9 18h6" /></svg></summary>
    <div className="filter-content">
      <div className="filter-fields">
        <label>{t("Marca")}<select aria-label={t("Filtrar por marca")} value={values.brand} onChange={e => onChange('brand', e.target.value)}><option value="">{t("Todas las marcas")}</option>{brands.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t("Talle")}<select aria-label={t("Filtrar por talle")} value={values.size} onChange={e => onChange('size', e.target.value)}><option value="">{t("Todos los talles")}</option>{[...sizes].sort((a, b) => { const rank = value => ALPHA_SIZES.includes(value) ? ALPHA_SIZES.indexOf(value) : value === '-' ? 10000 : 100 + Number(value); return rank(a) - rank(b) }).map(value => <option key={value} value={value}>{value === '-' ? t('Único') : value}</option>)}</select></label>
        <label>{t("Color")}<select aria-label={t("Filtrar por color")} value={values.color} onChange={e => onChange('color', e.target.value)}><option value="">{t("Todos los colores")}</option>{colors.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t("Tipo de producto")}<select aria-label={t("Filtrar por tipo de producto")} value={values.category} onChange={e => onChange('category', e.target.value)}>{categories.map(value => <option key={value} value={value}>{t(value === 'Todo' ? 'Todos los productos' : value)}</option>)}</select></label>
        <label>{t("Orden")}<select aria-label={t("Ordenar productos")} value={values.sort} onChange={e => onChange('sort', e.target.value)}><option value="featured">{t("Orden original")}</option><option value="az">{t("Nombre: A–Z")}</option><option value="za">{t("Nombre: Z–A")}</option><option value="price-asc">{t("Precio: menor a mayor")}</option><option value="price-desc">{t("Precio: mayor a menor")}</option></select></label>
      </div>
      <div className="filter-actions"><button type="button" onClick={onClear}>{t("Limpiar filtros")}</button><button type="button" onClick={event => { const panel = event.currentTarget.closest('details'); panel.open = false; panel.querySelector('summary').focus() }}>{t("Ver resultados")}</button></div>
    </div>
  </details>
}
