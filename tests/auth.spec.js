import { test, expect } from '@playwright/test'
import { mockTurnstile } from './fixtures/turnstile.js'

test.beforeEach(async ({ context }) => { await mockTurnstile(context) })

// Se intercepta Auth antes de abrir la página: estas pruebas no crean cuentas ni envían emails.
const email = 'alumno@example.com'
const password = 'Prueba-local-2026!'
const user = {
  id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated',
  email, email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-01-01T00:00:00Z', identities: [],
}
function session() {
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })}.dGVzdA`,
    refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user,
  }
}
async function mockAuth(context) {
  const state = { requests: [], loginError: null, logoutError: false, signupError: null, confirmationRequired: true,
    profileRequests: [], profileError: false,
    profile: { id: '1', user_id: user.id, first_name: 'María', last_name: 'Pérez', birth_date: '2000-02-29', role: 'user' } }
  await context.route('**/rest/v1/profiles?*', async route => {
    const request = route.request()
    state.profileRequests.push({ method: request.method(), body: request.postDataJSON() })
    if (state.profileError) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) })
    if (request.method() === 'PATCH') state.profile = { ...state.profile, ...request.postDataJSON() }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(state.profile) })
  })
  await context.route('**/auth/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const body = request.postDataJSON()
    state.requests.push({ path: url.pathname, search: url.searchParams, body })
    const send = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' }, body: JSON.stringify(value) })
    if ((url.pathname.endsWith('/signup') || url.searchParams.get('grant_type') === 'password') && !body?.gotrue_meta_security?.captcha_token?.startsWith('test-token-')) return send({ code: 'captcha_failed', msg: 'Rejected' }, 400)
    if (url.pathname.endsWith('/signup')) {
      if (state.signupError) return send({ code: state.signupError, msg: 'Registration rejected' }, 422)
      return send(state.confirmationRequired ? { ...user, email_confirmed_at: null } : session())
    }
    if (url.pathname.endsWith('/token')) {
      if (state.loginError && url.searchParams.get('grant_type') === 'password') return send({ code: state.loginError, msg: 'Login rejected' }, 400)
      return send(session())
    }
    if (url.pathname.endsWith('/user')) return send(user)
    if (url.pathname.endsWith('/logout')) {
      if (state.logoutError) return send({ code: 'unexpected_failure', msg: 'Logout rejected' }, 500)
      return route.fulfill({ status: 204 })
    }
    return send({ code: 'unexpected_request', msg: 'Unexpected Auth request in test' }, 400)
  })
  return state
}
async function openLogin(page) {
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Email', { exact: true })).toBeVisible()
  return dialog
}
async function fillCredentials(dialog) {
  await dialog.getByLabel('Email', { exact: true }).fill(email)
  await dialog.getByLabel('Contraseña', { exact: true }).fill(password)
}
async function fillRegistration(dialog) {
  await dialog.getByLabel('Nombre', { exact: true }).fill('  María José  ')
  await dialog.getByLabel('Apellido', { exact: true }).fill("  O'Connor  ")
  await dialog.getByLabel('Fecha de nacimiento', { exact: true }).fill('2000-02-29')
  await fillCredentials(dialog)
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
}
async function login(page) {
  const dialog = await openLogin(page)
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByText(email, { exact: true })).toBeVisible()
  return dialog
}

test('Turnstile prevents missing tokens, rejects invalid tokens and renews after failure', async ({ page, context }) => {
  const state = await mockAuth(context)
  await page.goto('/')
  const dialog = await openLogin(page)
  await expect.poll(() => page.evaluate(() => window.captchaTest?.renders || 0)).toBeGreaterThan(0)
  await page.evaluate(() => { window.captchaTest.auto = false; window.captchaTest.expire() })
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: 'Completá la verificación' })).toBeVisible()
  expect(state.requests.filter(r => r.search.get('grant_type') === 'password')).toHaveLength(0)
  await page.evaluate(() => window.captchaTest.solve())
  state.loginError = 'captcha_failed'
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: 'fue rechazada' })).toBeVisible()
  const first = state.requests.find(r => r.search.get('grant_type') === 'password')
  expect(first.body.gotrue_meta_security.captcha_token).toMatch(/^test-token-/)
  await expect(dialog.getByLabel('Contraseña', { exact: true })).toHaveValue('')
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect(state.requests.filter(r => r.search.get('grant_type') === 'password')).toHaveLength(1)
  state.loginError = null
  await page.evaluate(() => window.captchaTest.solve())
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByText(email, { exact: true })).toBeVisible()
  const requests = state.requests.filter(r => r.search.get('grant_type') === 'password')
  expect(requests[1].body.gotrue_meta_security.captcha_token).not.toBe(first.body.gotrue_meta_security.captcha_token)
})

test('Turnstile expiration and errors invalidate tokens and reset the widget', async ({ page, context }) => {
  await mockAuth(context)
  await page.goto('/')
  const dialog = await openLogin(page)
  await expect.poll(() => page.evaluate(() => window.captchaTest?.renders || 0)).toBeGreaterThan(0)
  await page.evaluate(() => { window.captchaTest.auto = false; window.captchaTest.expire() })
  await expect(dialog.getByRole('alert')).toContainText('venció')
  await expect.poll(() => page.evaluate(() => window.captchaTest.resets)).toBeGreaterThan(0)
  await page.evaluate(() => window.captchaTest.solve())
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  const resets = await page.evaluate(() => window.captchaTest.resets)
  await page.evaluate(() => window.captchaTest.fail())
  await expect(dialog.getByRole('alert')).toContainText('No se pudo completar')
  await expect.poll(() => page.evaluate(() => window.captchaTest.resets)).toBeGreaterThan(resets)
  await dialog.getByRole('button', { name: 'Reintentar verificación' }).click()
  await expect.poll(() => page.evaluate(() => window.captchaTest.removes)).toBeGreaterThan(0)
  await page.evaluate(() => window.captchaTest.solve())
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('blocked Turnstile script does not allow password login or block Google OAuth', async ({ page, context, baseURL }) => {
  const state = await mockAuth(context)
  await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.abort())
  await context.route('**/auth/v1/authorize?*', route => route.fulfill({ contentType: 'text/html', body: '<p>Google fixture</p>' }))
  await page.goto('/')
  const dialog = await openLogin(page)
  await expect(dialog.getByRole('alert')).toContainText('No se pudo cargar')
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect(state.requests.filter(r => r.search.get('grant_type') === 'password')).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Continuar con Google' }).click()
  await expect(page.getByText('Google fixture')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(new URL('/auth/callback?flow=oauth', baseURL).href)
})

test('signup shows six password conditions and sends a Turnstile token only to Auth', async ({ page, context }) => {
  const state = await mockAuth(context)
  await page.goto('/')
  const dialog = await openLogin(page)
  await dialog.getByRole('button', { name: 'No tengo cuenta. Crear cuenta' }).click()
  await fillRegistration(dialog)
  await expect(dialog.getByRole('list', { name: 'Requisitos de contraseña' }).locator('li')).toHaveCount(6)
  for (const weak of ['lowercase123!', 'UPPERCASE123!', 'OnlyLetters!', 'LongPassword1']) {
    await dialog.getByLabel('Contraseña', { exact: true }).fill(weak)
    await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill(weak)
    await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Usá al menos 10')
  }
  expect(state.requests.filter(r => r.path.endsWith('/signup'))).toHaveLength(0)
  await fillRegistration(dialog)
  await page.evaluate(() => window.captchaTest.solve())
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Revisá tu email')
  const signup = state.requests.find(r => r.path.endsWith('/signup'))
  expect(signup.body.gotrue_meta_security.captcha_token).toMatch(/^test-token-/)
  expect(JSON.stringify(signup.body.data)).not.toContain('test-token-')
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-token-')
})

test('public catalog and account modal work on mobile without login or overflow', async ({ page, context }) => {
  await mockAuth(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.product-card')).toHaveCount(12)
  const dialog = await openLogin(page)
  await expect(dialog.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const account = await page.locator('.account-button').boundingBox()
  const logo = await page.locator('header .logo-link').boundingBox()
  expect(account.x).toBeGreaterThanOrEqual(logo.x + logo.width)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('signup requests confirmation and never stores the password or invents a session', async ({ page, context }) => {
  const state = await mockAuth(context)
  await page.goto('/')
  const dialog = await openLogin(page)
  await dialog.getByRole('button', { name: 'No tengo cuenta. Crear cuenta', exact: true }).click()
  await fillRegistration(dialog)
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Revisá tu email')
  await expect(dialog.getByLabel('Contraseña', { exact: true })).toHaveValue('')
  await expect(page.locator('header').getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()
  const signup = state.requests.find(request => request.path.endsWith('/signup'))
  expect(signup.body).toMatchObject({ email, password })
  expect(signup.body.data).toEqual({ first_name: 'María José', last_name: "O'Connor", birth_date: '2000-02-29' })
  expect(JSON.stringify(signup.body.data)).not.toContain(password)
  await expect(dialog.getByLabel('Confirmar contraseña', { exact: true })).toHaveValue('')
  expect(signup.search.get('redirect_to')).toBe(new URL('/auth/callback?flow=confirm', page.url()).href)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(password)
  await dialog.getByRole('button', { name: 'Ya tengo cuenta. Iniciar sesión', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})

test('signup with confirmation disabled accepts the session returned by Supabase', async ({ page, context }) => {
  const state = await mockAuth(context)
  state.confirmationRequired = false
  await page.goto('/')
  const dialog = await openLogin(page)
  await dialog.getByRole('button', { name: 'No tengo cuenta. Crear cuenta', exact: true }).click()
  await fillRegistration(dialog)
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(dialog.getByText(email, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
})

test('signup validates required names, birth date and matching passwords before contacting Auth', async ({ page, context }) => {
  const state = await mockAuth(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const dialog = await openLogin(page)
  await dialog.getByRole('button', { name: 'No tengo cuenta. Crear cuenta', exact: true }).click()
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  expect(state.requests.filter(request => request.path.endsWith('/signup'))).toHaveLength(0)
  await fillRegistration(dialog)
  await dialog.getByLabel('Nombre', { exact: true }).fill('   ')
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Completá tu nombre y apellido.')
  await dialog.getByLabel('Nombre', { exact: true }).fill('María José')
  await dialog.getByLabel('Fecha de nacimiento', { exact: true }).fill('2999-01-01')
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  expect(await dialog.getByLabel('Fecha de nacimiento', { exact: true }).evaluate(input => input.validity.rangeOverflow)).toBe(true)
  await dialog.getByLabel('Fecha de nacimiento', { exact: true }).fill('2000-02-29')
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill('Different-password!')
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Las contraseñas no coinciden.')
  expect(state.requests.filter(request => request.path.endsWith('/signup'))).toHaveLength(0)
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Revisá tu email')
  expect(state.requests.filter(request => request.path.endsWith('/signup'))).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Ya tengo cuenta. Iniciar sesión', exact: true }).click()
  await expect(dialog.locator('input')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('login persists across reload and routes; logout preserves cart and favorites', async ({ page, context }) => {
  const state = await mockAuth(context)
  const localCart = { cart: [{ id: 'elite-2', quantity: 2 }], favorites: ['elite-2'] }
  await context.addInitScript(value => {
    if (!localStorage.getItem('elite-club-v1')) localStorage.setItem('elite-club-v1', JSON.stringify(value))
  }, localCart)
  await page.goto('/')
  await login(page)
  await page.reload()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Mi cuenta')
  await page.goto('/catalogo?seccion=Hombre')
  await expect(page.locator('.account-button')).toHaveAccessibleName('Mi cuenta')
  await page.locator('.account-button').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Cerraste sesión')
  expect(state.requests.some(request => request.path.endsWith('/logout') && request.search.get('scope') === 'local')).toBe(true)
  await page.reload()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Iniciar sesión')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('elite-club-v1')))).toEqual(localCart)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(password)
})

test('email return restores session, opens account and removes tokens from URL', async ({ page, context }) => {
  await mockAuth(context)
  const returned = session()
  const fragment = new URLSearchParams({ access_token: returned.access_token, refresh_token: returned.refresh_token, expires_in: '3600', token_type: 'bearer', type: 'signup' })
  await page.goto(`/?auth=confirm#${fragment}`)
  await expect(page.getByRole('dialog').getByText(email, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(new URL('/', page.url()).href)
  await page.reload()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Mi cuenta')
})

