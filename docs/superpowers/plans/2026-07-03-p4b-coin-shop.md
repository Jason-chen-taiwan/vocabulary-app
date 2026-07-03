# 虛擬幣商店（P4b）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 給硬幣加上第一個消費出口——商店賣「凍結補充」與「小橙狐配件」，購買與裝備一律後端權威判定。

**Architecture:** 新增服務層模組 `lib/shop`（`catalog` 設定資料 + `ShopRepository` 資料存取 + `ShopService` 業務）。品項以設定資料描述；購買/裝備由 server action 經 `ShopService` 權威判定（查 catalog 價格、讀餘額、不足即拒、足夠才扣幣＋授予）。配件疊在既有 `Mascot` SVG 上；新 `/shop` 頁。

**Tech Stack:** Next.js App Router (server components + server actions)、React、TypeScript、Prisma 7 + Neon Postgres（HTTP，無交易）、Vitest。

## Global Constraints

- **模組化第一**：`lib/shop` 對外只暴露 `ShopService`；學習/遊戲化核心不得 import shop。新增品項＝往 `catalog.ts` 加一筆，程式不動。（CLAUDE.md 第一準則 + 準則 4）
- **虛擬經濟收斂**：硬幣餘額唯一真相是 `GamificationState.coinBalance`。shop 是除 gamification 外唯一可改 `coinBalance` 的服務（花幣方向）。（CLAUDE.md 準則 8）
- **後端權威**：`userId` 一律由 `getCurrentUser()` 取；前端只送 `itemKey`/`slot`，永不送價格、餘額、擁有狀態。價格從 catalog 查、餘額後端讀、不足即拒。（CLAUDE.md 資安鐵則）
- **凍結上限**：買到的凍結與自動給的共用 `GamificationState.streakFreezes`，上限沿用 `FREEZE_CAP = 3`（`lib/gamification/rules.ts`）。
- **資料存取**：一律經 repository；Neon HTTP 單筆寫入、**無交易**（沿用既有 read-modify-write 取捨）。
- **TDD**：純函式/service/repository 先寫失敗測試再實作。測試用注入的 fake db/repo（比照 `lib/gamification/__tests__/repository.test.ts`）。
- **UI 元件路徑**：沿用 `@/components/ui/*`（Card/Button）、`@/components/gamification-bar`、`@/lib/auth/session` 的 `getCurrentUser`、`@/lib/db/client` 的 `getPrisma`。
- **既有測試全綠**：完工時 `npx vitest run`、`npx tsc --noEmit`、`npm run build` 皆通過。

---

## File Structure

- `prisma/schema.prisma` — **Modify**：新增 `UserItem` model；`GamificationState` 加 `equippedHead/Face/Neck`；`User` 加 `items UserItem[]`。
- `lib/shop/catalog.ts` — **Create**：`ShopItem` 型別、`CATALOG` 設定資料、純函式。
- `lib/shop/__tests__/catalog.test.ts` — **Create**。
- `lib/shop/repository.ts` — **Create**：`ShopRepository`（injectable db）+ `Wallet`/`Equipped` 型別。
- `lib/shop/__tests__/repository.test.ts` — **Create**。
- `lib/shop/service.ts` — **Create**：`ShopService` + `ShopView`/`PurchaseResult`/`EquipResult` 型別 + `shopService` 單例。
- `lib/shop/__tests__/service.test.ts` — **Create**。
- `app/shop/actions.ts` — **Create**：`purchaseAction`/`equipAction`（server action，組合根）。
- `components/ui/mascot-accessories.tsx` — **Create**：配件 SVG registry + `accessoryLayerKeys` 純函式 + `AccessoryLayers` 元件。
- `components/ui/__tests__/mascot-accessories.test.ts` — **Create**。
- `components/ui/mascot.tsx` — **Modify**：加 `equipped` prop，渲染 `AccessoryLayers`。
- `app/shop/page.tsx` — **Create**：server 頁。
- `app/shop/shop-client.tsx` — **Create**：client 互動（購買/裝備 + mascot 預覽）。
- `app/page.tsx` — **Modify**：加 `/shop` 入口連結；首頁 mascot 戴上已裝備配件。
- `app/learn/[slug]/page.tsx` — **Modify**：抓 equipped 傳給 `ReviewSession`。
- `components/review-session.tsx` — **Modify**：加 `equipped` prop，結束畫面 mascot 戴上配件。

