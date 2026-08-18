// 灌 content/passages/*.json 進 Neon。用法：
//   npm run seed:passages              （全部）
//   npm run seed:passages -- <slug>    （單篇）
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { parsePassageFile } from '../lib/reading/passage-schema.ts'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL }, {})
const prisma = new PrismaClient({ adapter })

const only = process.argv[2]
const files = readdirSync('content/passages')
  .filter((f) => f.endsWith('.json'))
  .filter((f) => (only ? f === `${only}.json` : true))
if (files.length === 0) throw new Error('沒有可 seed 的 passage')

for (const [i, file] of files.entries()) {
  const passage = parsePassageFile(JSON.parse(readFileSync(`content/passages/${file}`, 'utf8')))

  // curated 標記換成實際 wordId（headword 在 builtin 書間全域唯一，check-content 保證）
  for (const [lemma, entry] of Object.entries(passage.glossary)) {
    if (!entry.curated) continue
    delete entry.curated
    const word = await prisma.word.findFirst({
      where: { headword: lemma, wordBook: { sourceType: 'builtin' } },
      select: { id: true, definitionZh: true, partOfSpeech: true },
    })
    if (word) {
      entry.wordId = word.id
      // ECDICT 首義常選錯詞義（如 net→網）；curated 字以精修定義覆蓋 glossary，fallback 資料才正確
      entry.zh = word.definitionZh
      if (word.partOfSpeech) entry.pos = word.partOfSpeech
      else delete entry.pos
    } else console.warn(`warn: curated lemma "${lemma}" 在 DB 查無 builtin Word，以純 gloss 呈現`)
  }

  const data = {
    kind: passage.kind, title: passage.title, titleZh: passage.titleZh ?? null,
    level: passage.level ?? null, topic: passage.topic ?? null, source: passage.source,
    wordCount: passage.wordCount, content: passage.content, glossary: passage.glossary,
    questions: passage.questions, order: i,
  }
  // 顯式 upsert：避免內建 upsert 觸發交易
  const existing = await prisma.passage.findUnique({ where: { slug: passage.slug }, select: { id: true } })
  if (existing) await prisma.passage.update({ where: { slug: passage.slug }, data })
  else await prisma.passage.create({ data: { slug: passage.slug, ...data } })
  console.log(`seeded: ${passage.slug}`)
}
await prisma.$disconnect()
