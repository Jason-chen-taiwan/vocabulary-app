import type { KV, StoreName } from './kv'

const DB_NAME = 'vocab-offline'
const STORES: StoreName[] = ['packs', 'queue', 'meta']

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = run(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function openKV(): KV {
  const dbPromise = open()
  return {
    get: async (store, key) => tx(await dbPromise, store, 'readonly', (s) => s.get(key)),
    put: async (store, key, value) => { await tx(await dbPromise, store, 'readwrite', (s) => s.put(value, key)) },
    remove: async (store, key) => { await tx(await dbPromise, store, 'readwrite', (s) => s.delete(key)) },
    getAll: async (store) => tx(await dbPromise, store, 'readonly', (s) => s.getAll()),
  }
}
