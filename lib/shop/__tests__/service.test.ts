import { describe, it, expect, vi } from 'vitest'
import { ShopService } from '@/lib/shop/service'

// FREEZE_CAP = 3（見 @/lib/gamification/rules）
function makeRepo(over: Partial<Record<string, any>> = {}) {
  return {
    getWallet: vi.fn().mockResolvedValue({ coinBalance: 500, streakFreezes: 0 }),
    listOwned: vi.fn().mockResolvedValue([]),
    getEquipped: vi.fn().mockResolvedValue({ head: null, face: null, neck: null }),
    grantAccessory: vi.fn().mockResolvedValue(undefined),
    grantFreeze: vi.fn().mockResolvedValue(undefined),
    setEquipped: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('ShopService.purchase', () => {
  it('buys an accessory when affordable: deducts + grants', async () => {
    const repo = makeRepo({ getWallet: vi.fn().mockResolvedValue({ coinBalance: 500, streakFreezes: 0 }) })
    const svc = new ShopService(repo as any)
    const r = await svc.purchase('u1', 'hat_party') // cost 150
    expect(r).toEqual({ ok: true, kind: 'accessory', coinBalance: 350 })
    expect(repo.grantAccessory).toHaveBeenCalledWith('u1', 'hat_party', 350)
  })

  it('rejects when insufficient, no write', async () => {
    const repo = makeRepo({ getWallet: vi.fn().mockResolvedValue({ coinBalance: 100, streakFreezes: 0 }) })
    const svc = new ShopService(repo as any)
    const r = await svc.purchase('u1', 'hat_party') // cost 150
    expect(r).toEqual({ ok: false, reason: 'insufficient' })
    expect(repo.grantAccessory).not.toHaveBeenCalled()
  })

  it('already-owned accessory is idempotent success, no charge', async () => {
    const repo = makeRepo({
      getWallet: vi.fn().mockResolvedValue({ coinBalance: 500, streakFreezes: 0 }),
      listOwned: vi.fn().mockResolvedValue(['hat_party']),
    })
    const svc = new ShopService(repo as any)
    const r = await svc.purchase('u1', 'hat_party')
    expect(r).toEqual({ ok: true, kind: 'accessory', coinBalance: 500, alreadyOwned: true })
    expect(repo.grantAccessory).not.toHaveBeenCalled()
  })

  it('unknown item rejected', async () => {
    const svc = new ShopService(makeRepo() as any)
    expect(await svc.purchase('u1', 'nope')).toEqual({ ok: false, reason: 'unknown_item' })
  })

  it('buys freeze under cap: deducts + bumps streakFreezes', async () => {
    const repo = makeRepo({ getWallet: vi.fn().mockResolvedValue({ coinBalance: 500, streakFreezes: 1 }) })
    const svc = new ShopService(repo as any)
    const r = await svc.purchase('u1', 'freeze_refill') // cost 120
    expect(r).toEqual({ ok: true, kind: 'consumable', coinBalance: 380 })
    expect(repo.grantFreeze).toHaveBeenCalledWith('u1', 380, 2)
  })

  it('rejects freeze at cap 3, no charge', async () => {
    const repo = makeRepo({ getWallet: vi.fn().mockResolvedValue({ coinBalance: 500, streakFreezes: 3 }) })
    const svc = new ShopService(repo as any)
    const r = await svc.purchase('u1', 'freeze_refill')
    expect(r).toEqual({ ok: false, reason: 'freeze_full' })
    expect(repo.grantFreeze).not.toHaveBeenCalled()
  })

  it('null wallet treated as zero balance → insufficient', async () => {
    const repo = makeRepo({ getWallet: vi.fn().mockResolvedValue(null) })
    const svc = new ShopService(repo as any)
    expect(await svc.purchase('u1', 'hat_party')).toEqual({ ok: false, reason: 'insufficient' })
  })

  it('rejects freeze on insufficient balance while under cap, no charge', async () => {
    const repo = makeRepo({ getWallet: vi.fn().mockResolvedValue({ coinBalance: 100, streakFreezes: 0 }) })
    const svc = new ShopService(repo as any)
    const r = await svc.purchase('u1', 'freeze_refill') // cost 120
    expect(r).toEqual({ ok: false, reason: 'insufficient' })
    expect(repo.grantFreeze).not.toHaveBeenCalled()
  })
})

describe('ShopService.equip', () => {
  it('equips an owned accessory in its slot', async () => {
    const repo = makeRepo({ listOwned: vi.fn().mockResolvedValue(['hat_party']) })
    const svc = new ShopService(repo as any)
    expect(await svc.equip('u1', 'head', 'hat_party')).toEqual({ ok: true })
    expect(repo.setEquipped).toHaveBeenCalledWith('u1', 'head', 'hat_party')
  })

  it('unequip (null) always succeeds', async () => {
    const repo = makeRepo()
    const svc = new ShopService(repo as any)
    expect(await svc.equip('u1', 'head', null)).toEqual({ ok: true })
    expect(repo.setEquipped).toHaveBeenCalledWith('u1', 'head', null)
  })

  it('rejects equipping an unowned item, no write', async () => {
    const repo = makeRepo({ listOwned: vi.fn().mockResolvedValue([]) })
    const svc = new ShopService(repo as any)
    expect(await svc.equip('u1', 'head', 'hat_party')).toEqual({ ok: false, reason: 'not_owned' })
    expect(repo.setEquipped).not.toHaveBeenCalled()
  })

  it('rejects wrong slot for the item', async () => {
    const repo = makeRepo({ listOwned: vi.fn().mockResolvedValue(['hat_party']) })
    const svc = new ShopService(repo as any)
    expect(await svc.equip('u1', 'neck', 'hat_party')).toEqual({ ok: false, reason: 'wrong_slot' })
  })

  it('rejects unknown item', async () => {
    const svc = new ShopService(makeRepo() as any)
    expect(await svc.equip('u1', 'head', 'nope')).toEqual({ ok: false, reason: 'unknown_item' })
  })

  it('rejects equipping a non-accessory (consumable) item, no write', async () => {
    const repo = makeRepo()
    const svc = new ShopService(repo as any)
    expect(await svc.equip('u1', 'head', 'freeze_refill')).toEqual({ ok: false, reason: 'unknown_item' })
    expect(repo.setEquipped).not.toHaveBeenCalled()
  })
})

describe('ShopService.getShopView', () => {
  it('marks owned/equipped/affordable per item', async () => {
    const repo = makeRepo({
      getWallet: vi.fn().mockResolvedValue({ coinBalance: 160, streakFreezes: 0 }),
      listOwned: vi.fn().mockResolvedValue(['hat_party']),
      getEquipped: vi.fn().mockResolvedValue({ head: 'hat_party', face: null, neck: null }),
    })
    const svc = new ShopService(repo as any)
    const view = await svc.getShopView('u1')
    expect(view.coinBalance).toBe(160)
    expect(view.freezeCap).toBe(3)
    const hat = view.items.find((i) => i.item.key === 'hat_party')!
    expect(hat).toMatchObject({ owned: true, equipped: true, affordable: true })
    const grad = view.items.find((i) => i.item.key === 'hat_grad')! // cost 250
    expect(grad).toMatchObject({ owned: false, equipped: false, affordable: false })
  })
})
