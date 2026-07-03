import { ShopRepository } from './repository'
import { CATALOG, itemByKey, isAccessory, type ShopItem, type Slot } from './catalog'
import { FREEZE_CAP } from '@/lib/gamification/rules'

export interface ShopItemView { item: ShopItem; owned: boolean; equipped: boolean; affordable: boolean }
export interface ShopView {
  coinBalance: number
  streakFreezes: number
  freezeCap: number
  items: ShopItemView[]
}
export type PurchaseResult =
  | { ok: true; kind: 'accessory' | 'consumable'; coinBalance: number; alreadyOwned?: boolean }
  | { ok: false; reason: 'unauthorized' | 'unknown_item' | 'insufficient' | 'freeze_full' }
export type EquipResult = { ok: boolean; reason?: 'unauthorized' | 'unknown_item' | 'not_owned' | 'wrong_slot' }

export class ShopService {
  private readonly repo: ShopRepository
  constructor(repo?: ShopRepository) {
    this.repo = repo ?? new ShopRepository()
  }

  async getShopView(userId: string): Promise<ShopView> {
    const [wallet, owned, equipped] = await Promise.all([
      this.repo.getWallet(userId),
      this.repo.listOwned(userId),
      this.repo.getEquipped(userId),
    ])
    const coinBalance = wallet?.coinBalance ?? 0
    const streakFreezes = wallet?.streakFreezes ?? 0
    const ownedSet = new Set(owned)
    const items = CATALOG.map((item): ShopItemView => ({
      item,
      owned: isAccessory(item) ? ownedSet.has(item.key) : false,
      equipped: isAccessory(item) && equipped[item.slot] === item.key,
      affordable: coinBalance >= item.cost,
    }))
    return { coinBalance, streakFreezes, freezeCap: FREEZE_CAP, items }
  }

  async purchase(userId: string, itemKey: string): Promise<PurchaseResult> {
    const item = itemByKey(itemKey)
    if (!item) return { ok: false, reason: 'unknown_item' }
    const wallet = await this.repo.getWallet(userId)
    const coinBalance = wallet?.coinBalance ?? 0
    const streakFreezes = wallet?.streakFreezes ?? 0

    if (isAccessory(item)) {
      const owned = await this.repo.listOwned(userId)
      if (owned.includes(item.key)) return { ok: true, kind: 'accessory', coinBalance, alreadyOwned: true }
      if (coinBalance < item.cost) return { ok: false, reason: 'insufficient' }
      const newBalance = coinBalance - item.cost
      await this.repo.grantAccessory(userId, item.key, newBalance)
      return { ok: true, kind: 'accessory', coinBalance: newBalance }
    }

    // consumable：freeze。先檢查上限（滿即拒、不扣幣），再檢查餘額。
    if (streakFreezes >= FREEZE_CAP) return { ok: false, reason: 'freeze_full' }
    if (coinBalance < item.cost) return { ok: false, reason: 'insufficient' }
    const newBalance = coinBalance - item.cost
    await this.repo.grantFreeze(userId, newBalance, streakFreezes + 1)
    return { ok: true, kind: 'consumable', coinBalance: newBalance }
  }

  async equip(userId: string, slot: Slot, itemKey: string | null): Promise<EquipResult> {
    if (itemKey === null) {
      await this.repo.setEquipped(userId, slot, null)
      return { ok: true }
    }
    const item = itemByKey(itemKey)
    if (!item || !isAccessory(item)) return { ok: false, reason: 'unknown_item' }
    if (item.slot !== slot) return { ok: false, reason: 'wrong_slot' }
    const owned = await this.repo.listOwned(userId)
    if (!owned.includes(itemKey)) return { ok: false, reason: 'not_owned' }
    await this.repo.setEquipped(userId, slot, itemKey)
    return { ok: true }
  }
}

export const shopService = new ShopService()
