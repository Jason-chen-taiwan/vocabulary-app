export interface ExampleData {
  id: string
  sentence: string
  translationZh: string
  source: string | null
}

export interface WordData {
  id: string
  headword: string
  phonetic: string | null
  partOfSpeech: string | null
  definitionZh: string
  examTags: string[]
}

export interface WordWithExamples extends WordData {
  examples: ExampleData[]
}

export interface WordBookData {
  id: string
  slug: string
  name: string
  description: string | null
  level: string | null
  wordCount: number
}

// Prisma-row shapes we map FROM (only the fields we read).
type ExampleRow = { id: string; sentence: string; translationZh: string; source: string | null }
type WordRow = {
  id: string; headword: string; phonetic: string | null; partOfSpeech: string | null
  definitionZh: string; examTags: string[]; examples?: ExampleRow[]
}
type WordBookRow = {
  id: string; slug: string; name: string; description: string | null
  level: string | null; _count?: { words: number }
}

export function toExampleData(row: ExampleRow): ExampleData {
  return { id: row.id, sentence: row.sentence, translationZh: row.translationZh, source: row.source }
}

export function toWordData(row: WordRow): WordData {
  return {
    id: row.id, headword: row.headword, phonetic: row.phonetic,
    partOfSpeech: row.partOfSpeech, definitionZh: row.definitionZh, examTags: row.examTags,
  }
}

export function toWordWithExamples(row: WordRow): WordWithExamples {
  return { ...toWordData(row), examples: (row.examples ?? []).map(toExampleData) }
}

export function toWordBookData(row: WordBookRow): WordBookData {
  return {
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    level: row.level, wordCount: row._count?.words ?? 0,
  }
}