test('legacy localStorage sessions migrate once to cookies and admin navigation follows profile role', async ({ page, context }) => {
  const state = await mockAuth(context)
  state.profile.role = 'admin'
  await page.goto('/')
  const url = await page.evaluate(() => Object.keys(localStorage))
  expect(url.some(key => /^sb-.*-auth-token$/.test(key))).toBe(false)
  // El host de Auth se obtiene de la llamada real del cliente, sin leer .env.local.
  await login(page)
  await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible()
  const cookie = (await context.cookies()).find(cookie => /^sb-.*-auth-token$/.test(cookie.name))
  await context.clearCookies()
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: cookie.name, value: session() })
  await page.reload()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Mi cuenta')
  expect(await page.evaluate(key => localStorage.getItem(key), cookie.name)).toBeNull()
  expect((await context.cookies()).some(item => item.name === cookie.name)).toBe(true)
  await page.locator('.account-button').click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.reload()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Iniciar sesión')
})

test('login errors and remote logout failure are visible and reflect the SDK session state', async ({ page, context }) => {
  const state = await mockAuth(context)
  state.loginError = 'invalid_credentials'
  await page.goto('/')
  const dialog = await openLogin(page)
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('El email o la contraseña son incorrectos')
  state.loginError = 'email_not_confirmed'
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Confirmá tu email')
  state.loginError = null
  await fillCredentials(dialog)
  await dialog.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(dialog.getByText(email, { exact: true })).toBeVisible()
  state.logoutError = true
  await dialog.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(dialog.getByRole('alert')).toContainText('La sesión se cerró en este navegador', { timeout: 15000 })
  await expect(page.locator('.account-button')).toHaveAccessibleName('Iniciar sesión')
})

