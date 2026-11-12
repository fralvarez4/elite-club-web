'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const english = {
  'Al menos una letra minúscula': 'At least one lowercase letter',
  'Al menos una letra mayúscula': 'At least one uppercase letter',
  'Al menos un número': 'At least one number',
  'Al menos un símbolo': 'At least one symbol',
  'Usá al menos 10 caracteres, una minúscula, una mayúscula, un número y un símbolo.': 'Use at least 10 characters, one lowercase letter, one uppercase letter, one number and one symbol.',
  'Verificación de seguridad': 'Security verification',
  'Reintentar verificación': 'Retry verification',
  'Completá la verificación de seguridad antes de continuar.': 'Complete the security verification before continuing.',
  'La verificación de seguridad fue rechazada. Completala nuevamente.': 'Security verification was rejected. Complete it again.',
  'La verificación venció. Completala nuevamente.': 'Verification expired. Complete it again.',
  'No se pudo completar la verificación. Volvé a intentar.': 'Verification could not be completed. Please try again.',
  'No se pudo cargar la verificación. Recargá la página e intentá nuevamente.': 'Verification could not load. Reload the page and try again.',
  'El acceso con contraseña requiere configurar la verificación de seguridad. Podés usar Google.': 'Password access requires security verification to be configured. You can use Google.',
  'Continuar': 'Continue',
  'Al menos 10 caracteres': 'At least 10 characters',
  'Una mayúscula': 'One uppercase letter',
  'Un número o símbolo': 'One number or symbol',
  'Las contraseñas coinciden': 'Passwords match',
  'Requisitos de contraseña': 'Password requirements',
  'Usá al menos 10 caracteres, una mayúscula y un número o símbolo.': 'Use at least 10 characters, one uppercase letter and one number or symbol.',
  'Precio no disponible': 'Price unavailable',
  'Moneda de visualización': 'Display currency',
  'Cotización no disponible. Se muestran los precios base en USD.': 'Exchange rate unavailable. Base prices are shown in USD.',
  'Cargando cotización…': 'Loading exchange rate…',
  'ARS indicativo': 'Indicative ARS',
  'El pago se realiza en ARS.': 'Payment is made in ARS.',
  'Editar perfil': 'Edit profile', 'Teléfono': 'Phone', 'Dirección': 'Address',
  'Calle': 'Street', 'Número': 'Number', 'Piso / departamento': 'Apartment / floor',
  'Código postal': 'Postal code', 'Ciudad': 'City', 'Provincia': 'Province', 'Indicaciones': 'Directions',
  'Estos datos se usarán para completar futuras compras. Podés cambiarlos en cada pedido.': 'These details will fill future checkout forms. You can change them for each order.',
  'Estado del pedido': 'Order status', 'Verificando pago…': 'Checking payment…',
  'Pago confirmado por Mercado Pago.': 'Payment confirmed by Mercado Pago.',
  'Pago todavía no confirmado. Consultá nuevamente antes de repetir la compra.': 'Payment not confirmed yet. Check again before repeating the purchase.',
  'No pudimos verificar el estado del pedido. Volvé a intentar.': 'We could not verify the order status. Please try again.',
  'Actualizar estado': 'Refresh status',
  'Administración': 'Administration',
  'Actualizamos la sesión de la tienda. Volvé a iniciar sesión con tu cuenta.': 'We updated the store session. Please sign in again.',
  'Continuar con Google': 'Continue with Google', 'Continuar con Apple': 'Continue with Apple', 'o': 'or',
  'No se completó el acceso con el proveedor. Volvé a intentar.': 'Sign-in with the provider was not completed. Please try again.',
  'No pudimos iniciar el acceso con ese proveedor. Volvé a intentar.': 'We could not start sign-in with this provider. Please try again.',
  'Completá tu perfil': 'Complete your profile', 'Completá los datos que faltan.': 'Fill in the missing details.',
  'Guardar perfil': 'Save profile', 'Cargando perfil…': 'Loading profile…', 'Reintentar': 'Try again',
  'ID de cliente': 'Customer ID', 'Métodos de acceso': 'Sign-in methods',
  'No pudimos cargar tu perfil. Volvé a intentar o contactá a la tienda.': 'We could not load your profile. Try again or contact the store.',
  'No pudimos guardar tu perfil. Revisá los datos y volvé a intentar.': 'We could not save your profile. Check your details and try again.',
  'Nombre': 'First name', 'Apellido': 'Last name', 'Fecha de nacimiento': 'Date of birth', 'Confirmar contraseña': 'Confirm password',
  'Completá tu nombre y apellido.': 'Enter your first and last name.',
  'Ingresá una fecha de nacimiento válida que no sea futura.': 'Enter a valid date of birth that is not in the future.',
  'Las contraseñas no coinciden.': 'The passwords do not match.',
  'Mi cuenta': 'My account', 'Iniciar sesión': 'Sign in', 'Crear cuenta': 'Create account',
  'Cerrar sesión': 'Sign out', 'Sesión iniciada': 'Signed in', 'Email': 'Email', 'Contraseña': 'Password',
  'Comprobando sesión…': 'Checking session…', 'Procesando…': 'Processing…',
  'No tengo cuenta. Crear cuenta': 'Create an account', 'Ya tengo cuenta. Iniciar sesión': 'Already have an account? Sign in',
  'Usá al menos 6 caracteres para la contraseña.': 'Use at least 6 characters for your password.',
  'El email o la contraseña son incorrectos.': 'The email or password is incorrect.',
  'Confirmá tu email antes de iniciar sesión. Revisá también la carpeta de spam.': 'Confirm your email before signing in. Check your spam folder too.',
  'No se pudo crear la cuenta. Si ya tenés una, iniciá sesión.': 'The account could not be created. If you already have one, sign in.',
  'La contraseña no cumple los requisitos de seguridad. Elegí una más larga y combiná letras, números y símbolos.': 'The password does not meet the security requirements. Choose a longer one with letters, numbers and symbols.',
  'Revisá el email y la contraseña ingresados.': 'Check the email and password you entered.',
  'El registro de cuentas no está habilitado en este momento.': 'Account registration is currently unavailable.',
  'No se pudo enviar el email de confirmación a esta dirección. Contactá a la tienda.': 'The confirmation email could not be sent to this address. Contact the store.',
  'El enlace de confirmación venció o no es válido. Si ya confirmaste tu email, iniciá sesión.': 'The confirmation link has expired or is invalid. If you already confirmed your email, sign in.',
  'Se hicieron demasiados intentos. Esperá unos minutos y volvé a intentar.': 'Too many attempts. Wait a few minutes and try again.',
  'No pudimos conectar con el servicio. Revisá tu conexión y volvé a intentar.': 'We could not connect to the service. Check your connection and try again.',
  'No pudimos completar la operación. Volvé a intentar en unos minutos.': 'We could not complete the operation. Try again in a few minutes.',
  'Revisá tu email para confirmar la cuenta antes de iniciar sesión. Si ya tenés una cuenta, podés iniciar sesión con tus datos.': 'Check your email to confirm your account before signing in. If you already have an account, you can sign in with your credentials.',
  'Cerraste sesión. Podés seguir explorando el catálogo.': 'You signed out. You can continue browsing the catalog.',
  'La sesión se cerró en este navegador, pero no pudimos confirmar el cierre en el servidor.': 'You signed out in this browser, but we could not confirm sign-out on the server.',
  'Hombre': 'Men', 'Mujer': 'Women', 'Todo': 'All', 'Remeras': 'T-shirts', 'Hoodies': 'Hoodies', 'Pantalones': 'Pants', 'Accesorios': 'Accessories',
  'Ver todo': 'View all', 'Navegación principal': 'Main navigation', 'Cerrar menú': 'Close menu', 'La colección': 'The collection',
  'Filtros': 'Filters', 'Marca': 'Brand', 'Talle': 'Size', 'Color': 'Color', 'Tipo de producto': 'Product type', 'Orden': 'Sort',
  'Filtrar por marca': 'Filter by brand', 'Filtrar por talle': 'Filter by size', 'Filtrar por color': 'Filter by color', 'Filtrar por tipo de producto': 'Filter by product type',
  'Todas las marcas': 'All brands', 'Todos los talles': 'All sizes', 'Todos los colores': 'All colors', 'Todos los productos': 'All products', 'Único': 'One size',
  'Ordenar productos': 'Sort products', 'Orden original': 'Featured', 'Nombre: A–Z': 'Name: A–Z', 'Nombre: Z–A': 'Name: Z–A',
  'Precio: menor a mayor': 'Price: low to high', 'Precio: mayor a menor': 'Price: high to low',
  'Mis pedidos': 'My orders', 'Administración de productos': 'Product administration', 'Pedidos de la tienda': 'Store orders',
  'Cuenta de administración': 'Administrator account', 'Cuenta de cliente': 'Customer account',
  'Hay cambios sin guardar. ¿Querés cerrar esta ventana?': 'You have unsaved changes. Close this window?',
  'Volver a la tienda': 'Back to store', 'Actualizar estados': 'Refresh statuses',
  'Consultá los pedidos y sus estados. Los pagos se confirman mediante Mercado Pago.': 'Review orders and their statuses. Payments are confirmed by Mercado Pago.',
  'Encontrá tus compras anteriores y consultá el estado actualizado de cada una.': 'Find previous purchases and check their current status.',
  'Cargando pedidos…': 'Loading orders…', 'No hay más pedidos.': 'No more orders.', 'Todavía no hay pedidos para mostrar.': 'No orders to show yet.',
  'Pedido': 'Order', 'Pendiente de pago': 'Awaiting payment', 'Aprobado': 'Approved', 'Rechazado': 'Rejected', 'Cancelado': 'Cancelled',
  'Ver detalle': 'View details', 'Ver detalle del pedido': 'View order details', 'Anteriores': 'Previous', 'Página': 'Page', 'Siguientes': 'Next',
  'Detalle del pedido': 'Order details', 'Detalle': 'Details', 'Cerrar detalle': 'Close details', 'Cargando detalle…': 'Loading details…',
  'Productos': 'Products', 'Entrega': 'Delivery', 'Retiro en': 'Pickup at', 'Total': 'Total',
  'El pago sigue pendiente de confirmación. Actualizá el estado antes de iniciar otra compra.': 'Payment is still awaiting confirmation. Refresh the status before starting another purchase.',
  'Limpiar filtros': 'Clear filters', 'Limpiar filtros ×': 'Clear filters ×', 'Ver resultados': 'View results', 'Buscar productos': 'Search products',
  'Buscá tu próxima pieza': 'Find your next piece', 'Enviar búsqueda': 'Submit search', 'Ver favoritos': 'View favourites', 'Carrito': 'Cart',
  'Elite Club, inicio': 'Elite Club, home', 'Volver al inicio': 'Back to home', 'Marcas de la colección': 'Collection brands',
  'Productos destacados': 'Featured products', 'Producto anterior': 'Previous product', 'Producto siguiente': 'Next product',
  'Ampliar foto del producto': 'Zoom product photo', 'Cerrar': 'Close', 'Colores disponibles': 'Available colours', 'Talles': 'Sizes',
  'Elegir talle': 'Choose size', 'Disponible': 'Available', 'No disponible en este color': 'Unavailable in this colour',
  'Agregar al carrito': 'Add to cart', 'Agregado al carrito': 'Added to cart', 'Detalle del producto': 'Product details',
  'Elegí un talle disponible para agregar el producto.': 'Choose an available size to add this product.',
  'No encontramos esa pieza.': 'No products found.', 'Probá con otra marca, talle o palabra.': 'Try another brand, size or search term.',
  'Ver toda la colección': 'View the full collection', 'Descubrir más piezas': 'Discover more pieces',
  'Total de prendas': 'Total items', 'Compra de demostración. Este catálogo no incluye precios ni procesa pagos.': 'Demo purchase. This catalog has no prices and does not process payments.',
  'Confirmar pedido simulado': 'Confirm demo order', 'Vaciar carrito': 'Empty cart', 'Carrito vacío': 'Your cart is empty',
  'Todavía no agregaste productos.': 'You have not added any products yet.', 'Explorar colección': 'Explore collection',
  '¿Vaciar tu carrito?': 'Empty your cart?', 'Se quitarán todas las prendas que elegiste.': 'All the items you selected will be removed.', 'Cancelar': 'Cancel',
  'Pedido confirmado': 'Order confirmed', '¡Pedido simulado confirmado!': 'Demo order confirmed!', 'Seguir explorando': 'Continue shopping',
  'No se realizó ningún cobro ni envío.': 'No payment or shipment was made.',
  'No pudimos recuperar los datos guardados.': 'We could not restore your saved data.',
  'El navegador no permite guardar los cambios. Se conservarán durante esta visita.': 'Your browser cannot save changes. They will be kept during this visit.',
  'Talle {size} · No disponible': 'Size {size} · Unavailable', 'Talle {size}': 'Size {size}',
  'Ver destacado: {name}': 'View featured: {name}', 'Ver {name}': 'View {name}',
  'Agregar a favoritos: {name}': 'Add to favourites: {name}', 'Quitar de favoritos: {name}': 'Remove from favourites: {name}',
  '{name} · Talle {size} agregado al carrito': '{name} · Size {size} added to cart', '{name} agregado al carrito': '{name} added to cart',
  'Agregado al carrito · {count} unidad': 'Added to cart · {count} item', 'Agregado al carrito · {count} unidades': 'Added to cart · {count} items',
  'Ver carrito ({count})': 'View cart ({count})', 'Tu carrito ({count})': 'Your cart ({count})',
  '{count} productos · Tus favoritos': '{count} products · Your favourites', '{count} productos': '{count} products',
  'Viendo {shown} de {total} productos': 'Showing {shown} of {total} products',
  'Sumar {name}': 'Increase {name}', 'Restar {name}': 'Decrease {name}', 'Eliminar {name} del carrito': 'Remove {name} from cart',
  'Elegiste {count} prendas. El carrito quedó vacío.': 'You selected {count} items. Your cart is now empty.',
}