---

### Task 1: Prisma schema — UserItem + 裝備槽

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `UserItem` 表（`@@unique([userId, itemKey])`）；`GamificationState.equippedHead/equippedFace/equippedNeck: String?`；`User.items: UserItem[]`。

- [ ] **Step 1: 在 `User` model 加反向關聯**

在 `prisma/schema.prisma` 的 `User` model，於 `gamification  GamificationState?` 那行下方加一行：

```prisma
  items         UserItem[]
```

- [ ] **Step 2: 在 `GamificationState` model 加裝備槽欄位**

在 `GamificationState` model 的 `weekStartDate  String?` 那行下方加：

```prisma
  equippedHead   String?
  equippedFace   String?
  equippedNeck   String?
```

- [ ] **Step 3: 新增 `UserItem` model**

在檔案結尾（`UserBadge` model 之後）新增：

```prisma
model UserItem {
  id         String   @id @default(cuid())
  userId     String
  itemKey    String
  acquiredAt DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, itemKey])
  @@index([userId])
}
```

- [ ] **Step 4: 產生 client + 推送到 Neon**

Run: `npx prisma generate && npx prisma db push`
Expected: `generate` 成功；`db push` 顯示新增 `UserItem` 表與三個欄位、無破壞性警告、`Your database is now in sync`。

- [ ] **Step 5: 型別檢查（確認 client 型別更新）**

Run: `npx tsc --noEmit`
Expected: 乾淨無錯。

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(shop): UserItem model + mascot equip slots (db:push)"
```

---

### Task 2: catalog 設定資料 + 純函式

**Files:**
- Create: `lib/shop/catalog.ts`
- Test: `lib/shop/__tests__/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = 'head' | 'face' | 'neck'`；`const SLOTS: readonly Slot[]`。
  - `type ConsumableItem = { key: string; kind: 'consumable'; effect: 'freeze'; name: string; desc: string; cost: number }`
  - `type AccessoryItem = { key: string; kind: 'accessory'; slot: Slot; name: string; desc: string; cost: number }`
  - `type ShopItem = ConsumableItem | AccessoryItem`
  - `const CATALOG: readonly ShopItem[]`
  - `function itemByKey(key: string): ShopItem | undefined`
  - `function isAccessory(i: ShopItem): i is AccessoryItem`
  - `function accessoriesBySlot(slot: Slot): AccessoryItem[]`

- [ ] **Step 1: 寫失敗測試**

`lib/shop/__tests__/catalog.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { CATALOG, itemByKey, isAccessory, accessoriesBySlot } from '@/lib/shop/catalog'

