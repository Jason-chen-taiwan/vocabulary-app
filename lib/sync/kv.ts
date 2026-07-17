export type StoreName = 'packs' | 'queue' | 'meta'

// IndexedDB 的最小抽象：真實實作在 idb.ts；測試用 in-memory fake。
export interface KV {
  get(store: StoreName, key: string): Promise<unknown>
  put(store: StoreName, key: string, value: unknown): Promise<void>
  remove(store: StoreName, key: string): Promise<void>
  getAll(store: StoreName): Promise<unknown[]>
}

// 裝置本地日期（非 UTC）：包過期與預抓頻率都以使用者本地日為準。
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
