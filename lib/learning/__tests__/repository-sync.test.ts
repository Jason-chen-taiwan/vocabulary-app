import { describe, it, expect } from 'vitest'
import { LearningRepository } from '../repository'

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    userCard: { findUnique: async () => null, create: async () => ({ id: 'c1' }), update: async () => ({ id: 'c1' }), findMany: async () => [] },
    word: { findMany: async () => [] },
    reviewLog: { create: async () => ({}), findMany: async () => [] },
    ...overrides,
  } as ConstructorParameters<typeof LearningRepository>[0]
}

describe('LearningRepository sync additions', () => {
  it('createReviewLog 把 clientRef 傳進 db.create', async () => {
    let captured: unknown
    const repo = new LearningRepository(fakeDb({
      reviewLog: { create: async (args: unknown) => { captured = args; return {} }, findMany: async () => [] },
    }))
    await repo.createReviewLog({
      userCardId: 'c1', rating: 3, state: 2, due: new Date(), stability: 1, difficulty: 5,
      elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 1, clientRef: 'uuid-1',
    })
    expect((captured as { data: { clientRef?: string } }).data.clientRef).toBe('uuid-1')
  })

  it('listClientRefs 回傳已存在的 refs；空輸入不打 DB', async () => {
    let called = false
    const repo = new LearningRepository(fakeDb({
      reviewLog: {
        create: async () => ({}),
        findMany: async () => { called = true; return [{ clientRef: 'a' }, { clientRef: 'b' }] },
      },
    }))
    expect(await repo.listClientRefs([])).toEqual([])
    expect(called).toBe(false)
    expect(await repo.listClientRefs(['a', 'b', 'c'])).toEqual(['a', 'b'])
  })

  it('listStartedBooks 以 book id 去重', async () => {
    const b1 = { id: 'bk1', slug: 'office', name: '辦公室' }
    const b2 = { id: 'bk2', slug: 'finance', name: '財務' }
    const repo = new LearningRepository(fakeDb({
      userCard: {
        findUnique: async () => null, create: async () => ({ id: 'c1' }), update: async () => ({ id: 'c1' }),
        findMany: async () => [
          { word: { wordBook: b1 } }, { word: { wordBook: b1 } }, { word: { wordBook: b2 } },
        ],
      },
    }))
    expect(await repo.listStartedBooks('u1')).toEqual([b1, b2])
  })
})
