import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
const path = new URL('../src/data/products.json', import.meta.url)
const products = JSON.parse(await readFile(path, 'utf8'))
for (const image of new Set(products.map(p => p.image))) {
  if (!image.endsWith('.png')) continue
  await sharp(fileURLToPath(new URL(`../public${image}`, import.meta.url))).resize({ width: 900, height: 1100, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(fileURLToPath(new URL(`../public${image.replace('.png', '.webp')}`, import.meta.url)))
}
await writeFile(path, JSON.stringify(products.map(p => ({ ...p, image: p.image.replace('.png', '.webp') })), null, 2))
