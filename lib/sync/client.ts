import type { KV } from './kv'
import { listQueue, removeQueued, bumpAttempts } from './queue'
import { getMeta, setMeta } from './meta'
import type { QueueEntry } from './types'

interface SyncResponse {
  ok: boolean
  results: { uuid: string; status: 'applied' | 'duplicate' | 'error' }[]
  reward: { xp: number; coins: number }
}

// 單批最多筆數，與 server MAX_ENTRIES 一致（server 超過整包拒收，client 端先分批避免整包被擋）。
const MAX_BATCH = 500

// 回線同步：讀佇列 → 依 MAX_BATCH 分批依序 POST /api/sync → 清已入帳（applied+duplicate）。
// session finish 只跟最後一批送出。任一批失敗（HTTP/parse 失敗或 ok:false）就停止，
// 已成功批次的清除與彙總仍保留（回傳彙總；全部失敗回 null）。
// error 筆保留下次重試，累計滿 3 次放棄不再送；HTTP 層失敗的整批不算入 attempts。
export async function syncNow(
  kv: KV,
  fetchFn: typeof fetch = fetch,
): Promise<{ synced: number; xp: number; coins: number } | null> {
  const entries = await listQueue(kv)
  if (entries.length === 0) {
    // 佇列已空但殘留待送的 session 標記：清掉，避免之後某個不相關的批次被誤貼上這次 finishedAt。
    if (await getMeta(kv, 'pendingSessionFinishedAt')) await setMeta(kv, 'pendingSessionFinishedAt', '')
    return null
  }
  const finishedAt = await getMeta(kv, 'pendingSessionFinishedAt')

  const chunks: QueueEntry[][] = []
  for (let i = 0; i < entries.length; i += MAX_BATCH) chunks.push(entries.slice(i, i + MAX_BATCH))

  let synced = 0
  let xp = 0
  let coins = 0
  let anySucceeded = false

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const isLastChunk = i === chunks.length - 1
    let data: SyncResponse
    try {
      const res = await fetchFn('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entries: chunk,
          ...(isLastChunk && finishedAt ? { session: { finishedAt } } : {}),
        }),
      })
      if (!res.ok) break
      data = (await res.json()) as SyncResponse
    } catch {
      break
    }
    if (!data.ok) break

    const applied = data.results.filter((r) => r.status === 'applied').map((r) => r.uuid)
    const duplicate = data.results.filter((r) => r.status === 'duplicate').map((r) => r.uuid)
    const errored = data.results.filter((r) => r.status === 'error').map((r) => r.uuid)

    await removeQueued(kv, [...applied, ...duplicate])
    if (errored.length > 0) await bumpAttempts(kv, errored)

    synced += applied.length // 只算 applied：duplicate 是已入帳過的舊帳，重複算會讓 toast 灌水
    xp += data.reward.xp
    coins += data.reward.coins
    anySucceeded = true

    if (isLastChunk && finishedAt) await setMeta(kv, 'pendingSessionFinishedAt', '')
  }

  if (!anySucceeded) return null
  return { synced, xp, coins }
}
