import { describe, it, expect } from 'vitest'
import type { KV, StoreName } from '../kv'
import { enqueueAnswer, listQueue } from '../queue'
import { setMeta, getMeta } from '../meta'
import { syncNow } from '../client'

function memKV(): KV {
  const data: Record<StoreName, Map<string, unknown>> = { packs: new Map(), queue: new Map(), meta: new Map() }
  return {
    get: async (s, k) => data[s].get(k),
    put: async (s, k, v) => { data[s].set(k, v) },
    remove: async (s, k) => { data[s].delete(k) },
    getAll: async (s) => [...data[s].values()],
  }
}

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response

describe('syncNow', () => {
  it('佇列空 → 不打 API、回 null', async () => {
    const kv = memKV()
    let called = false
    const res = await syncNow(kv, (async () => { called = true; return okResponse({}) }) as typeof fetch)
    expect(res).toBeNull()
    expect(called).toBe(false)
  })

  it('成功 → 清掉 applied+duplicate、保留 error、清 session 標記、回彙總', async () => {
    const kv = memKV()
    const a = await enqueueAnswer(kv, { wordId: 'w1', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T01:00:00.000Z' })
    const b = await enqueueAnswer(kv, { wordId: 'w2', questionType: 'mc', userAnswer: 'y', answeredAt: '2026-07-18T02:00:00.000Z' })
    const c = await enqueueAnswer(kv, { wordId: 'w3', questionType: 'mc', userAnswer: 'z', answeredAt: '2026-07-18T03:00:00.000Z' })
    await setMeta(kv, 'pendingSessionFinishedAt', '2026-07-18T03:00:00.000Z')
    const res = await syncNow(kv, (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string)
      expect(body.entries).toHaveLength(3)
      expect(body.session.finishedAt).toBe('2026-07-18T03:00:00.000Z')
      return okResponse({
        ok: true,
        results: [
          { uuid: a.uuid, status: 'applied' },
          { uuid: b.uuid, status: 'duplicate' },
          { uuid: c.uuid, status: 'error' },
        ],
        reward: { xp: 12, coins: 50, level: null, badges: [], applied: 1, correct: 1, perfect: false },
      })
    }) as typeof fetch)
    expect(res).toEqual({ synced: 2, xp: 12, coins: 50 })
    expect((await listQueue(kv)).map((e) => e.uuid)).toEqual([c.uuid])
    expect(await getMeta(kv, 'pendingSessionFinishedAt')).toBeNull()
  })

  it('HTTP 失敗 → 佇列原封不動、回 null', async () => {
    const kv = memKV()
    await enqueueAnswer(kv, { wordId: 'w1', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T01:00:00.000Z' })
    const res = await syncNow(kv, (async () => ({ ok: false, json: async () => ({}) }) as Response) as typeof fetch)
    expect(res).toBeNull()
    expect(await listQueue(kv)).toHaveLength(1)
  })
})
