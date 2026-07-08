import { pickQuestionType, sample, type QuestionType } from './question'
import type { LearningRepository } from './repository'

export interface SessionItem {
  wordId: string
  questionType: QuestionType
  isNew: boolean
  isSpotCheck: boolean
}

export async function buildSession(
  // wordBookId omitted → mixed practice across all books
  args: { userId: string; wordBookId?: string; now: Date; newLimit: number; dueLimit: number; spotCheckLimit: number; rng?: () => number },
  deps: { learning: LearningRepository },
): Promise<SessionItem[]> {
  // the three queries are independent → run them in parallel (one Neon round-trip stack, not three)
  const [due, newIds, masteredIds] = await Promise.all([
    deps.learning.listDueCards(args.userId, args.now, args.dueLimit, args.wordBookId),
    deps.learning.listNewWordIds(args.userId, args.wordBookId, args.newLimit),
    deps.learning.listMasteredWordIds(args.userId, args.wordBookId),
  ])
  const spot = sample(masteredIds, args.spotCheckLimit, args.rng)

  return [
    ...due.map((d) => ({ wordId: d.wordId, questionType: pickQuestionType(d.consecutiveCorrect), isNew: false, isSpotCheck: false })),
    ...newIds.map((id) => ({ wordId: id, questionType: 'mc' as QuestionType, isNew: true, isSpotCheck: false })),
    ...spot.map((id) => ({ wordId: id, questionType: 'mc' as QuestionType, isNew: false, isSpotCheck: true })),
  ]
}
