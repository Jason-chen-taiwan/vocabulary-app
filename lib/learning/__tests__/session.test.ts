import { describe, it, expect, vi } from 'vitest'
import { buildSession } from '@/lib/learning/session'

const now = new Date('2026-06-28T00:00:00Z')

describe('buildSession', () => {
  it('orders due (by streak→type) then new (mc) then spot-checks (mc), with correct repo calls', async () => {
    const learning = {
      listDueCards: vi.fn().mockResolvedValue([{ wordId: 'd1', consecutiveCorrect: 0 }, { wordId: 'd2', consecutiveCorrect: 2 }, { wordId: 'd3', consecutiveCorrect: 4 }]),
      listNewWordIds: vi.fn().mockResolvedValue(['n1']),
      listMasteredWordIds: vi.fn().mockResolvedValue(['m1', 'm2', 'm3', 'm4']),
    }
    const rng = () => 0 // sample picks first remaining each time
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50, spotCheckLimit: 2, rng }, { learning: learning as any })
    expect(learning.listDueCards).toHaveBeenCalledWith('u1', now, 50, 'b1')
    expect(learning.listNewWordIds).toHaveBeenCalledWith('u1', 'b1', 5)
    expect(learning.listMasteredWordIds).toHaveBeenCalledWith('u1', 'b1')
    expect(items).toEqual([
      { wordId: 'd1', questionType: 'mc', isNew: false, isSpotCheck: false },
      { wordId: 'd2', questionType: 'cloze', isNew: false, isSpotCheck: false },
      { wordId: 'd3', questionType: 'typing', isNew: false, isSpotCheck: false },
      { wordId: 'n1', questionType: 'mc', isNew: true, isSpotCheck: false },
      { wordId: 'm1', questionType: 'mc', isNew: false, isSpotCheck: true },
      { wordId: 'm2', questionType: 'mc', isNew: false, isSpotCheck: true },
    ])
  })

  it('returns [] when nothing due, new, or mastered', async () => {
    const learning = { listDueCards: vi.fn().mockResolvedValue([]), listNewWordIds: vi.fn().mockResolvedValue([]), listMasteredWordIds: vi.fn().mockResolvedValue([]) }
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50, spotCheckLimit: 3, rng: () => 0 }, { learning: learning as any })
    expect(items).toEqual([])
  })
})
