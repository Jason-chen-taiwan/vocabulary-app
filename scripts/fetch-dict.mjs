// 下載 ECDICT 資料到 gitignored vendor/（已存在則跳過）。MIT 授權，只在建置期使用。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const FILES = [
  ['https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv', 'vendor/ecdict/ecdict.csv'],
  ['https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt', 'vendor/ecdict/lemma.en.txt'],
]

mkdirSync('vendor/ecdict', { recursive: true })
for (const [url, path] of FILES) {
  if (existsSync(path)) { console.log(`skip (exists): ${path}`); continue }
  console.log(`downloading ${url} ...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  console.log(`saved: ${path}`)
}
