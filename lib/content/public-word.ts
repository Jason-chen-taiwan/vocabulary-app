import { toExampleData, type ExampleData } from './types'

// 公開單字頁（/word/[headword]）的合併視圖：同一 headword 可能出現在多本主題書。
export interface PublicWordBookRef { slug: string; name: string }

export interface PublicWordData {
  headword: string
  phonetic: string | null
  partOfSpeech: string | null
  definitionZh: string
  examples: ExampleData[]
  books: PublicWordBookRef[]
}

type ExampleRow = { id: string; sentence: string; translationZh: string; source: string | null }
export type PublicWordRow = {
  headword: string; phonetic: string | null; partOfSpeech: string | null
  definitionZh: string; examples: ExampleRow[]; wordBook: PublicWordBookRef
}

// 欄位取首筆非 null 值；例句依句子文字去重聯集；books 依 slug 去重。
export function mergePublicWordRows(rows: PublicWordRow[]): PublicWordData | null {
  if (rows.length === 0) return null
  const examples: ExampleData[] = []
  const seenSentences = new Set<string>()
  const books: PublicWordBookRef[] = []
  const seenSlugs = new Set<string>()
  for (const row of rows) {
    for (const e of row.examples) {
      if (seenSentences.has(e.sentence)) continue
      seenSentences.add(e.sentence)
      examples.push(toExampleData(e))
    }
    if (!seenSlugs.has(row.wordBook.slug)) {
      seenSlugs.add(row.wordBook.slug)
      books.push({ slug: row.wordBook.slug, name: row.wordBook.name })
    }
  }
  return {
    headword: rows[0].headword.toLowerCase(),
    phonetic: rows.find((r) => r.phonetic !== null)?.phonetic ?? null,
    partOfSpeech: rows.find((r) => r.partOfSpeech !== null)?.partOfSpeech ?? null,
    definitionZh: rows[0].definitionZh,
    examples,
    books,
  }
}