const templates = Object.entries(english).filter(([key]) => key.includes('{')).sort(([a], [b]) => b.replace(/\{\w+\}/g, '').length - a.replace(/\{\w+\}/g, '').length).map(([key, value]) => {
  const names = [...key.matchAll(/\{(\w+)\}/g)].map(match => match[1])
  const parts = key.split(/\{\w+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return { expression: new RegExp(`^${parts.join('(.+?)')}$`), names, value }
})
const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('es')
  useEffect(() => { try { if (localStorage.getItem('elite-club-language') === 'en') setLanguage('en') } catch { /* Default to Spanish when storage is unavailable. */ } }, [])
  useEffect(() => { document.documentElement.lang = language === 'en' ? 'en-GB' : 'es-ES' }, [language])
  function changeLanguage(next) { setLanguage(next); try { localStorage.setItem('elite-club-language', next) } catch { /* Language still changes for this visit. */ } }
  const t = useCallback(value => {
    if (language !== 'en' || typeof value !== 'string') return value
    if (english[value]) return english[value]
    for (const template of templates) {
      const match = value.match(template.expression)
      if (match) return template.value.replace(/\{(\w+)\}/g, (_, name) => match[template.names.indexOf(name) + 1])
    }
    return value
  }, [language])
  return <LanguageContext.Provider value={{ language, changeLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage() { return useContext(LanguageContext) }

export function LanguageSwitcher() {
  const { language, changeLanguage } = useLanguage()
  return <div className="language-bar" role="group" aria-label={language === 'en' ? 'Language' : 'Idioma'}>
    <button type="button" lang="es" aria-pressed={language === 'es'} onClick={() => changeLanguage('es')}><svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#aa151b" d="M0 0h30v20H0z" /><path fill="#f1bf00" d="M0 5h30v10H0z" /><path fill="#aa151b" d="M7 8h4v5H7z" /><path fill="#fff" d="M6 8h1v6H6zm5 0h1v6h-1z" /></svg>Español</button>
    <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}><svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#012169" d="M0 0h30v20H0z" /><path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20" /><path stroke="#c8102e" strokeWidth="2" d="m0 0 30 20M30 0 0 20" /><path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30" /><path stroke="#c8102e" strokeWidth="4" d="M15 0v20M0 10h30" /></svg>English</button>
  </div>
}
