import { z } from 'zod'

const name = label => z.string().trim().min(2, `${label}: ingresá al menos 2 letras.`)
  .max(100, `${label}: máximo 100 caracteres.`)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, `${label}: usá letras, espacios, apóstrofes o guiones.`)
const place = label => z.string().trim().min(2, `${label}: ingresá al menos 2 letras.`)
  .max(100, `${label}: máximo 100 caracteres.`)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, `${label}: ingresá un nombre válido.`)
const phone = z.string().trim().min(1, 'Ingresá un teléfono de contacto.')
  .max(50, 'Teléfono: máximo 50 caracteres.')
  .refine(value => /^[+\d()\s.-]+$/.test(value) && /^\+?\d{8,15}$/.test(value.replace(/[()\s.-]/g, '')),
    'Ingresá un teléfono válido de 8 a 15 dígitos.')
const street = z.string().trim().min(3, 'Ingresá la calle (al menos 3 caracteres).')
  .max(200, 'Calle: máximo 200 caracteres.')
  .refine(value => /[\p{L}\d]/u.test(value), 'Ingresá una calle válida.')
const streetNumber = z.string().trim().min(1, 'Ingresá el número de la calle.')
  .max(30, 'Número: máximo 30 caracteres.')
  .regex(/^(?:\d{1,6}(?:\s?[\p{L}]{1,4})?|s\/?n)$/iu, 'Ingresá un número válido o S/N.')
const postalCode = z.string().trim().toUpperCase()
  .regex(/^(?:\d{4}|[A-Z]\d{4}[A-Z]{3})$/, 'Ingresá un código postal argentino de 4 dígitos o formato CPA.')
const optional = max => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional()
const contact = { first_name: name('Nombre'), last_name: name('Apellido'), phone }
export const deliverySchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pickup'), ...contact }).strict(),
  z.object({
    method: z.literal('shipping'), ...contact, street, street_number: streetNumber,
    apartment: optional(100), postal_code: postalCode, city: place('Ciudad'),
    province: place('Provincia'), instructions: optional(1000),
  }).strict(),
])
