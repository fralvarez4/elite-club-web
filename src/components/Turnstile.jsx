'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../lib/i18n'

// El token se verifica en Supabase Auth; este componente solo obtiene el desafío.
// onToken debe ser estable (por ejemplo, el setter de useState).
export default function Turnstile({ onToken, siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY }) {
  const { t, language } = useLanguage()
  const container = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!ready || !siteKey || !window.turnstile) return
    let active = true
    let widget
    let timer
    let retries = 0
    onToken('')
    const reset = () => {
      if (!active || widget === undefined) return
      try { window.turnstile.reset(widget) }
      catch { setError('No se pudo cargar la verificación. Recargá la página e intentá nuevamente.') }
    }
    const invalidate = (message, retry = true) => {
      if (!active) return
      onToken('')
      setError(message)
      clearTimeout(timer)
      // Un reintento automático por error evita ciclos ante una configuración inválida.
      if (retry) timer = setTimeout(reset, 1000)
    }
    try {
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey, theme: 'light', size: 'compact', language,
        'response-field': false, retry: 'never', 'refresh-expired': 'manual',
        callback: token => {
          if (!active) return
          clearTimeout(timer)
          retries = 0
          setError('')
          onToken(typeof token === 'string' ? token : '')
        },
        'expired-callback': () => invalidate('La verificación venció. Completala nuevamente.'),
        'timeout-callback': () => invalidate('La verificación venció. Completala nuevamente.'),
        'error-callback': () => {
          invalidate('No se pudo completar la verificación. Volvé a intentar.', retries++ === 0)
          return true
        },
      })
    } catch {
      setError('No se pudo cargar la verificación. Recargá la página e intentá nuevamente.')
    }
    return () => {
      active = false
      clearTimeout(timer)
      onToken('')
      if (widget !== undefined) {
        try { window.turnstile.remove(widget) } catch { /* Ya eliminado por el proveedor. */ }
      }
    }
  }, [ready, siteKey, language, onToken, attempt])

  if (!siteKey?.trim()) return <p className="auth-message" role="alert">{t('El acceso con contraseña requiere configurar la verificación de seguridad. Podés usar Google.')}</p>
  return <div className="captcha-field">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
      onReady={() => setReady(true)}
      onError={() => { onToken(''); setError('No se pudo cargar la verificación. Recargá la página e intentá nuevamente.') }} />
    <div ref={container} aria-label={t('Verificación de seguridad')} />
    {error && <><p className="auth-message" role="alert">{t(error)}</p>
      {ready && <button className="text-button" type="button" onClick={() => { onToken(''); setError(''); setAttempt(value => value + 1) }}>{t('Reintentar verificación')}</button>}</>}
  </div>
}
