import type { KV } from './kv'
import type { OfflinePack, StoredPack } from './types'

export async function savePacks(kv: KV, packs: OfflinePack[], ymd: string): Promise<void> {
  for (const p of packs) await kv.put('packs', p.slug, { ...p, ymd } satisfies StoredPack)
}

export async function loadPack(kv: KV, slug: string, ymd: string): Promise<StoredPack | null> {
  const v = (await kv.get('packs', slug)) as StoredPack | undefined
  return v && v.ymd === ymd ? v : null
}

export async function listPacks(kv: KV, ymd: string): Promise<StoredPack[]> {
  const all = (await kv.getAll('packs')) as StoredPack[]
  return all.filter((p) => p.ymd === ymd)
}

export async function removePack(kv: KV, slug: string): Promise<void> {
  await kv.remove('packs', slug)
}
