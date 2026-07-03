import { getPrisma } from '@/lib/db/client'
import type { Slot } from './catalog'

interface ShopDb {
  gamificationState: {
    findUnique(args: unknown): Promise<unknown | null>
    update(args: unknown): Promise<unknown>
  }
  userItem: {
    findMany(args: unknown): Promise<unknown[]>
    create(args: unknown): Promise<unknown>
  }
}

export interface Wallet { coinBalance: number; streakFreezes: number }
export interface Equipped { head: string | null; face: string | null; neck: string | null }

const SLOT_FIELD: Record<Slot, 'equippedHead' | 'equippedFace' | 'equippedNeck'> = {
  head: 'equippedHead', face: 'equippedFace', neck: 'equippedNeck',
}

export class ShopRepository {
  private readonly db: ShopDb
  constructor(db?: ShopDb) {
    this.db = db ?? (getPrisma() as unknown as ShopDb)
  }

  async getWallet(userId: string): Promise<Wallet | null> {
    return (await this.db.gamificationState.findUnique({
      where: { userId },
      select: { coinBalance: true, streakFreezes: true },
    })) as Wallet | null
  }

  async getEquipped(userId: string): Promise<Equipped> {
    const row = (await this.db.gamificationState.findUnique({
      where: { userId },
      select: { equippedHead: true, equippedFace: true, equippedNeck: true },
    })) as { equippedHead: string | null; equippedFace: string | null; equippedNeck: string | null } | null
    return { head: row?.equippedHead ?? null, face: row?.equippedFace ?? null, neck: row?.equippedNeck ?? null }
  }

  async listOwned(userId: string): Promise<string[]> {
    const rows = (await this.db.userItem.findMany({
      where: { userId }, select: { itemKey: true },
    })) as { itemKey: string }[]
    return rows.map((r) => r.itemKey)
  }

  async grantAccessory(userId: string, itemKey: string, newBalance: number): Promise<void> {
    // Neon HTTP 無交易：先建 item 再扣幣。若兩步間程序中止，使用者拿到 item 但未扣幣（偏向使用者、不可被利用）。spec §2/§10 已記錄。
    await this.db.userItem.create({ data: { userId, itemKey } })
    await this.db.gamificationState.update({ where: { userId }, data: { coinBalance: newBalance } })
  }

  async grantFreeze(userId: string, newBalance: number, newFreezes: number): Promise<void> {
    await this.db.gamificationState.update({ where: { userId }, data: { coinBalance: newBalance, streakFreezes: newFreezes } })
  }

  async setEquipped(userId: string, slot: Slot, itemKey: string | null): Promise<void> {
    await this.db.gamificationState.update({ where: { userId }, data: { [SLOT_FIELD[slot]]: itemKey } })
  }
}
