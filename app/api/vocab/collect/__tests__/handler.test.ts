import { describe, it, expect, vi } from 'vitest'
import { handleCollect } from '@/app/api/vocab/collect/handler'
import type { PassageData } from '@/lib/reading/types'
import type { CardState } from '@/lib/learning/types'

const NOW = new Date('2026-08-17T10:00:00Z')
const user = { id: 'u1', email: 'a@b.c', name: null, image: null }

const CARD: CardState = { due: NOW, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, learningSteps: 0, lastReview: null }

const PASSAGE = {
  id: 'p1', slug: 's1', kind: 'toeic', title: 'T', titleZh: null, level: null, topic: null,
  source: 'self-made', wordCount: 2, content: [], questions: [],
  glossary: {
    staple: { zh: '裝訂', wordId: 'w-staple' },   // 精修字
    zeal: { zh: '熱忱', pos: 'n.' },              // 生字本字
  },
} as unknown as PassageData

function makeDeps() {
  return {
    getPassageBySlug: vi.fn(async (slug: string) => (slug === 's1' ? PASSAGE : null)),
    ensureNotebookBook: vi.fn(async () => ({ id: 'nb1' })),
    upsertNotebookWord: vi.fn(async () => ({ id: 'w-zeal' })),
    getCard: vi.fn(async (): Promise<{ state: CardState; consecutiveCorrect: number; mastered: boolean } | null> => null),
    saveCard: vi.fn(async () => 'c1'),
    scheduler: { newCard: () => CARD, review: (s: CardState) => s },
  }
}

describe('handleCollect', () => {
  it('精修字：直接對既有 wordId 建卡，不動生字本', async () => {
    const deps = makeDeps()
    const res = await handleCollect(user, { passageSlug: 's1', lemma: 'staple' }, deps, NOW)
    expect(res).toEqual({ ok: true, wordId: 'w-staple', alreadyCollected: false })
    expect(deps.ensureNotebookBook).not.toHaveBeenCalled()
    expect(deps.saveCard).toHaveBeenCalledWith('u1', 'w-staple', CARD, { consecutiveCorrect: 0, mastered: false, exists: false })
  })

  it('生字本字：upsert Word（gloss 當釋義）再建卡', async () => {
    const deps = makeDeps()
    const res = await handleCollect(user, { passageSlug: 's1', lemma: 'zeal' }, deps, NOW)
    expect(res).toEqual({ ok: true, wordId: 'w-zeal', alreadyCollected: false })
    expect(deps.upsertNotebookWord).toHaveBeenCalledWith('nb1', { headword: 'zeal', definitionZh: '熱忱', partOfSpeech: 'n.' })
  })

  it('冪等：已有卡回 alreadyCollected，不再建卡', async () => {
    const deps = makeDeps()
    deps.getCard.mockResolvedValue({ state: CARD, consecutiveCorrect: 0, mastered: false })
    const res = await handleCollect(user, { passageSlug: 's1', lemma: 'staple' }, deps, NOW)
    expect(res).toEqual({ ok: true, wordId: 'w-staple', alreadyCollected: true })
    expect(deps.saveCard).not.toHaveBeenCalled()
  })

  it('拒絕：未登入／查無 passage／lemma 不在 glossary（防偽造）', async () => {
    const deps = makeDeps()
    expect((await handleCollect(null, { passageSlug: 's1', lemma: 'staple' }, deps, NOW)).ok).toBe(false)
    expect((await handleCollect(user, { passageSlug: 'nope', lemma: 'staple' }, deps, NOW)).ok).toBe(false)
    expect((await handleCollect(user, { passageSlug: 's1', lemma: 'hacked' }, deps, NOW)).ok).toBe(false)
    expect(deps.saveCard).not.toHaveBeenCalled()
  })
})
