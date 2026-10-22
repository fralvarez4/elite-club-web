import { test, expect } from '@playwright/test'
import { readJsonBody } from '../src/lib/requestBody.js'
import { AdminError, adminFailure, productInput } from '../src/lib/admin.js'
import { passwordChecks } from '../src/lib/passwordPolicy.js'

test('password policy requires all six conditions independently', () => {
  for (const value of ['Short1!', 'lowercase123!', 'UPPERCASE123!', 'OnlyLettersHere!', 'LongPassword1', 'Uppercase     ', 'LongPassword1😀']) {
    expect(passwordChecks(value, value).every(check => check.valid)).toBe(false)
  }
  for (const value of ['LongPassword1!', 'Long-Password2']) {
    expect(passwordChecks(value, value)).toHaveLength(6)
    expect(passwordChecks(value, value).every(check => check.valid)).toBe(true)
    expect(passwordChecks(value, 'different').every(check => check.valid)).toBe(false)
  }
})

test('stream limit cancels oversized bodies without trusting Content-Length', async () => {
  let cancelled = false
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(10000)) },
    cancel() { cancelled = true },
  })
  const request = new Request('http://localhost/api', { method: 'POST', body, duplex: 'half', headers: { 'content-length': '1' } })
  await expect(readJsonBody(request, AdminError, 16000)).rejects.toMatchObject({ status: 413 })
  expect(cancelled).toBe(true)
})

test('JSON errors and forged internal statuses never expose provider messages', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', body: '{invalid' })
  await expect(readJsonBody(request, AdminError)).rejects.toMatchObject({ status: 400 })
  const response = adminFailure({ status: 400, message: 'private-provider-detail' })
  expect(response.status).toBe(500)
  expect(await response.text()).not.toContain('private-provider-detail')
  expect(adminFailure(null).status).toBe(500)
  expect(adminFailure(new AdminError(403, 'Forbidden')).status).toBe(403)
})

test('admin rejects content types that merely start with application/json', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', body: '{}', headers: { origin: 'http://localhost', 'content-type': 'application/json-invalid' } })
  await expect(productInput(request)).rejects.toMatchObject({ status: 415 })
})
