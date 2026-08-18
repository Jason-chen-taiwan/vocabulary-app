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
    create(args: unknown): Promise<unknown>
  }
  word: {
    findMany(args: unknown): Promise<unknown[]>
    findUnique(args: unknown): Promise<unknown | null>
    create(args: unknown): Promise<unknown>
  }
}

export const NOTEBOOK_SLUG = 'my-notebook'
// 生字本是使用者觸發產生的內容，不得進入公開面（SEO 頁、sitemap、干擾項池）
const NOT_NOTEBOOK = { sourceType: { not: 'notebook' } } as const

export class ContentRepository {
  private readonly db: ContentDb
  constructor(db?: ContentDb) {
    this.db = db ?? (getPrisma() as unknown as ContentDb)
  }

  async listWordBooks(): Promise<WordBookData[]> {
    const rows = await this.db.wordBook.findMany({
      where: NOT_NOTEBOOK,
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

  // 生字本個人視角：只列使用者有 UserCard 的字
  async listCollectedWordsByBook(bookId: string, userId: string): Promise<WordData[]> {
    const rows = (await this.db.word.findMany({
      where: { wordBookId: bookId, userCards: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    })) as Parameters<typeof toWordData>[0][]
    return rows.map(toWordData)
  }

  // All definitions across every book — MC distractor pool for mixed practice.
  async listAllDefinitions(): Promise<string[]> {
    const rows = (await this.db.word.findMany({
      where: { wordBook: NOT_NOTEBOOK },
      select: { definitionZh: true },
    })) as { definitionZh: string }[]
    return rows.map((r) => r.definitionZh)
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
      where: { headword: hw, wordBook: NOT_NOTEBOOK },
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
      where: { wordBook: NOT_NOTEBOOK },
      select: { headword: true },
      distinct: ['headword'],
      orderBy: { headword: 'asc' },
    })) as { headword: string }[]
    return [...new Set(rows.map((r) => r.headword.toLowerCase()))].sort()
  }

  // 「我的生字本」系統書：全域一本，個人視角由 UserCard 決定
  async ensureNotebookBook(): Promise<{ id: string }> {
    const existing = (await this.db.wordBook.findUnique({ where: { slug: NOTEBOOK_SLUG }, select: { id: true } })) as { id: string } | null
    if (existing) return existing
    return (await this.db.wordBook.create({
      data: { slug: NOTEBOOK_SLUG, name: '我的生字本', sourceType: 'notebook', order: 99 },
      select: { id: true },
    })) as { id: string }
  }

  // 收藏字 upsert：已存在直接回 id（不覆寫先收藏者建立的釋義）
  async upsertNotebookWord(
    bookId: string,
    data: { headword: string; definitionZh: string; partOfSpeech: string | null },
  ): Promise<{ id: string }> {
    const existing = (await this.db.word.findUnique({
      where: { wordBookId_headword: { wordBookId: bookId, headword: data.headword } },
      select: { id: true },
    })) as { id: string } | null
    if (existing) return existing
    return (await this.db.word.create({
      data: { wordBookId: bookId, headword: data.headword, definitionZh: data.definitionZh, partOfSpeech: data.partOfSpeech, examTags: ['reader'] },
      select: { id: true },
    })) as { id: string }
  }
}