test('expired confirmation links show an error while leaving the catalog public', async ({ page, context }) => {
  await mockAuth(context)
  await page.goto('/?auth=confirm#error=access_denied&error_code=otp_expired&error_description=Expired')
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('El enlace de confirmación venció')
  await expect(page).toHaveURL(new URL('/', page.url()).href)
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(12)
})

test('SDK refreshes an expired session and synchronizes logout between tabs', async ({ page, context }) => {
  const state = await mockAuth(context)
  await page.goto('/')
  await login(page)
  const cookie = (await context.cookies()).find(cookie => /^sb-.*-auth-token$/.test(cookie.name))
  const stored = JSON.parse(Buffer.from(cookie.value.slice('base64-'.length), 'base64url').toString())
  stored.expires_at = Math.floor(Date.now() / 1000) - 60
  await context.addCookies([{ ...cookie, value: `base64-${Buffer.from(JSON.stringify(stored)).toString('base64url')}` }])
  await page.reload()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Mi cuenta')
  expect(state.requests.some(request => request.search.get('grant_type') === 'refresh_token')).toBe(true)
  const other = await context.newPage()
  await other.goto('/catalogo')
  await expect(other.locator('.account-button')).toHaveAccessibleName('Mi cuenta')
  await other.locator('.account-button').click()
  await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.locator('.account-button')).toHaveAccessibleName('Iniciar sesión')
})

