import type { ReviewMode } from './types'
import type { LearningRepository } from './repository'

const MODES: ReviewMode[] = ['recognition', 'recall', 'listening']

export function assignMode(index: number): ReviewMode {
  return MODES[index % MODES.length]
}

export interface SessionItem {
  wordId: string
  mode: ReviewMode
  isNew: boolean
}

export async function buildSession(
  args: { userId: string; wordBookId: string; now: Date; newLimit: number; dueLimit: number },
  deps: { learning: LearningRepository },
): Promise<SessionItem[]> {
  const due = await deps.learning.listDueCards(args.userId, args.now, args.dueLimit)
  const newIds = await deps.learning.listNewWordIds(args.userId, args.wordBookId, args.newLimit)
  const items: SessionItem[] = [
    ...due.map((d) => ({ wordId: d.wordId, isNew: false })),
    ...newIds.map((id) => ({ wordId: id, isNew: true })),
  ].map((item, index) => ({ ...item, mode: assignMode(index) }))
  return items
}
