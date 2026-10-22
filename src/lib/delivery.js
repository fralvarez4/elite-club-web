import { z } from 'zod'

const required = max => z.string().trim().min(1, 'Completá los datos obligatorios.').max(max)
const optional = max => z.string().trim().max(max).optional()
const contact = { first_name: required(100), last_name: required(100), phone: required(50) }
export const deliverySchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pickup'), ...contact }).strict(),
  z.object({
    method: z.literal('shipping'), ...contact, street: required(200), street_number: required(30),
    apartment: optional(100), postal_code: required(20), city: required(100),
    province: required(100), instructions: optional(1000),
  }).strict(),
])
