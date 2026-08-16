// 建置期預解析：content/passages-src/*.json -> content/passages/*.json
// 用法：npm run build:passages            （全部）
//       npm run build:passages -- <slug>  （單篇）
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import * as OpenCC from 'opencc-js'
import { parseLemmaFile, makeLemmaOf } from '../lib/reading/pipeline/lemma.ts'
import { buildDictIndex, glossFromTranslation } from '../lib/reading/pipeline/ecdict.ts'
import { buildPassage, parsePassageSrc } from '../lib/reading/pipeline/build.ts'
import { tokenize } from '../lib/reading/pipeline/tokenize.ts'

const CSV = 'vendor/ecdict/ecdict.csv'
const LEMMA = 'vendor/ecdict/lemma.en.txt'
if (!existsSync(CSV) || !existsSync(LEMMA)) throw new Error('先跑 npm run fetch:dict 下載 ECDICT 資料')

const only = process.argv[2]
const srcDir = 'content/passages-src'
const outDir = 'content/passages'
mkdirSync(outDir, { recursive: true })

const files = readdirSync(srcDir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .filter((f) => (only ? f === `${only}.json` : true))
if (files.length === 0) throw new Error('沒有可建置的 passages-src 檔')

const srcs = files.map((f) => parsePassageSrc(JSON.parse(readFileSync(`${srcDir}/${f}`, 'utf8'))))

// slug 跨檔不可重複（spec §2 驗證第 4 點）
const dup = srcs.map((s) => s.slug).filter((s, i, a) => a.indexOf(s) !== i)
if (dup.length) throw new Error(`slug 重複：${[...new Set(dup)].join(', ')}`)

// 詞形還原表 + 手動釋義覆寫
const lemmaOf = makeLemmaOf(parseLemmaFile(readFileSync(LEMMA, 'utf8')))
const overridesPath = `${srcDir}/_gloss-overrides.json`
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {}

// 先掃全部原文收集需要的 lemma，再一次掃 66MB csv 建索引
const needed = new Set()
for (const src of srcs) for (const para of src.paragraphs) for (const t of tokenize(para, lemmaOf)) if (t.l) needed.add(t.l)
const dict = buildDictIndex(readFileSync(CSV, 'utf8'), needed)

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })
const curated = new Set(
  Object.values(JSON.parse(readFileSync('content/_headwords.json', 'utf8')))
    .flatMap((b) => b.headwords.map((h) => h.toLowerCase())),
)

const lookup = (lemma) => {
  if (overrides[lemma]) return overrides[lemma] // 覆寫優先（已是繁體短對譯）
  const row = dict.get(lemma)
  if (!row) return null
  return glossFromTranslation(row.translation, toTraditional)
}

let failed = 0
for (const src of srcs) {
  try {
    const passage = buildPassage(src, { lemmaOf, lookup, curated })
    writeFileSync(`${outDir}/${src.slug}.json`, `${JSON.stringify(passage, null, 2)}\n`)
    console.log(`built: ${src.slug}（${passage.wordCount} 字，${passage.questions.length} 題）`)
  } catch (err) {
    failed += 1
    console.error(`FAILED: ${src.slug}\n${err.message}\n`)
  }
}
if (failed) process.exit(1)
