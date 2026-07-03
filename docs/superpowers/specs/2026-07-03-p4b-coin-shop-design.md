# 虛擬幣商店（P4b）設計文件

- **日期**：2026-07-03
- **狀態**：待核准
- **範圍**：硬幣的第一個「消費出口（sink）」。商店賣兩類品項：**凍結補充**（consumable，接既有 streak 凍結機制）＋ **小橙狐配件**（accessory，多槽 head/face/neck，永久擁有可裝備）。購買/裝備一律後端權威判定。付費金流、交易帳本、主題色/深色模式、送禮/交易、稀有度/隨機包為後續。

---

## 1. 目的

目前硬幣只進不出：既有 `applyReview` 會發幣（每日達標 +50、精熟 +20），但**沒有地方花**。P4b 補上這個 sink，讓硬幣有意義，並提供正向、非付費牆的收集/自訂樂趣（打扮吉祥物、補充 streak 保險）。

設計以 CLAUDE.md 第一準則（模組化、可擴充、可維護）與新第 8 條（虛擬經濟收斂）為依歸：**新增品項＝往設定資料加一筆，程式不動**。

## 2. 安全：後端權威購買（先決）

購買與裝備都影響「獎勵/共享狀態數值」，落實 CLAUDE.md 資安鐵則 + 第 8 條：

- 前端只送「買哪件 / 裝備哪件」的 `itemKey`（與 slot），**永不送價格、餘額、擁有狀態**。
- `purchaseAction(itemKey)`：server 端
  1. `userId` 由 `getCurrentUser()` 取（不信前端宣稱身分）；未登入即拒。
  2. 從 **catalog** 查該 `itemKey` 定義與**價格**（前端送的價格一律忽略）；查無此 key → 拒。
  3. 讀當前 `coinBalance`；**餘額不足 → 拒，餘額不動**。
  4. 依品項類別授予：
     - `accessory`：若已擁有 → **冪等**（不重扣、回傳 already-owned）；否則扣幣 + 寫 `UserItem`。
     - `consumable/freeze`：**先檢查 `streakFreezes` 是否已達上限 3**，已滿 → 拒（不扣幣）；否則扣幣 + `streakFreezes += 1`。
- `equipAction(slot, itemKey | null)`：server 端驗證
  - `itemKey === null` → 卸下該 slot。
  - 否則：該 `itemKey` 必須存在於 catalog、`kind==='accessory'`、其 `slot` 等於傳入 slot、且該使用者**確實擁有**（`UserItem` 有列）→ 才寫入對應 `equipped*` 欄位；任一不符即拒。
- 硬幣的讀改寫沿用 Neon HTTP 無交易的 read-modify-write（單使用者 UI busy-guard 序列化，比照 `gamification/service.ts` 既有註解）。**誠實限制**：多分頁/多裝置同時購買在極端競態下可能有 lost update（花超過餘額或重複授予），機率低且只影響自己；徹底防需交易或原子扣減，列為後續（見 §10）。

## 3. 資料模型（Prisma，db:push 到 live Neon）

新表 `UserItem`（比照既有 `UserBadge`）：

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

`GamificationState` 新增裝備槽（nullable，預設未裝備）：
- `equippedHead String?`
- `equippedFace String?`
- `equippedNeck String?`

硬幣餘額沿用既有 `coinBalance`；凍結沿用既有 `streakFreezes`（上限仍 3，見 §5）。`User` 加反向關聯 `items UserItem[]`。`db:push` 同步（純新增，無破壞性）。

## 4. 品項設定資料（`lib/shop/catalog.ts`）

品項以設定資料描述（CLAUDE.md 準則 4）。純函式對外，無 I/O：

