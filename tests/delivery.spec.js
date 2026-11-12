import { test, expect } from '@playwright/test'
import { deliverySchema } from '../src/lib/delivery.js'

const pickup = { method: 'pickup', first_name: 'María José', last_name: "O'Connor", phone: '+54 11 1234-5678' }
const shipping = { ...pickup, method: 'shipping', street: 'San Martín', street_number: '1046', apartment: '', postal_code: 'c1426abc', city: 'Buenos Aires', province: 'Buenos Aires', instructions: '' }

test('checkout accepts real contact and Argentine delivery formats', () => {
  expect(deliverySchema.safeParse(pickup).success).toBe(true)
  expect(deliverySchema.parse(shipping).postal_code).toBe('C1426ABC')
  expect(deliverySchema.safeParse({ ...shipping, street_number: 'S/N', postal_code: '1426' }).success).toBe(true)
  expect(deliverySchema.safeParse({ ...shipping, street_number: '1046 bis' }).success).toBe(true)
})

test('checkout rejects invalid fields with specific messages', () => {
  for (const [field, value] of [['first_name', '123'], ['last_name', '!'], ['phone', 'abc'], ['street', '--'], ['street_number', '???'], ['postal_code', '12'], ['city', '3'], ['province', '?']]) {
    const result = deliverySchema.safeParse({ ...shipping, [field]: value })
    expect(result.success, field).toBe(false)
    expect(result.error.issues[0].path).toContain(field)
    expect(result.error.issues[0].message.length).toBeGreaterThan(10)
  }
  expect(deliverySchema.safeParse({ ...pickup, total: 1 }).success).toBe(false)
})
