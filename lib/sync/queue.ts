import type { KV } from './kv'
import type { QueueEntry } from './types'

// 同一筆連續被 server 判 error 達此次數就放棄重試（server 已重判拒收 3 次，留著只會一直佔請求）。
const MAX_ATTEMPTS = 3

export async function enqueueAnswer(kv: KV, e: Omit<QueueEntry, 'uuid'>): Promise<QueueEntry> {
  const entry: QueueEntry = { ...e, uuid: crypto.randomUUID() }
  await kv.put('queue', entry.uuid, entry)
  return entry
}

export async function listQueue(kv: KV): Promise<QueueEntry[]> {
  const all = (await kv.getAll('queue')) as QueueEntry[]
  return all.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
}

export async function removeQueued(kv: KV, uuids: string[]): Promise<void> {
  for (const id of uuids) await kv.remove('queue', id)
}

// 針對這次同步中回 error 的 uuid 各累加一次 attempts；滿 MAX_ATTEMPTS 就從佇列移除。
// 回傳被移除（放棄重試）的 uuid 清單。
export async function bumpAttempts(kv: KV, uuids: string[]): Promise<string[]> {
  const gaveUp: string[] = []
  for (const uuid of uuids) {
    const entry = (await kv.get('queue', uuid)) as QueueEntry | undefined
    if (!entry) continue
    const attempts = (entry.attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await kv.remove('queue', uuid)
      gaveUp.push(uuid)
    } else {
      await kv.put('queue', uuid, { ...entry, attempts })
    }
  }
  return gaveUp
}
