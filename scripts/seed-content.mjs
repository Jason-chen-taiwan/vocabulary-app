import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { parseSeedBook } from '../lib/content/seed-schema.ts'

const file = process.argv[2] ?? 'content/toeic-core.json'
const book = parseSeedBook(JSON.parse(readFileSync(file, 'utf8')))

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

// Use PrismaNeon (WebSocket pool) — PrismaNeonHttp does not support transactions,
// but Prisma 7 wraps writes in implicit transactions. PrismaNeon takes a pg-compatible
// config object and creates the pool internally.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL }, {})
const prisma = new PrismaClient({ adapter })

// Upsert WordBook by slug (findUnique + create/update avoids relying on the
// built-in upsert, which triggers a transaction even on simple cases)
let wb = await prisma.wordBook.findUnique({ where: { slug: book.slug } })
if (wb) {
  wb = await prisma.wordBook.update({
    where: { slug: book.slug },
    data: { name: book.name, description: book.description ?? null, level: book.level ?? null },
  })
} else {
  wb = await prisma.wordBook.create({
    data: { slug: book.slug, name: book.name, description: book.description ?? null, level: book.level ?? null },
  })
}

let n = 0
for (let i = 0; i < book.words.length; i++) {
  const w = book.words[i]

  // Upsert Word by composite unique (wordBookId, headword)
  let word = await prisma.word.findUnique({
    where: { wordBookId_headword: { wordBookId: wb.id, headword: w.headword } },
  })
  if (word) {
    word = await prisma.word.update({
      where: { wordBookId_headword: { wordBookId: wb.id, headword: w.headword } },
      data: { phonetic: w.phonetic ?? null, partOfSpeech: w.partOfSpeech ?? null, definitionZh: w.definitionZh, examTags: w.examTags ?? [], order: i },
    })
  } else {
    word = await prisma.word.create({
      data: { wordBookId: wb.id, headword: w.headword, phonetic: w.phonetic ?? null, partOfSpeech: w.partOfSpeech ?? null, definitionZh: w.definitionZh, examTags: w.examTags ?? [], order: i },
    })
  }

  // examples: delete + re-insert for idempotency
  await prisma.example.deleteMany({ where: { wordId: word.id } })
  await prisma.example.createMany({
    data: w.examples.map((e, j) => ({ wordId: word.id, sentence: e.sentence, translationZh: e.translationZh, source: e.source ?? null, order: j })),
  })
  n++
}

console.log(`Seeded book "${book.slug}" with ${n} words.`)
await prisma.$disconnect()
