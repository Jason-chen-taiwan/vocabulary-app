import { getPrisma } from '@/lib/db/client'
import type {
  ClientPassageQuestion, GlossEntry, PassageData, PassageListItem, PassagePayload,
  PassageQuestion, PassageResultData, PassageToken,
} from './types.ts'

// 結構性子集，方便測試注入假物件（比照 ContentRepository 的 ContentDb）
interface ReadingDb {
  passage: {
    findMany(args: unknown): Promise<unknown[]>
    findUnique(args: unknown): Promise<unknown | null>
  }
  passageResult: {
    findUnique(args: unknown): Promise<unknown | null>
    findMany(args: unknown): Promise<unknown[]>
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
  }
  userCard: { findMany(args: unknown): Promise<unknown[]> }
}

interface PassageRow {
  id: string; slug: string; kind: string; title: string; titleZh: string | null
  level: string | null; topic: string | null; source: string; wordCount: number
  content: unknown; glossary: unknown; questions: unknown
}

interface ResultRow {
  passageId: string; correctCount: number; totalCount: number
  readSeconds: number | null; completedAt: Date
}

// Json 欄位在 repository 邊界一次轉成宣告型別（建置期已驗證過，讀取端信任落地資料）
function toPassageData(row: PassageRow): PassageData {
  return {
    id: row.id, slug: row.slug, kind: row.kind as PassageData['kind'], title: row.title,
    titleZh: row.titleZh, level: row.level, topic: row.topic, source: row.source,
    wordCount: row.wordCount,
    content: row.content as PassageToken[][],
    glossary: row.glossary as Record<string, GlossEntry>,
    questions: row.questions as PassageQuestion[],
  }
}

function toResultData(row: ResultRow): PassageResultData {
  return {
    passageId: row.passageId, correctCount: row.correctCount, totalCount: row.totalCount,
    readSeconds: row.readSeconds, completedAt: row.completedAt,
  }
}

export class PassageRepository {
  private readonly db: ReadingDb

  constructor(db?: ReadingDb) {
    this.db = db ?? (getPrisma() as unknown as ReadingDb)
  }

  async listPassages(): Promise<PassageListItem[]> {
    const rows = (await this.db.passage.findMany({
      orderBy: [{ order: 'asc' }, { slug: 'asc' }],
      select: { id: true, slug: true, kind: true, title: true, titleZh: true, level: true, topic: true, wordCount: true, questions: true },
    })) as (Omit<PassageRow, 'content' | 'glossary' | 'source'>)[]
    return rows.map((r) => ({
      id: r.id, slug: r.slug, kind: r.kind as PassageListItem['kind'], title: r.title,
      titleZh: r.titleZh, level: r.level, topic: r.topic, wordCount: r.wordCount,
      questionCount: (r.questions as unknown[]).length,
    }))
  }

  async getPassageBySlug(slug: string): Promise<PassageData | null> {
    const row = (await this.db.passage.findUnique({ where: { slug } })) as PassageRow | null
    return row ? toPassageData(row) : null
  }

  async getResult(userId: string, passageId: string): Promise<PassageResultData | null> {
    const row = (await this.db.passageResult.findUnique({
      where: { userId_passageId: { userId, passageId } },
    })) as ResultRow | null
    return row ? toResultData(row) : null
  }

  async listResults(userId: string, passageIds: string[]): Promise<Map<string, PassageResultData>> {
    if (passageIds.length === 0) return new Map()
    const rows = (await this.db.passageResult.findMany({
      where: { userId, passageId: { in: passageIds } },
    })) as ResultRow[]
    return new Map(rows.map((r) => [r.passageId, toResultData(r)]))
  }

  // 顯式 find→create/update：避免內建 upsert 觸發交易（Neon HTTP 無交易；比照 seed 腳本）
  async saveResult(
    userId: string, passageId: string,
    data: { correctCount: number; totalCount: number; readSeconds: number | null },
  ): Promise<{ firstCompletion: boolean }> {
    const existing = await this.db.passageResult.findUnique({
      where: { userId_passageId: { userId, passageId } },
    })
    if (existing === null) {
      await this.db.passageResult.create({ data: { userId, passageId, ...data } })
      return { firstCompletion: true }
    }
    await this.db.passageResult.update({
      where: { userId_passageId: { userId, passageId } },
      data,
    })
    return { firstCompletion: false }
  }

  // 回傳使用者已收藏的 lemma：精修字比 wordId、生字本字比 headword
  async listCollectedLemmas(userId: string, entries: { lemma: string; wordId?: string }[]): Promise<string[]> {
    const withId = entries.filter((e) => e.wordId !== undefined)
    const withoutId = entries.filter((e) => e.wordId === undefined).map((e) => e.lemma)
    const collected = new Set<string>()

    if (withId.length > 0) {
      const rows = (await this.db.userCard.findMany({
        where: { userId, wordId: { in: withId.map((e) => e.wordId) } },
        select: { wordId: true },
      })) as { wordId: string }[]
      const hit = new Set(rows.map((r) => r.wordId))
      for (const e of withId) if (hit.has(e.wordId as string)) collected.add(e.lemma)
    }
    if (withoutId.length > 0) {
      const rows = (await this.db.userCard.findMany({
        where: { userId, word: { headword: { in: withoutId }, wordBook: { sourceType: 'notebook' } } },
        select: { word: { select: { headword: true } } },
      })) as { word: { headword: string } }[]
      for (const r of rows) collected.add(r.word.headword)
    }
    return [...collected]
  }
}

export function toPassagePayload(p: PassageData): PassagePayload {
  const questions: ClientPassageQuestion[] = p.questions.map(({ id, type, stem, options }) => ({ id, type, stem, options }))
  return { ...p, questions }
}
