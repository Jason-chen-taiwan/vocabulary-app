import { buildSession } from './session'
import { buildQuestion, sample, type Question } from './question'
import type { LearningRepository } from './repository'
import type { WordWithExamples } from '@/lib/content/types'

export interface BuiltReviewItem { question: Question; isSpotCheck: boolean }

export const SESSION_LIMITS = { newLimit: 20, dueLimit: 100, spotCheckLimit: 3 }

// ContentRepository 的結構子集：page 與 offline-pack 路由都以它注入，測試給 fake。
export interface ReviewContentDeps {
  listWordsWithExamplesByIds(ids: string[]): Promise<WordWithExamples[]>
  listAllDefinitions(): Promise<string[]>
  listWordsByBook(bookId: string): Promise<{ definitionZh: string }[]>
}

export async function buildReviewItems(
  args: { userId: string; book: { id: string } | null; now: Date; newLimit: number; dueLimit: number; spotCheckLimit: number; rng?: () => number },
  deps: { learning: LearningRepository; content: ReviewContentDeps },
): Promise<BuiltReviewItem[]> {
  const items = await buildSession(
    { userId: args.userId, wordBookId: args.book?.id, now: args.now, newLimit: args.newLimit, dueLimit: args.dueLimit, spotCheckLimit: args.spotCheckLimit, rng: args.rng },
    { learning: deps.learning },
  )
  const words = await deps.content.listWordsWithExamplesByIds(items.map((i) => i.wordId))
  const byId = new Map(words.map((w) => [w.id, w]))
  const needsMc = items.some((i) => i.questionType === 'mc')
  const allDefs = needsMc
    ? (args.book
        ? (await deps.content.listWordsByBook(args.book.id)).map((w) => w.definitionZh)
        : await deps.content.listAllDefinitions())
    : []

  const out: BuiltReviewItem[] = []
  for (const item of items) {
    const word = byId.get(item.wordId)
    if (!word) continue
    const distractors = item.questionType === 'mc'
      ? sample([...new Set(allDefs)].filter((d) => d !== word.definitionZh), 3, args.rng)
      : []
    out.push({ question: buildQuestion(word, item.questionType, distractors), isSpotCheck: item.isSpotCheck })
  }
  return out
}