describe('catalog', () => {
  it('itemByKey finds a known item', () => {
    expect(itemByKey('freeze_refill')?.kind).toBe('consumable')
    expect(itemByKey('hat_party')?.name).toBe('派對帽')
  })

  it('itemByKey returns undefined for unknown key', () => {
    expect(itemByKey('nope')).toBeUndefined()
  })

  it('isAccessory narrows correctly', () => {
    const freeze = itemByKey('freeze_refill')!
    const hat = itemByKey('hat_party')!
    expect(isAccessory(freeze)).toBe(false)
    expect(isAccessory(hat)).toBe(true)
  })

  it('accessoriesBySlot returns only that slot', () => {
    const head = accessoriesBySlot('head')
    expect(head.length).toBeGreaterThan(0)
    expect(head.every((i) => i.slot === 'head')).toBe(true)
  })

  it('all costs are positive integers', () => {
    expect(CATALOG.every((i) => Number.isInteger(i.cost) && i.cost > 0)).toBe(true)
  })

  it('all keys are unique', () => {
    const keys = CATALOG.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/shop/__tests__/catalog.test.ts`
Expected: FAIL（找不到模組 `@/lib/shop/catalog`）。

- [ ] **Step 3: 實作 catalog**

`lib/shop/catalog.ts`：

```ts
// 商店品項設定資料。新增品項＝往 CATALOG 加一筆，程式不動（CLAUDE.md 準則 4）。
// 純函式，無 I/O。
export type Slot = 'head' | 'face' | 'neck'
export const SLOTS: readonly Slot[] = ['head', 'face', 'neck']

export type ConsumableItem = {
  key: string; kind: 'consumable'; effect: 'freeze'; name: string; desc: string; cost: number
}
export type AccessoryItem = {
  key: string; kind: 'accessory'; slot: Slot; name: string; desc: string; cost: number
}
export type ShopItem = ConsumableItem | AccessoryItem

export const CATALOG: readonly ShopItem[] = [
  { key: 'freeze_refill', kind: 'consumable', effect: 'freeze', name: '凍結補充', desc: '+1 連續達標凍結（上限 3）', cost: 120 },
  { key: 'hat_party',     kind: 'accessory', slot: 'head', name: '派對帽',   desc: '慶祝感十足的尖頂帽', cost: 150 },
  { key: 'hat_grad',      kind: 'accessory', slot: 'head', name: '學士帽',   desc: '學霸象徵',           cost: 250 },
  { key: 'glasses_round', kind: 'accessory', slot: 'face', name: '圓框眼鏡', desc: '文青風圓框',         cost: 150 },
  { key: 'glasses_star',  kind: 'accessory', slot: 'face', name: '星星墨鏡', desc: '派對明星',           cost: 300 },
  { key: 'scarf_orange',  kind: 'accessory', slot: 'neck', name: '橙圍巾',   desc: '溫暖的橙色圍巾',     cost: 150 },
  { key: 'bowtie',        kind: 'accessory', slot: 'neck', name: '領結',     desc: '正式場合首選',       cost: 200 },
]

export function itemByKey(key: string): ShopItem | undefined {
  return CATALOG.find((i) => i.key === key)
}

export function isAccessory(i: ShopItem): i is AccessoryItem {
  return i.kind === 'accessory'
}

export function accessoriesBySlot(slot: Slot): AccessoryItem[] {
  return CATALOG.filter((i): i is AccessoryItem => isAccessory(i) && i.slot === slot)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/shop/__tests__/catalog.test.ts`
Expected: PASS（6 個測試）。

- [ ] **Step 5: Commit**

```bash
git add lib/shop/catalog.ts lib/shop/__tests__/catalog.test.ts
git commit -m "feat(shop): catalog config data + pure helpers"
```

---

### Task 3: ShopRepository

**Files:**
- Create: `lib/shop/repository.ts`
- Test: `lib/shop/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: `Slot`（Task 2）、`getPrisma`（`@/lib/db/client`）。
- Produces:
  - `interface Wallet { coinBalance: number; streakFreezes: number }`
  - `interface Equipped { head: string | null; face: string | null; neck: string | null }`
  - `class ShopRepository`（`constructor(db?)`）:
    - `getWallet(userId): Promise<Wallet | null>`
    - `getEquipped(userId): Promise<Equipped>`
    - `listOwned(userId): Promise<string[]>`
    - `grantAccessory(userId, itemKey, newBalance): Promise<void>`
    - `grantFreeze(userId, newBalance, newFreezes): Promise<void>`
    - `setEquipped(userId, slot, itemKey: string | null): Promise<void>`

- [ ] **Step 1: 寫失敗測試**

`lib/shop/__tests__/repository.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/shop/__tests__/repository.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 repository**

`lib/shop/repository.ts`：

```ts
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/shop/__tests__/repository.test.ts`
Expected: PASS（8 個測試）。

- [ ] **Step 5: Commit**

```bash
git add lib/shop/repository.ts lib/shop/__tests__/repository.test.ts
git commit -m "feat(shop): ShopRepository (wallet/owned/equipped/grant/setEquipped)"
```

---

### Task 4: ShopService（後端權威購買/裝備核心）

**Files:**
- Create: `lib/shop/service.ts`
- Test: `lib/shop/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `CATALOG`/`itemByKey`/`isAccessory`/`Slot`（Task 2）、`ShopRepository`/`Wallet`/`Equipped`（Task 3）、`FREEZE_CAP`（`@/lib/gamification/rules`）。
- Produces:
  - `interface ShopItemView { item: ShopItem; owned: boolean; equipped: boolean; affordable: boolean }`
  - `interface ShopView { coinBalance: number; streakFreezes: number; freezeCap: number; items: ShopItemView[] }`
  - `type PurchaseResult = { ok: true; kind: 'accessory' | 'consumable'; coinBalance: number; alreadyOwned?: boolean } | { ok: false; reason: 'unauthorized' | 'unknown_item' | 'insufficient' | 'freeze_full' }`
  - `type EquipResult = { ok: boolean; reason?: 'unauthorized' | 'unknown_item' | 'not_owned' | 'wrong_slot' }`
  - `class ShopService`（`constructor(repo?)`）: `getShopView(userId)`、`purchase(userId, itemKey)`、`equip(userId, slot, itemKey|null)`。
  - `const shopService: ShopService`（單例）。

- [ ] **Step 1: 寫失敗測試**

`lib/shop/__tests__/service.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/shop/__tests__/service.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 service**

`lib/shop/service.ts`：

```ts
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/shop/__tests__/service.test.ts`
Expected: PASS（全部通過）。

- [ ] **Step 5: Commit**

```bash
git add lib/shop/service.ts lib/shop/__tests__/service.test.ts
git commit -m "feat(shop): ShopService — server-authoritative purchase/equip + getShopView"
```

---

### Task 5: server actions（組合根）

**Files:**
- Create: `app/shop/actions.ts`

**Interfaces:**
- Consumes: `getCurrentUser`（`@/lib/auth/session`）、`shopService`、`Slot`、`PurchaseResult`/`EquipResult`（Task 4）。
- Produces: `purchaseAction(itemKey: string): Promise<PurchaseResult>`、`equipAction(slot: Slot, itemKey: string | null): Promise<EquipResult>`。

> 註：server action 依賴 `getCurrentUser()`（session），比照既有 `app/settings/actions.ts` 不做單元測試；由 tsc/build + Task 9 手動 e2e 驗證。權威判定邏輯已在 Task 4 完整測過。

- [ ] **Step 1: 實作 actions**

`app/shop/actions.ts`：

```ts
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
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 乾淨無錯。

- [ ] **Step 3: Commit**

```bash
git add app/shop/actions.ts
git commit -m "feat(shop): purchase/equip server actions (auth via getCurrentUser)"
```

---

### Task 6: mascot 配件圖層 + Mascot 擴充

**Files:**
- Create: `components/ui/mascot-accessories.tsx`
- Test: `components/ui/__tests__/mascot-accessories.test.ts`
- Modify: `components/ui/mascot.tsx`

**Interfaces:**
- Produces:
  - `type EquippedShape = { head?: string | null; face?: string | null; neck?: string | null }`
  - `function accessoryLayerKeys(equipped?: EquippedShape): string[]`（z-order：neck → face → head，過濾掉 null/未知 key）
  - `const ACCESSORY_SVG: Record<string, ReactNode>`（key＝catalog itemKey）
  - `function AccessoryLayers({ equipped }: { equipped?: EquippedShape }): ReactNode`
- Modify: `Mascot` 加 `equipped?: EquippedShape` prop，於 `</svg>` 前渲染 `<AccessoryLayers equipped={equipped} />`。

> 配件與 shop 之間的唯一契約是「itemKey 字串」，UI 自持一份 SVG registry，維持 `components/ui` 不依賴 `lib/shop`。`accessoryLayerKeys` 只回 registry 內存在的 key（未知 key 忽略），避免壞資料炸畫面。

- [ ] **Step 1: 寫失敗測試（純函式）**

`components/ui/__tests__/mascot-accessories.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { accessoryLayerKeys, ACCESSORY_SVG } from '@/components/ui/mascot-accessories'

describe('accessoryLayerKeys', () => {
  it('returns [] for undefined', () => {
    expect(accessoryLayerKeys(undefined)).toEqual([])
  })

  it('filters nulls, orders neck→face→head', () => {
    expect(accessoryLayerKeys({ head: 'hat_party', face: null, neck: 'scarf_orange' }))
      .toEqual(['scarf_orange', 'hat_party'])
  })

  it('drops keys not present in the SVG registry', () => {
    expect(accessoryLayerKeys({ head: 'bogus_key', face: 'glasses_round', neck: null }))
      .toEqual(['glasses_round'])
  })

  it('every catalog-ish key rendered has an SVG entry', () => {
    for (const k of ['freeze_refill']) {
      // consumables never render as a layer; registry only needs accessory keys
      expect(ACCESSORY_SVG[k]).toBeUndefined()
    }
    for (const k of ['hat_party', 'hat_grad', 'glasses_round', 'glasses_star', 'scarf_orange', 'bowtie']) {
      expect(ACCESSORY_SVG[k]).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/ui/__tests__/mascot-accessories.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 mascot-accessories**

`components/ui/mascot-accessories.tsx`（配件疊在 120×130 viewBox 的小橙狐上；顏色沿用 INK + 少量裝飾用 literal hex，比照既有 mascot 的 `#2BB3C0` 先例）：

```tsx
import type { ReactNode } from 'react'

export type EquippedShape = { head?: string | null; face?: string | null; neck?: string | null }

const INK = '#1A1A1A'

// key = catalog itemKey。配件相對於小橙狐臉部（ellipse cx60 cy62 rx40 ry36、眼 y54、耳頂 y8）。
export const ACCESSORY_SVG: Record<string, ReactNode> = {
  // ── head ──
  hat_party: (
    <>
      <polygon points="42,24 60,-2 78,24" fill="#7C5CFF" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="60" cy="-2" r="4" fill="#FFD23F" stroke={INK} strokeWidth="2" />
    </>
  ),
  hat_grad: (
    <>
      <polygon points="60,4 96,18 60,32 24,18" fill={INK} />
      <rect x="46" y="18" width="28" height="10" fill={INK} />
      <path d="M92 18 v12" stroke="#FFD23F" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="92" cy="31" r="3" fill="#FFD23F" />
    </>
  ),
  // ── face ── (eyes at x47/x73, y54)
  glasses_round: (
    <>
      <circle cx="47" cy="54" r="9" fill="none" stroke={INK} strokeWidth="3" />
      <circle cx="73" cy="54" r="9" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M56 54 h8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  glasses_star: (
    <>
      <rect x="37" y="47" width="20" height="14" rx="4" fill={INK} />
      <rect x="63" y="47" width="20" height="14" rx="4" fill={INK} />
      <path d="M57 54 h6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <text x="42" y="58" fontSize="9" fill="#FFD23F">★</text>
      <text x="68" y="58" fontSize="9" fill="#FFD23F">★</text>
    </>
  ),
  // ── neck ── (below face, ~y100)
  scarf_orange: (
    <path d="M32 98 q28 14 56 0 l0 9 q-28 14 -56 0 Z" fill="#FF8C42" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
  ),
  bowtie: (
    <>
      <polygon points="60,104 44,96 44,112" fill="#E23D5A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="60,104 76,96 76,112" fill="#E23D5A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="60" cy="104" r="4" fill={INK} />
    </>
  ),
}

const ORDER: Array<keyof EquippedShape> = ['neck', 'face', 'head']

export function accessoryLayerKeys(equipped?: EquippedShape): string[] {
  if (!equipped) return []
  return ORDER
    .map((slot) => equipped[slot])
    .filter((k): k is string => !!k && k in ACCESSORY_SVG)
}

export function AccessoryLayers({ equipped }: { equipped?: EquippedShape }): ReactNode {
  return <>{accessoryLayerKeys(equipped).map((k) => <g key={k}>{ACCESSORY_SVG[k]}</g>)}</>
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run components/ui/__tests__/mascot-accessories.test.ts`
Expected: PASS。

- [ ] **Step 5: 擴充 Mascot 接受 equipped**

修改 `components/ui/mascot.tsx`：

在檔案最上方 import：

```tsx
import { AccessoryLayers, type EquippedShape } from './mascot-accessories'
```

把 `Mascot` 的簽章與 props 解構改為（加 `equipped`）：

```tsx
export function Mascot({ mood = 'hi', size = 120, className = '', equipped }: { mood?: MascotMood; size?: number; className?: string; equipped?: EquippedShape }) {
```

在 `return` 的最後、`</svg>` 之前插入一行（配件疊在最上層）：

```tsx
      <AccessoryLayers equipped={equipped} />
```

- [ ] **Step 6: 全量測試 + 型別 + build（確認 Mascot 未裝備時輸出不變、JSX 正確）**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 全綠、乾淨、成功。

- [ ] **Step 7: Commit**

```bash
git add components/ui/mascot-accessories.tsx components/ui/__tests__/mascot-accessories.test.ts components/ui/mascot.tsx
git commit -m "feat(shop): mascot accessory layers + Mascot equipped prop"
```

---

### Task 7: `/shop` 頁 + client 互動

**Files:**
- Create: `app/shop/page.tsx`, `app/shop/shop-client.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`、`shopService.getShopView`、`ShopRepository.getEquipped`、`ShopView`（Task 4）、`Equipped`（Task 3）、`purchaseAction`/`equipAction`（Task 5）、`Mascot`（Task 6）、`GamificationBar`、`Card`、`Button`。

- [ ] **Step 1: 實作 `app/shop/page.tsx`**（server 抓資料）

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { shopService } from '@/lib/shop/service'
import { ShopRepository } from '@/lib/shop/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { ShopClient } from './shop-client'

export default async function ShopPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new ShopRepository()
  const [view, equipped] = await Promise.all([
    shopService.getShopView(user.id),
    repo.getEquipped(user.id),
  ])
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
        <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">商店</h1>
        <ShopClient view={view} equipped={equipped} />
      </main>
    </>
  )
}
```

- [ ] **Step 2: 實作 `app/shop/shop-client.tsx`**（client 購買/裝備 + mascot 預覽）

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mascot } from '@/components/ui/mascot'
import { purchaseAction, equipAction } from './actions'
import type { ShopView } from '@/lib/shop/service'
import type { Equipped } from '@/lib/shop/repository'
import type { Slot } from '@/lib/shop/catalog'

function reasonText(reason: string): string {
  switch (reason) {
    case 'insufficient': return '硬幣不足'
    case 'freeze_full': return '凍結已達上限'
    case 'unknown_item': return '找不到品項'
    case 'unauthorized': return '請先登入'
    case 'not_owned': return '尚未擁有'
    case 'wrong_slot': return '槽位不符'
    default: return '操作失敗'
  }
}

export function ShopClient({ view, equipped }: { view: ShopView; equipped: Equipped }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function buy(key: string) {
    setBusy(true); setMsg(null)
    const r = await purchaseAction(key)
    setMsg(r.ok ? (r.alreadyOwned ? '已擁有' : '購買成功！') : reasonText(r.reason))
    router.refresh()
    setBusy(false)
  }

  async function toggleEquip(slot: Slot, key: string, isEquipped: boolean) {
    setBusy(true); setMsg(null)
    await equipAction(slot, isEquipped ? null : key)
    router.refresh()
    setBusy(false)
  }

  const consumables = view.items.filter((i) => i.item.kind === 'consumable')
  const accessories = view.items.filter((i) => i.item.kind === 'accessory')

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4 p-5">
        <Mascot mood="hi" size={96} equipped={equipped} />
        <div>
          <div className="text-2xl font-extrabold text-primary-600">🪙 {view.coinBalance}</div>
          <div className="text-xs font-semibold text-neutral-600">凍結 {view.streakFreezes}/{view.freezeCap}</div>
        </div>
      </Card>

      {msg && <p className="text-sm font-semibold text-primary-600">{msg}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-neutral-900">凍結</h2>
        {consumables.map(({ item, affordable }) => {
          const full = view.streakFreezes >= view.freezeCap
          return (
            <Card key={item.key} className="flex items-center justify-between p-4">
              <div>
                <div className="font-bold text-neutral-900">{item.name}</div>
                <div className="text-xs text-neutral-600">{item.desc}</div>
              </div>
              <Button onClick={() => buy(item.key)} disabled={busy || full || !affordable}>
                {full ? '已滿' : `🪙 ${item.cost}`}
              </Button>
            </Card>
          )
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-neutral-900">小橙狐配件</h2>
        {accessories.map(({ item, owned, equipped: isEquipped, affordable }) => {
          const slot = item.kind === 'accessory' ? item.slot : 'head'
          return (
            <Card key={item.key} className="flex items-center justify-between p-4">
              <div>
                <div className="font-bold text-neutral-900">{item.name} <span className="text-xs font-normal text-neutral-600">（{slot}）</span></div>
                <div className="text-xs text-neutral-600">{item.desc}</div>
              </div>
              {owned ? (
                <Button variant="secondary" onClick={() => toggleEquip(slot as Slot, item.key, isEquipped)} disabled={busy}>
                  {isEquipped ? '卸下' : '裝備'}
                </Button>
              ) : (
                <Button onClick={() => buy(item.key)} disabled={busy || !affordable}>🪙 {item.cost}</Button>
              )}
            </Card>
          )
        })}
      </section>
    </div>
  )
}
```

> 註：`Button`（`components/ui/button.tsx`）已支援 `variant`（`'primary' | 'secondary' | 'ghost' | 'celebrate'`），此處 `variant="secondary"` 合法。

- [ ] **Step 3: 型別 + build（確認頁面/路由生成）**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功，輸出含 `/shop` 路由。

- [ ] **Step 4: Commit**

```bash
git add app/shop/page.tsx app/shop/shop-client.tsx
git commit -m "feat(shop): /shop page (buy/equip grid + mascot preview)"
```

---

### Task 8: 入口連結 + 各處 mascot 戴上配件

**Files:**
- Modify: `app/page.tsx`（首頁入口 + 首頁 mascot equipped）
- Modify: `app/learn/[slug]/page.tsx`（抓 equipped 傳給 ReviewSession）
- Modify: `components/review-session.tsx`（結束畫面 mascot equipped）

**Interfaces:**
- Consumes: `ShopRepository.getEquipped`（Task 3）、`Equipped`（Task 3）、`Mascot` 的 `equipped` prop（Task 6）。
- Produces: `ReviewSession` 新增 optional prop `equipped?: Equipped`。

- [ ] **Step 1: 首頁加 `/shop` 入口 + mascot 戴配件**

修改 `app/page.tsx`：

在 import 區加：

```tsx
import { ShopRepository } from '@/lib/shop/repository'
```

在 `let done = 0, ...` 之前宣告 equipped 預設值：

```tsx
  let equipped = { head: null, face: null, neck: null }
```

在既有 `try { ... }` 區塊內、`getContext` 成功之後加抓取（放在 `try` 內即可，失敗時 fallback 預設）：

```tsx
    equipped = await new ShopRepository().getEquipped(user.id)
```

把首頁的 `<Mascot ... />` 改為帶 equipped：

```tsx
        <Mascot mood={moodForHome({ goalMet: done >= goal, streak, longestStreak: longest })} size={120} equipped={equipped} />
```

在 `查看排行榜 🏆` 連結下方加商店入口：

```tsx
        <Link href="/shop" className="text-sm font-bold text-primary-600 hover:underline">前往商店 🛍️</Link>
```

- [ ] **Step 2: ReviewSession 加 equipped prop 並用於結束畫面**

修改 `components/review-session.tsx`：

在 import 區加：

```tsx
import type { Equipped } from '@/lib/shop/repository'
```

把元件簽章加上 `equipped`：

```tsx
export function ReviewSession({ bookName, bookSlug, items, equipped }: { bookName: string; bookSlug: string; items: ReviewItem[]; equipped?: Equipped }) {
```

把「結束慶祝畫面」的那顆 `<Mascot mood={moodForSessionEnd(...)} size={132} ... />` 加上 `equipped={equipped}`：

```tsx
        <Mascot mood={moodForSessionEnd({ correct: correctCount, total: finishedTotal })} size={132} className="mx-auto" equipped={equipped} />
```

- [ ] **Step 3: learn 頁抓 equipped 並傳入**

修改 `app/learn/[slug]/page.tsx`：

在 import 區加：

```tsx
import { ShopRepository } from '@/lib/shop/repository'
```

在函式內、`return <ReviewSession ... />` 之前抓 equipped：

```tsx
  const equipped = await new ShopRepository().getEquipped(user.id)
```

把最後一行改為：

```tsx
  return <ReviewSession bookName={book.name} bookSlug={slug} items={reviewItems} equipped={equipped} />
```

- [ ] **Step 4: 全量測試 + 型別 + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 全綠、乾淨、成功。

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/learn/[slug]/page.tsx components/review-session.tsx
git commit -m "feat(shop): home entry link + mascot wears equipped accessories"
```

---

### Task 9: 全量驗證 + 手動 e2e

**Files:** 無（驗證）

- [ ] **Step 1: 全量測試 + 型別 + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 全綠（含新增的 catalog/repository/service/mascot-accessories 測試）、乾淨、成功，輸出含 `/shop` 路由。

- [ ] **Step 2: 手動 e2e（dev）**

`npm run dev`，登入後（帳號需先有硬幣：跑一輪複習達每日目標拿 +50，或已有餘額）：
- 到 `/shop`：看到 🪙 餘額與 凍結 n/3、mascot 預覽、凍結區與配件區。
- **買配件**：餘額足→點價格鈕→顯示「購買成功！」、餘額扣除、該件變「裝備」鈕。
- **裝備/卸下**：點「裝備」→ mascot 預覽戴上配件；「卸下」→ 移除。回首頁確認首頁 mascot 也戴著。
- **買凍結**：凍結 <3 時可買、streakFreezes +1；到 3 時鈕顯示「已滿」且禁用。
- **餘額不足**：對買不起的配件，鈕禁用；（可選）用 devtools 直接呼叫 `purchaseAction('hat_grad')` 在餘額不足時應回 `{ok:false, reason:'insufficient'}`，餘額不變——驗證後端權威。
- **防偽驗證（可選）**：Network 觀察 server action 送出的僅是 `itemKey`（無價格/餘額）；扣幣與授予都由 server 判定。
驗證後關閉 dev server。

- [ ] **Step 3: 最終 commit（若有微調）**

```bash
git add -A && git commit -m "test(shop): verification pass"
```

---

## Self-Review

**1. Spec coverage：**
- §2 後端權威購買/裝備（getCurrentUser、catalog 查價、餘額後端讀、不足即拒、freeze cap、equip 驗證擁有/slot）→ Task 4（邏輯）+ Task 5（組合根）✓
- §3 資料模型（UserItem `@@unique`、equipped* 欄位、User relation、db:push）→ Task 1 ✓
- §4 catalog 設定資料 + 純函式 → Task 2 ✓
- §5 凍結共用 streakFreezes、上限 FREEZE_CAP=3 → Task 4 purchase 分支 + 測試 ✓
- §6 shop 模組（catalog/repository/service、getShopView、不訂閱事件、不 import gamification 規則）→ Task 2/3/4 ✓（僅 import `FREEZE_CAP` 常數，非規則邏輯；符合準則）
- §7 UI（/shop 兩區 + mascot 疊配件 + 首頁入口 + 首頁/結束畫面戴配件）→ Task 6/7/8 ✓
- §8 純函式與測試（catalog、ShopService 契約全分支、repository、mascot 選層）→ Task 2/3/4/6 TDD + Task 9 ✓
- §9 邊界、§10 成本（無 cron/AI）、§11 排除、參數 → 對齊 ✓

**2. Placeholder scan：** 無 TBD/「適當處理」；每個 code step 皆含完整程式或精確編輯。Task 5 明列「不寫單元測試」理由（比照 settings/actions），非佔位。✓

**3. Type consistency：**
- `Slot`（catalog）→ repository `setEquipped`/`SLOT_FIELD`、service `equip`、actions、shop-client 一致。✓
- `Wallet`/`Equipped`（repository）→ service `getWallet`/`getEquipped` 回傳、page/shop-client/ReviewSession/home 使用一致。✓
- `ShopView`/`ShopItemView`/`PurchaseResult`/`EquipResult`（service）→ actions 回傳、shop-client 使用一致（reason 字串集合對齊 `reasonText`）。✓
- `EquippedShape`（mascot-accessories）→ `Mascot` prop、`accessoryLayerKeys`/`AccessoryLayers` 一致；`Equipped`（`{head,face,neck}` 全非 optional）結構相容於 `EquippedShape`（optional），傳入合法。✓
- `FREEZE_CAP`（gamification/rules，已存在＝3）→ service 使用、測試註記一致。✓
- `getShopView` 回 `freezeCap` → shop-client `view.freezeCap` 使用一致。✓
- `purchaseAction(itemKey)`/`equipAction(slot, itemKey|null)` → shop-client 呼叫一致。✓
