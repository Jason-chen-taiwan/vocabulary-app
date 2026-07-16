/**
 * gen-og.mjs — rasterize public/og-source.svg into public/og.png (1200x630 OG image).
 * 一次性產圖：npm i --no-save sharp && node scripts/gen-og.mjs
 * sharp 只在產圖時需要，不是 runtime/deploy 依賴。
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/og-source.svg'))
await sharp(svg, { density: 192 }).resize(1200, 630).png().toFile(join(root, 'public/og.png'))
console.log('wrote public/og.png 1200x630')