```ts
export type Slot = 'head' | 'face' | 'neck'

export type ShopItem =
  | { key: string; kind: 'consumable'; effect: 'freeze'; name: string; desc: string; cost: number }
  | { key: string; kind: 'accessory';  slot: Slot;       name: string; desc: string; cost: number }

export const CATALOG: readonly ShopItem[] = [ /* … */ ]

// 純函式
export function itemByKey(key: string): ShopItem | undefined
export function accessoriesBySlot(slot: Slot): ShopItem[]
export function isAccessory(i: ShopItem): i is Extract<ShopItem, { kind: 'accessory' }>
```

初版目錄（價格用既有經濟校準：每日達標 +50、精熟 +20）：
- **凍結補充** `freeze_refill`：+1 streak 凍結，`cost` 120。
- **配件**（每槽 2–3 件，皆原創 inline SVG，沿用貼紙描邊風）：
  - head：`hat_party`（派對帽）、`hat_grad`（學士帽）
  - face：`glasses_round`（圓框眼鏡）、`glasses_star`（星星墨鏡）
  - neck：`scarf_orange`（橙圍巾）、`bowtie`（領結）
  - 價格帶約 150–300（凍結最便宜、配件依「稀有感」微調；純數值可日後調）。

> 件數/價格皆為可調參數（§11），非核心邏輯。

## 5. 凍結與既有 streak 機制的關係

- 買到的凍結與自動給的凍結**共用同一個 `streakFreezes` 欄位**，**上限仍為 3**（`FREEZE_CAP`）。
- 已達 3 → `purchaseAction('freeze_refill')` 拒絕（不扣幣），UI 顯示「凍結已滿」。
- 消耗邏輯不變：既有 `updateStreak` 於漏天時自動消耗凍結保住 streak（`lib/gamification/rules.ts`），不因來源不同而異。
- 好處：防 pay-to-win、streak 仍有意義、機制最簡（不新增欄位）。

## 6. shop 模組（`lib/shop`）

新增服務層模組（CLAUDE.md 模組邊界已加 `shop`）：

- `catalog.ts`：§4 的設定資料 + 純函式。
- `repository.ts`（`ShopRepository`，建構子可注入 db，預設 `getPrisma()`）：
  - `getWallet(userId): Promise<{ coinBalance; streakFreezes } | null>` — 讀 GamificationState 相關欄位。
  - `listOwned(userId): Promise<string[]>` — 該使用者 `UserItem.itemKey` 陣列。
  - `getEquipped(userId): Promise<{ head; face; neck }>`（各 `string | null`）。
  - `grantAccessory(userId, itemKey, newBalance): Promise<void>` — 寫 `UserItem` + 更新 `coinBalance`。
  - `grantFreeze(userId, newBalance, newFreezes): Promise<void>` — 更新 `coinBalance` + `streakFreezes`。
  - `setEquipped(userId, slot, itemKey | null): Promise<void>` — 更新對應 `equipped*` 欄位。
- `service.ts`（`ShopService`，注入 repo）：
  - `getShopView(userId): Promise<ShopView>` — 組出畫面所需：`{ coinBalance, streakFreezes, items: (ShopItem & { owned; equipped; affordable })[] }`（後端算好每件狀態，前端純呈現）。
  - `purchase(userId, itemKey): Promise<PurchaseResult>` — §2 的權威流程；回傳 `{ ok: true; kind; coinBalance; alreadyOwned?: boolean } | { ok: false; reason: 'unauthorized'|'unknown_item'|'insufficient'|'freeze_full' }`。已擁有配件視為**成功冪等**：`ok: true, alreadyOwned: true`，不扣幣、`coinBalance` 不變（與 §2 一致）。
  - `equip(userId, slot, itemKey | null): Promise<EquipResult>` — §2 的驗證流程。
- shop **不訂閱事件、不改排程/遊戲化規則**；只透過 repository 讀寫 gamification 的錢包欄位與新 `UserItem`。學習/遊戲化核心不 import shop。

## 7. UI

