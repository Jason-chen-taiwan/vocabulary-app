import type { KV } from './kv'
import { listQueue, removeQueued } from './queue'
import { getMeta, setMeta } from './meta'

interface SyncResponse {
  ok: boolean
  results: { uuid: string; status: 'applied' | 'duplicate' | 'error' }[]
  reward: { xp: number; coins: number }
}

// 回線同步：讀佇列 → POST /api/sync → 清已入帳（applied+duplicate）。
// error 筆保留下次重試；HTTP 失敗整包保留。回 null = 無事可做或失敗。
export async function syncNow(
  kv: KV,
  fetchFn: typeof fetch = fetch,
): Promise<{ synced: number; xp: number; coins: number } | null> {
  const entries = await listQueue(kv)
  if (entries.length === 0) return null
  const finishedAt = await getMeta(kv, 'pendingSessionFinishedAt')
  let data: SyncResponse
  try {
    const res = await fetchFn('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries, ...(finishedAt ? { session: { finishedAt } } : {}) }),
    })
    if (!res.ok) return null
    data = (await res.json()) as SyncResponse
  } catch {
    return null
  }
  if (!data.ok) return null
  const done = data.results.filter((r) => r.status !== 'error').map((r) => r.uuid)
  await removeQueued(kv, done)
  if (finishedAt) await setMeta(kv, 'pendingSessionFinishedAt', '')
  return { synced: done.length, xp: data.reward.xp, coins: data.reward.coins }
}
