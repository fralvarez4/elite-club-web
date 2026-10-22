import './globals.css'
import './storefront.css'
import './elite-theme.css'
import { AuthProvider } from '../src/lib/auth'
export const metadata = { title: 'Elite Club | Catálogo', description: 'Catálogo de ropa y accesorios de Elite Club. Productos, marcas y talles.' }
export default function RootLayout({ children }) { return <html lang="es-AR"><body><AuthProvider>{children}</AuthProvider></body></html> }
