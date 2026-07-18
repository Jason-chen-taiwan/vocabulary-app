import { describe, it, expect } from 'vitest'
import type { KV, StoreName } from '../kv'
import { localYmd } from '../kv'
import { enqueueAnswer, listQueue, removeQueued, bumpAttempts } from '../queue'
import { savePacks, loadPack, listPacks, removePack } from '../pack-store'
import { getMeta, setMeta } from '../meta'

function memKV(): KV {
  const data: Record<StoreName, Map<string, unknown>> = { packs: new Map(), queue: new Map(), meta: new Map() }
  return {
    get: async (s, k) => data[s].get(k),
    put: async (s, k, v) => { data[s].set(k, v) },
    remove: async (s, k) => { data[s].delete(k) },
    getAll: async (s) => [...data[s].values()],
  }
}

const item = { question: { wordId: 'w1', type: 'mc' as const, prompt: 'hw', hint: null, audioText: 'hw', options: ['a', 'b'], answer: 'a' }, isSpotCheck: false }

describe('localYmd', () => {
  it('本地時區 YYYY-MM-DD', () => {
    expect(localYmd(new Date(2026, 6, 18, 23, 59))).toBe('2026-07-18')
    expect(localYmd(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('queue', () => {
  it('enqueue 產 uuid、listQueue 按 answeredAt 升冪、removeQueued 移除', async () => {
    const kv = memKV()
    const b = await enqueueAnswer(kv, { wordId: 'w2', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T02:00:00.000Z' })
    const a = await enqueueAnswer(kv, { wordId: 'w1', questionType: 'typing', userAnswer: 'y', answeredAt: '2026-07-18T01:00:00.000Z' })
    expect(a.uuid).toBeTruthy()
    expect(a.uuid).not.toBe(b.uuid)
    const q = await listQueue(kv)
    expect(q.map((e) => e.wordId)).toEqual(['w1', 'w2'])
    await removeQueued(kv, [a.uuid])
    expect((await listQueue(kv)).map((e) => e.wordId)).toEqual(['w2'])
  })

  it('bumpAttempts 累加次數，滿 3 次移除並回傳該 uuid', async () => {
    const kv = memKV()
    const e = await enqueueAnswer(kv, { wordId: 'w9', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T09:00:00.000Z' })
    expect(await bumpAttempts(kv, [e.uuid])).toEqual([])
    expect(await bumpAttempts(kv, [e.uuid])).toEqual([])
    expect(await bumpAttempts(kv, [e.uuid])).toEqual([e.uuid])
    expect(await listQueue(kv)).toEqual([])
  })
})

describe('pack-store', () => {
  it('save/load 當日有效、隔日過期、removePack 移除', async () => {
    const kv = memKV()
    await savePacks(kv, [{ slug: 'office', name: '辦公室', items: [item] }], '2026-07-18')
    expect((await loadPack(kv, 'office', '2026-07-18'))?.name).toBe('辦公室')
    expect(await loadPack(kv, 'office', '2026-07-19')).toBeNull()
    expect((await listPacks(kv, '2026-07-18')).map((p) => p.slug)).toEqual(['office'])
    expect(await listPacks(kv, '2026-07-19')).toEqual([])
    await removePack(kv, 'office')
    expect(await loadPack(kv, 'office', '2026-07-18')).toBeNull()
  })
})

describe('meta', () => {
  it('get/set 往返；未設回 null', async () => {
    const kv = memKV()
    expect(await getMeta(kv, 'lastPrefetchYmd')).toBeNull()
    await setMeta(kv, 'lastPrefetchYmd', '2026-07-18')
    expect(await getMeta(kv, 'lastPrefetchYmd')).toBe('2026-07-18')
  })
})
