import { describe, it, expect, vi } from 'vitest'
import { assignMode, buildSession } from '@/lib/learning/session'

const now = new Date('2026-06-27T00:00:00Z')
const st = { due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }

describe('assignMode', () => {
  it('rotates recognition → recall → listening', () => {
    expect([0, 1, 2, 3, 4].map(assignMode)).toEqual(['recognition', 'recall', 'listening', 'recognition', 'recall'])
  })
})

describe('buildSession', () => {
  it('puts due cards first, then new words, assigning modes by overall index', async () => {
    const learning = {
      listDueCards: vi.fn().mockResolvedValue([{ wordId: 'd1', state: st }, { wordId: 'd2', state: st }]),
      listNewWordIds: vi.fn().mockResolvedValue(['n1']),
    }
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50 }, { learning: learning as any })
    expect(learning.listDueCards).toHaveBeenCalledWith('u1', now, 50)
    expect(learning.listNewWordIds).toHaveBeenCalledWith('u1', 'b1', 5)
    expect(items).toEqual([
      { wordId: 'd1', mode: 'recognition', isNew: false },
      { wordId: 'd2', mode: 'recall', isNew: false },
      { wordId: 'n1', mode: 'listening', isNew: true },
    ])
  })

  it('returns [] when nothing due and no new words', async () => {
    const learning = { listDueCards: vi.fn().mockResolvedValue([]), listNewWordIds: vi.fn().mockResolvedValue([]) }
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50 }, { learning: learning as any })
    expect(items).toEqual([])
  })
})
