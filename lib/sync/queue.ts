import type { KV } from './kv'
import type { QueueEntry } from './types'

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