test('auth copy follows the existing English language setting', async ({ page, context }) => {
  const state = await mockAuth(context)
  state.loginError = 'invalid_credentials'
  await context.addInitScript(() => localStorage.setItem('elite-club-language', 'en'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email', { exact: true }).fill(email)
  await dialog.getByLabel('Password', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('The email or password is incorrect.')
})

test('missing profile fields open a form that only updates those fields and keeps customer ID', async ({ page, context }) => {
  const state = await mockAuth(context)
  state.profile.last_name = null
  state.profile.birth_date = null
  await page.goto('/')
  const dialog = await login(page)
  await expect(dialog.getByRole('heading', { name: 'Completá tu perfil' })).toBeVisible()
  await expect(dialog.getByLabel('Nombre', { exact: true })).toHaveCount(0)
  await dialog.getByLabel('Apellido', { exact: true }).fill('García')
  await dialog.getByLabel('Fecha de nacimiento', { exact: true }).fill('1998-12-04')
  await dialog.getByRole('button', { name: 'Guardar perfil' }).click()
  await expect(dialog.getByRole('heading', { name: 'Completá tu perfil' })).toHaveCount(0)
  await expect(dialog.getByText('EC-000001', { exact: true })).toBeVisible()
  await expect(dialog.getByText('04/12/1998', { exact: true })).toBeVisible()
  expect(state.profileRequests.filter(request => request.method === 'PATCH').map(request => request.body)).toEqual([{ last_name: 'García', birth_date: '1998-12-04' }])
  expect(state.profileRequests.some(request => request.method === 'POST')).toBe(false)
  await page.reload()
  await page.locator('.account-button').click()
  await expect(page.getByText('EC-000001', { exact: true })).toBeVisible()
})

test('missing database profile is reported, never created by the frontend', async ({ page, context }) => {
  const state = await mockAuth(context)
  state.profile = null
  await page.goto('/')
  const dialog = await login(page)
  await expect(dialog.getByRole('alert')).toContainText('No pudimos cargar tu perfil')
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog.getByRole('alert')).toContainText('No pudimos cargar tu perfil')
  expect(state.profileRequests.every(request => request.method === 'GET')).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
})

for (const provider of ['google']) {
  test(`OAuth ${provider} uses Supabase authorize with a local return and no client secret`, async ({ page, context, baseURL }) => {
    await mockAuth(context)
    let authorizeUrl
    await context.route('**/auth/v1/authorize?*', async route => {
      authorizeUrl = new URL(route.request().url())
      await route.fulfill({ contentType: 'text/html', body: '<p>OAuth simulado</p>' })
    })
    await page.goto('/')
    const dialog = await openLogin(page)
    await expect(dialog.getByRole('button', { name: 'Continuar con Apple' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Continuar con Google' }).click()
    await expect(page.getByText('OAuth simulado')).toBeVisible()
    expect(authorizeUrl.searchParams.get('provider')).toBe(provider)
    expect(authorizeUrl.searchParams.get('redirect_to')).toBe(new URL('/auth/callback?flow=oauth', baseURL).href)
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('s256')
    expect(authorizeUrl.searchParams.has('client_secret')).toBe(false)
  })
}

test('OAuth return retrieves the existing profile and reports provider cancellation', async ({ page, context }) => {
  const state = await mockAuth(context)
  const returned = session()
  const fragment = new URLSearchParams({ access_token: returned.access_token, refresh_token: returned.refresh_token, expires_in: '3600', token_type: 'bearer' })
  await page.goto(`/?auth=oauth#${fragment}`)
  await expect(page.getByRole('dialog').getByText('EC-000001', { exact: true })).toBeVisible()
  expect(state.profileRequests.every(request => request.method === 'GET')).toBe(true)
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.goto('/?auth=oauth#error=access_denied&error_description=cancelled')
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(new URL('/', page.url()).href)
})
