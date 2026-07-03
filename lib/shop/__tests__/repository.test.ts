import { describe, it, expect, vi } from 'vitest'
import { ShopRepository } from '@/lib/shop/repository'

function makeDb() {
  return {
    gamificationState: { findUnique: vi.fn(), update: vi.fn() },
    userItem: { findMany: vi.fn(), create: vi.fn() },
  }
}

describe('ShopRepository', () => {
  it('getWallet selects coinBalance + streakFreezes', async () => {
    const db = makeDb()
    db.gamificationState.findUnique.mockResolvedValue({ coinBalance: 200, streakFreezes: 1 })
    const repo = new ShopRepository(db as any)
    expect(await repo.getWallet('u1')).toEqual({ coinBalance: 200, streakFreezes: 1 })
    expect(db.gamificationState.findUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { coinBalance: true, streakFreezes: true },
    })
  })

  it('getWallet returns null when no state row', async () => {
    const db = makeDb()
    db.gamificationState.findUnique.mockResolvedValue(null)
    const repo = new ShopRepository(db as any)
    expect(await repo.getWallet('u1')).toBeNull()
  })

  it('getEquipped maps columns to slots, null-safe', async () => {
    const db = makeDb()
    db.gamificationState.findUnique.mockResolvedValue({ equippedHead: 'hat_party', equippedFace: null, equippedNeck: null })
    const repo = new ShopRepository(db as any)
    expect(await repo.getEquipped('u1')).toEqual({ head: 'hat_party', face: null, neck: null })
  })

  it('getEquipped returns all-null when no row', async () => {
    const db = makeDb()
    db.gamificationState.findUnique.mockResolvedValue(null)
    const repo = new ShopRepository(db as any)
    expect(await repo.getEquipped('u1')).toEqual({ head: null, face: null, neck: null })
  })

  it('listOwned returns itemKey array', async () => {
    const db = makeDb()
    db.userItem.findMany.mockResolvedValue([{ itemKey: 'hat_party' }, { itemKey: 'bowtie' }])
    const repo = new ShopRepository(db as any)
    expect(await repo.listOwned('u1')).toEqual(['hat_party', 'bowtie'])
    expect(db.userItem.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { itemKey: true } })
  })

  it('grantAccessory creates UserItem and updates balance', async () => {
    const db = makeDb()
    const repo = new ShopRepository(db as any)
    await repo.grantAccessory('u1', 'hat_party', 50)
    expect(db.userItem.create).toHaveBeenCalledWith({ data: { userId: 'u1', itemKey: 'hat_party' } })
    expect(db.gamificationState.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { coinBalance: 50 } })
  })

  it('grantFreeze updates balance + streakFreezes', async () => {
    const db = makeDb()
    const repo = new ShopRepository(db as any)
    await repo.grantFreeze('u1', 80, 2)
    expect(db.gamificationState.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { coinBalance: 80, streakFreezes: 2 } })
  })

  it('setEquipped writes the correct column for the slot', async () => {
    const db = makeDb()
    const repo = new ShopRepository(db as any)
    await repo.setEquipped('u1', 'face', 'glasses_round')
    expect(db.gamificationState.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { equippedFace: 'glasses_round' } })
    await repo.setEquipped('u1', 'neck', null)
    expect(db.gamificationState.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { equippedNeck: null } })
  })
})
