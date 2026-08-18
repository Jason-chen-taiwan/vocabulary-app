import type { SessionUser } from '@/lib/auth/session'
import type { LearningRepository } from '@/lib/learning/repository'
import type { SchedulerService } from '@/lib/learning/scheduler'
import type { PassageData } from '@/lib/reading/types'

export interface CollectDeps {
  getPassageBySlug(slug: string): Promise<PassageData | null>
  ensureNotebookBook(): Promise<{ id: string }>
  upsertNotebookWord(bookId: string, data: { headword: string; definitionZh: string; partOfSpeech: string | null }): Promise<{ id: string }>
  getCard: LearningRepository['getCard']
  saveCard: LearningRepository['saveCard']
  scheduler: SchedulerService
}

export interface CollectResult { ok: boolean; wordId: string | null; alreadyCollected: boolean }

const EMPTY: CollectResult = { ok: false, wordId: null, alreadyCollected: false }

export async function handleCollect(
  user: SessionUser | null,
  body: unknown,
  deps: CollectDeps,
  now: Date,
): Promise<CollectResult> {
  if (!user) return EMPTY
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.passageSlug !== 'string' || typeof b.lemma !== 'string') return EMPTY

  const passage = await deps.getPassageBySlug(b.passageSlug)
  if (!passage) return EMPTY
  // 防偽造：只能收該篇 glossary 裡的字
  const entry = passage.glossary[b.lemma]
  if (!entry) return EMPTY

  let wordId = entry.wordId ?? null
  if (wordId === null) {
    const book = await deps.ensureNotebookBook()
    const word = await deps.upsertNotebookWord(book.id, {
      headword: b.lemma, definitionZh: entry.zh, partOfSpeech: entry.pos ?? null,
    })
    wordId = word.id
  }

  // 冪等：已有卡不重建（CardSource='reader' 的第一個實作——卡建立後與 TOEIC 卡完全同軌）
  const existing = await deps.getCard(user.id, wordId)
  if (existing) return { ok: true, wordId, alreadyCollected: true }
  await deps.saveCard(user.id, wordId, deps.scheduler.newCard(now), { consecutiveCorrect: 0, mastered: false, exists: false })
  return { ok: true, wordId, alreadyCollected: false }
}
