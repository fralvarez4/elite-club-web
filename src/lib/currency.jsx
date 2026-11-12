'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useLanguage } from './i18n'

const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('USD')
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (currency !== 'ARS') return
    let active = true
    fetch('/api/v1/fx', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('FX unavailable')
      return response.json()
    }).then(data => { if (active) { setQuote(data); setError('') } })
      .catch(() => { if (active) { setQuote(null); setError('Cotización no disponible. Se muestran los precios base en USD.') } })
    return () => { active = false }
  }, [currency])
  return <CurrencyContext.Provider value={{ currency, setCurrency, quote, error }}>{children}</CurrencyContext.Provider>
}

export function useCurrency() { return useContext(CurrencyContext) }

export function CurrencySwitcher() {
  const { t } = useLanguage()
  const { currency, setCurrency, quote, error } = useCurrency()
  return <div className="currency-switcher">
    <label htmlFor="display-currency">{t('Moneda de visualización')}</label>
    <select id="display-currency" value={currency} onChange={event => setCurrency(event.target.value)}>
      <option value="ARS">ARS</option><option value="USD">USD</option>
    </select>
    {currency === 'ARS' && <small role="status">{error ? t(error) : quote ? `${t('ARS indicativo')} · MEP venta ${new Intl.NumberFormat('es-AR').format(quote.rate)} ARS/USD. ${t('El pago se realiza en ARS.')}` : t('Cargando cotización…')}</small>}
  </div>
}
