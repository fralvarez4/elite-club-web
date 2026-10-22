// Solo UX: Supabase Auth debe aplicar la política real a cualquier cliente.
export function passwordChecks(password, confirmation) {
  return [
    { label: 'Al menos 10 caracteres', valid: password.length >= 10 },
    { label: 'Al menos una letra minúscula', valid: /[a-z]/.test(password) },
    { label: 'Al menos una letra mayúscula', valid: /[A-Z]/.test(password) },
    { label: 'Al menos un número', valid: /[0-9]/.test(password) },
    { label: 'Al menos un símbolo', valid: /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password) },
    { label: 'Las contraseñas coinciden', valid: password.length > 0 && password === confirmation },
  ]
}