- **`/shop`**（server component 抓 `getShopView` + 小型 client 元件互動）：
  - 頂部沿用 `GamificationBar` 顯示 🪙 餘額與 🔥/Lv。
  - 分區顯示：**凍結**（consumable）、**配件**（依 slot 分組）。每件顯示名稱/圖示/價格與狀態：已擁有（配件顯「裝備/卸下」切換）、可購買、餘額不足（禁用）、凍結已滿（禁用）。
  - 購買/裝備呼叫 server action → `router.refresh()` 即時更新。
  - 沿用既有 UI 元件（Card/Button/StatPill 風格）。
- **`components/ui/mascot.tsx` 擴充**：接受已裝備配件（optional props 或由呼叫端傳入 equipped），疊加對應 SVG 配件圖層；未裝備時外觀與現況完全一致（向後相容）。首頁與複習結束畫面的小橙狐即戴上已裝備配件。
  - 配件 SVG 以獨立小元件/資料表描述，依 slot 疊在既有狐狸圖層上（z 次序 neck→face→head 視覺合理）。
- **入口**：首頁加 `/shop` 連結（沿用既有次要連結樣式，與 `/leaderboard` 入口並列）。

## 8. 純函式與測試（TDD）

- **catalog 純函式**：`itemByKey`（命中/未命中）、`accessoriesBySlot`（依 slot 篩）、`isAccessory` type guard → 單元測試。
- **ShopService 契約**（注入 mock repo）：
  - 餘額足買配件 → 扣幣正確、寫入擁有、回 ok。
  - 餘額不足 → 拒、餘額不動。
  - 重複買同配件 → 冪等（不重扣）。
  - 買凍結未達上限 → 扣幣 + `streakFreezes+1`；已達 3 → 拒、不扣幣。
  - 買不存在的 key → 拒（`unknown_item`）。
  - 裝備：擁有且 slot 正確 → 寫入；未擁有 → 拒；slot 不符 → 拒；`null` → 卸下。
  - `getShopView` 各件 `owned/equipped/affordable` 標記正確。
- **repository**（mock db）：查詢/寫入的 where/select/update 欄位正確（含 `@@unique` 冪等、equipped 欄位對應）。
- **mascot**：未裝備時輸出不變（快照或結構斷言）；裝備後含對應配件圖層 → 純呈現測試（或至少純函式選圖層邏輯可測）。
- 既有測試全綠；`tsc` + `build` 通過；`/shop` 路由生成。

## 9. 模組與邊界

- 新 `lib/shop` 為服務層模組，對外只暴露 `ShopService` 介面；內部 catalog/repo 可自由改。
- shop 透過 repository 讀寫 gamification 錢包欄位（`coinBalance`/`streakFreezes`）與新 `UserItem`；**不直接 import gamification 內部規則**，不訂閱事件。
- 購買/裝備權威判定在組合根 server action（`app/shop/actions.ts`）呼叫 `ShopService`。
- DB 經 repository；Neon HTTP 單筆寫入、無交易（沿用既有取捨）。
- 硬幣餘額仍是單一權威真相；shop 是除 gamification 外**唯一**被授權改 `coinBalance` 的服務（花幣方向），符合第 8 條。

## 10. 明確排除（後續）

- 付費金流、真錢購買、交易帳本（`CoinTransaction` 稽核）。
- 主題色 / 深色模式（design token 層改造，另議）。
- 送禮 / 使用者間交易 / 市集。
- 配件稀有度、隨機轉蛋包、限時商店。
- 購買的**強一致性**：目前 read-modify-write 無交易，極端並發競態下可能 lost update（花超餘額/重複授予），只影響自己、機率低；日後以原子扣減或交易硬化。

## 11. 參數（可調）

- 初版件數：凍結 1 件 + 配件每槽 2–3 件（共約 6–8 件）。
- 價格帶：凍結 120、配件 150–300（依既有經濟校準，可調）。
- 裝備槽：head / face / neck 各一，可同時裝備（共 3）。
- 凍結上限沿用 `FREEZE_CAP = 3`。
