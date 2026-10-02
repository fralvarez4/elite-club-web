const PALETTE = {
  Negro: '#191919', Blanco: '#f6f5f1', Azul: '#2861c4', 'Azul marino': '#1c2943',
  Naranja: '#e77828', Verde: '#436643', Amarillo: '#e4c744', Rosa: '#e9a9c3',
  Marrón: '#795c43', Dorado: '#b99a51', Rojo: '#c63035', Gris: '#929294',
  'Gris jaspeado': '#aaa9a6', 'Avena oscuro': '#aba598', 'Avena claro': '#e3ded2',
  'Negro Stretch Limo': '#202020', 'Negro Jet': '#151515',
}
// Visually checked against the original product photos. Shared multicolor
// photos still use each variant's color, so blue and orange caps remain distinct.
const PHOTO_COLORS = {
  'image25': '#191919', 'image28': '#191919', 'image10': '#191919',
  'image23': '#191919', 'image13': '#f6f5f1', 'image20': '#191919',
  'image19': '#191919', 'image27': '#191919', 'image2': '#191919',
  'image39': '#242426', 'image55': '#363638', 'image61': '#4b4b4d',
  'image53': '#44464a', 'image51': '#191919',
}
export function swatchFor(variant) {
  const colors = variant.color.split(' / ')
  if (colors.length > 1) {
    return `linear-gradient(135deg, ${PALETTE[colors[0]] || '#a6a6a6'} 0% 50%, ${PALETTE[colors[1]] || '#a6a6a6'} 50% 100%)`
  }
  const photo = variant.image.match(/\/products\/(image\d+)\.(?:webp|png)$/)?.[1]
  return PHOTO_COLORS[photo] || PALETTE[variant.color.split(' / ')[0]] || '#a6a6a6'
}
