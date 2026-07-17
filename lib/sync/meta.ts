import type { KV } from './kv'

export async function getMeta(kv: KV, key: string): Promise<string | null> {
  const v = (await kv.get('meta', key)) as string | undefined
  return typeof v === 'string' && v !== '' ? v : null
}

export async function setMeta(kv: KV, key: string, value: string): Promise<void> {
  await kv.put('meta', key, value)
}
