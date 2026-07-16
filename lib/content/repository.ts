import { getPrisma } from '@/lib/db/client'
import {
  toWordBookData, toWordData, toWordWithExamples,
  type WordBookData, type WordData, type WordWithExamples,
} from './types'
import { mergePublicWordRows, type PublicWordData, type PublicWordRow } from './public-word'

// Minimal structural type of the Prisma delegates we use — lets tests inject a mock.
interface ContentDb {
  wordBook: {
    findMany(args: unknown): Promise<unknown[]>
    findUnique(args: unknown): Promise<unknown | null>
  }
  word: {
    findMany(args: unknown): Promise<unknown[]>
    findUnique(args: unknown): Promise<unknown | null>
  }
}

export class ContentRepository {
  private readonly db: ContentDb
  constructor(db?: ContentDb) {
    this.db = db ?? (getPrisma() as unknown as ContentDb)
  }

  async listWordBooks(): Promise<WordBookData[]> {
    const rows = await this.db.wordBook.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { words: true } } },
    })
    return (rows as Parameters<typeof toWordBookData>[0][]).map(toWordBookData)
  }

  async getWordBookBySlug(slug: string): Promise<WordBookData | null> {
    const row = await this.db.wordBook.findUnique({
      where: { slug },
      include: { _count: { select: { words: true } } },
    })
    return row ? toWordBookData(row as Parameters<typeof toWordBookData>[0]) : null
  }

  async listWordsByBook(wordBookId: string): Promise<WordData[]> {
    const rows = await this.db.word.findMany({ where: { wordBookId }, orderBy: { order: 'asc' } })
    return (rows as Parameters<typeof toWordData>[0][]).map(toWordData)
  }

  async getWordWithExamples(wordId: string): Promise<WordWithExamples | null> {
    const row = await this.db.word.findUnique({
      where: { id: wordId },
      include: { examples: { orderBy: { order: 'asc' } } },
    })
    return row ? toWordWithExamples(row as Parameters<typeof toWordWithExamples>[0]) : null
  }

  async listWordsByBookWithExamples(wordBookId: string): Promise<WordWithExamples[]> {
    const rows = await this.db.word.findMany({
      where: { wordBookId },
      orderBy: { order: 'asc' },
      include: { examples: { orderBy: { order: 'asc' } } },
    })
    return (rows as Parameters<typeof toWordWithExamples>[0][]).map(toWordWithExamples)
  }

  async listWordsWithExamplesByIds(ids: string[]): Promise<WordWithExamples[]> {
    if (ids.length === 0) return []
    const rows = await this.db.word.findMany({
      where: { id: { in: ids } },
      include: { examples: { orderBy: { order: 'asc' } } },
    })
    return (rows as Parameters<typeof toWordWithExamples>[0][]).map(toWordWithExamples)
  }

  async getWordCore(id: string): Promise<{ headword: string; definitionZh: string } | null> {
    const row = (await this.db.word.findUnique({ where: { id }, select: { headword: true, definitionZh: true } })) as
      { headword: string; definitionZh: string } | null
    return row
  }

  /** 公開單字頁用：跨書合併同一 headword。匿名可呼叫，無使用者資料。 */
  async getPublicWordByHeadword(headword: string): Promise<PublicWordData | null> {
    const hw = headword.trim().toLowerCase()
    if (!hw) return null
    const rows = await this.db.word.findMany({
      where: { headword: { equals: hw, mode: 'insensitive' } },
      orderBy: [{ wordBook: { slug: 'asc' } }, { id: 'asc' }],
      include: {
        examples: { orderBy: { order: 'asc' } },
        wordBook: { select: { slug: true, name: true } },
      },
    })
    return mergePublicWordRows(rows as PublicWordRow[])
  }

  /** sitemap 用：全站 headword（小寫、去重、排序）。 */
  async listAllHeadwords(): Promise<string[]> {
    const rows = (await this.db.word.findMany({
      select: { headword: true },
      distinct: ['headword'],
      orderBy: { headword: 'asc' },
    })) as { headword: string }[]
    return [...new Set(rows.map((r) => r.headword.toLowerCase()))].sort()
  }
}
