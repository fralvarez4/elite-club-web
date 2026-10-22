const PALETTE = {
  black: '#191919', white: '#f6f5f1', blue: '#2861c4', navy: '#1c2943',
  orange: '#e77828', green: '#436643', yellow: '#e4c744', pink: '#e9a9c3',
  brown: '#795c43', gold: '#b99a51', red: '#c63035', grey: '#929294', gray: '#929294',
  heather: '#aaa9a6', 'dark oatmeal': '#aba598', 'light oatmeal': '#e3ded2',
  'stretch limo': '#202020', 'jet black': '#151515',
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
  const colors = variant.color.toLowerCase().split(' / ')
  if (colors.length > 1) {
    return `linear-gradient(135deg, ${PALETTE[colors[0]] || '#a6a6a6'} 0% 50%, ${PALETTE[colors[1]] || '#a6a6a6'} 50% 100%)`
  }
  const photo = variant.image.match(/\/products\/(image\d+)\.(?:webp|png)$/)?.[1]
  return PHOTO_COLORS[photo] || PALETTE[colors[0]] || '#a6a6a6'
}
