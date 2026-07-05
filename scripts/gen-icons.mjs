/**
 * gen-icons.mjs — rasterize public/icon-source.svg (小橙狐 mascot) into the PWA
 * PNG icons the manifest references. Run after editing the source SVG:
 *   npm i --no-save sharp && node scripts/gen-icons.mjs
 * sharp is only needed to regenerate; it is not a runtime/deploy dependency.
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/icon-source.svg'))

const targets = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
]

for (const [out, size] of targets) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(join(root, out))
  console.log('wrote', out, `${size}x${size}`)
}
