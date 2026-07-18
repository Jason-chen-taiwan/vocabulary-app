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
    // synced 只算 applied（duplicate 是已入帳過的舊帳，重算會讓 toast 灌水）
    expect(res).toEqual({ synced: 1, xp: 12, coins: 50 })
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

  it('佇列空但有殘留 session 標記 → 清標記、回 null、不打 API', async () => {
    const kv = memKV()
    await setMeta(kv, 'pendingSessionFinishedAt', '2026-07-18T03:00:00.000Z')
    let called = false
    const res = await syncNow(kv, (async () => { called = true; return okResponse({}) }) as typeof fetch)
    expect(res).toBeNull()
    expect(called).toBe(false)
    expect(await getMeta(kv, 'pendingSessionFinishedAt')).toBeNull()
  })

  it('佇列 > 500 → 分批送出（500+100），session 只跟最後一批，彙總回傳', async () => {
    const kv = memKV()
    for (let i = 0; i < 600; i++) {
      await enqueueAnswer(kv, {
        wordId: `w${i}`,
        questionType: 'mc',
        userAnswer: 'x',
        answeredAt: new Date(2026, 6, 18, 0, 0, i).toISOString(),
      })
    }
    await setMeta(kv, 'pendingSessionFinishedAt', '2026-07-18T03:00:00.000Z')
    const calls: { entries: unknown[]; session?: { finishedAt: string } }[] = []
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string)
      calls.push(body)
      const results = body.entries.map((e: { uuid: string }) => ({ uuid: e.uuid, status: 'applied' }))
      return okResponse({ ok: true, results, reward: { xp: 10, coins: 5 } })
    }) as typeof fetch
    const res = await syncNow(kv, fetchFn)
    expect(calls).toHaveLength(2)
    expect(calls[0].entries).toHaveLength(500)
    expect(calls[0].session).toBeUndefined()
    expect(calls[1].entries).toHaveLength(100)
    expect(calls[1].session?.finishedAt).toBe('2026-07-18T03:00:00.000Z')
    expect(res).toEqual({ synced: 600, xp: 20, coins: 10 })
    expect(await listQueue(kv)).toHaveLength(0)
    expect(await getMeta(kv, 'pendingSessionFinishedAt')).toBeNull()
  })

  it('第二批失敗 → 第一批已清空、剩餘保留、回第一批彙總', async () => {
    const kv = memKV()
    for (let i = 0; i < 600; i++) {
      await enqueueAnswer(kv, {
        wordId: `w${i}`,
        questionType: 'mc',
        userAnswer: 'x',
        answeredAt: new Date(2026, 6, 18, 0, 0, i).toISOString(),
      })
    }
    await setMeta(kv, 'pendingSessionFinishedAt', '2026-07-18T03:00:00.000Z')
    let call = 0
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      call += 1
      const body = JSON.parse(init!.body as string)
      if (call === 1) {
        const results = body.entries.map((e: { uuid: string }) => ({ uuid: e.uuid, status: 'applied' }))
        return okResponse({ ok: true, results, reward: { xp: 10, coins: 5 } })
      }
      return { ok: false, json: async () => ({}) } as Response
    }) as typeof fetch
    const res = await syncNow(kv, fetchFn)
    expect(res).toEqual({ synced: 500, xp: 10, coins: 5 })
    expect(await listQueue(kv)).toHaveLength(100)
    expect(await getMeta(kv, 'pendingSessionFinishedAt')).toBe('2026-07-18T03:00:00.000Z')
  })

  it('同一筆連續 3 次 syncNow 都回 error → 第 3 次後從佇列移除', async () => {
    const kv = memKV()
    await enqueueAnswer(kv, { wordId: 'w1', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T01:00:00.000Z' })
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string)
      const results = body.entries.map((e: { uuid: string }) => ({ uuid: e.uuid, status: 'error' }))
      return okResponse({ ok: true, results, reward: { xp: 0, coins: 0 } })
    }) as typeof fetch
    await syncNow(kv, fetchFn)
    expect(await listQueue(kv)).toHaveLength(1)
    await syncNow(kv, fetchFn)
    expect(await listQueue(kv)).toHaveLength(1)
    await syncNow(kv, fetchFn)
    expect(await listQueue(kv)).toHaveLength(0)
  })
})
