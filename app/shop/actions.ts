'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { shopService, type PurchaseResult, type EquipResult } from '@/lib/shop/service'
import type { Slot } from '@/lib/shop/catalog'

export async function purchaseAction(itemKey: string): Promise<PurchaseResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, reason: 'unauthorized' }
  return shopService.purchase(user.id, itemKey)
}

export async function equipAction(slot: Slot, itemKey: string | null): Promise<EquipResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, reason: 'unauthorized' }
  return shopService.equip(user.id, slot, itemKey)
}
