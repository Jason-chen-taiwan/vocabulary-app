import { pickQuestionType, sample, type QuestionType } from './question'
import type { LearningRepository } from './repository'

export interface SessionItem {
  wordId: string
  questionType: QuestionType
  isNew: boolean
  isSpotCheck: boolean
}

export async function buildSession(
  args: { userId: string; wordBookId: string; now: Date; newLimit: number; dueLimit: number; spotCheckLimit: number; rng?: () => number },
  deps: { learning: LearningRepository },
): Promise<SessionItem[]> {
  const due = await deps.learning.listDueCards(args.userId, args.now, args.dueLimit, args.wordBookId)
  const newIds = await deps.learning.listNewWordIds(args.userId, args.wordBookId, args.newLimit)
  const masteredIds = await deps.learning.listMasteredWordIds(args.userId, args.wordBookId)
  const spot = sample(masteredIds, args.spotCheckLimit, args.rng)

  return [
    ...due.map((d) => ({ wordId: d.wordId, questionType: pickQuestionType(d.consecutiveCorrect), isNew: false, isSpotCheck: false })),
    ...newIds.map((id) => ({ wordId: id, questionType: 'mc' as QuestionType, isNew: true, isSpotCheck: false })),
    ...spot.map((id) => ({ wordId: id, questionType: 'mc' as QuestionType, isNew: false, isSpotCheck: true })),
  ]
}
