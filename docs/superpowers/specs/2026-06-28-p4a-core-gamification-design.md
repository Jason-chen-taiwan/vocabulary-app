# P4a 核心遊戲化設計文件

- **日期**：2026-06-28
- **狀態**：已核准，待撰寫實作計畫
- **範圍**：P4 遊戲化的第一塊（核心）。P4b 虛擬幣商店、P4c 排行榜/社交為後續獨立計畫。

---

## 1. 目的

把學習行為轉成有感的進度與習慣迴圈：每日目標 + 連續 streak、答題累積 XP/等級、達標與精熟賺虛擬幣、里程碑徽章。透過訂閱既有事件匯流排實作，學習核心不需改動其邏輯（只需把事件 payload 補齊）。

---

## 2. 資料模型

新增 Prisma models：

```prisma
model GamificationState {
  id            String   @id @default(cuid())
  userId        String   @unique
  xp            Int      @default(0)
  level         Int      @default(1)
  coinBalance   Int      @default(0)
  streak        Int      @default(0)
  longestStreak Int      @default(0)
  lastGoalDate  String?          // YYYY-MM-DD（使用者時區），上次達每日目標的日期
  reviewsToday  Int      @default(0)
  lastReviewDate String?         // YYYY-MM-DD，用來判斷是否跨日重置 reviewsToday
  streakFreezes Int      @default(0)
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  badges        UserBadge[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model UserBadge {
  id        String   @id @default(cuid())
  userId    String
  badgeKey  String           // 對應設定資料中的徽章 key
  unlockedAt DateTime @default(now())
  state     GamificationState @relation(fields: [userId], references: [userId], onDelete: Cascade)
  @@unique([userId, badgeKey])
}
```

於 `User` 加反向關聯 `gamification GamificationState?`。徽章定義（`badgeKey`、名稱、描述、條件）以**設定資料**（程式內常數陣列）描述，不建 Badge 表（YAGNI；徽章是靜態清單）。

> 日期以「YYYY-MM-DD 字串（使用者時區）」儲存，避免 UTC 跨日誤判。`User.timezone` 已存在（預設 Asia/Taipei）。

---

## 3. 獎勵規則（集中為具名常數）

- **XP**：答對 `+10`、答錯 `+2`（`XP_CORRECT`、`XP_WRONG`）
- **幣**：每日達標 `+50`（`COIN_DAILY_GOAL`）、每個單字記憶完成 `+20`（`COIN_MASTERY`）
- **等級**：每 `100` XP 升一級（`XP_PER_LEVEL`）；`levelForXp(xp) = floor(xp / 100) + 1`（純函式，曲線可日後改）
- **每日目標**：`20` 個複習（沿用 `User.dailyGoal`，預設 20）
- **凍結里程碑**：每達成 7 的倍數天 streak `+1` 凍結，上限 `3`（`FREEZE_PER_MILESTONE_DAYS=7`、`FREEZE_CAP=3`）

---

## 4. Streak 與每日目標邏輯

**每日目標**：當天完成 `dailyGoal` 個複習即達標。達標當天：streak 依下述更新、`+50` 幣、`lastGoalDate = 今天`。

**跨日重置**：每次 `ReviewCompleted`，先以使用者時區算「今天」；若 `lastReviewDate != 今天`，將 `reviewsToday` 重置為 0、`lastReviewDate = 今天`，並在此時做 streak 連續性評估（見下）。然後 `reviewsToday += 1`。當 `reviewsToday` 首次達到 `dailyGoal` 且今天尚未達標 → 觸發達標獎勵。

**Streak 連續性（懶評估，無 cron）— 純函式 `updateStreak(lastGoalDate, today, currentStreak, freezes)`：**
- `lastGoalDate == 昨天` → streak 連續，新 streak = currentStreak + 1，凍結不變
- `lastGoalDate < 昨天` → 中間漏掉 `gapDays = (今天 - lastGoalDate) - 1` 天；若 `freezes >= gapDays` → 消耗 `gapDays` 個凍結、streak = currentStreak + 1（保住）；否則 streak 歸 1（重新開始）、凍結歸 0
- `lastGoalDate == null`（首次達標）→ streak = 1
- 回傳 `{ streak, freezesConsumed, reset }`

達標後再評估凍結里程碑：若新 streak 是 7 的倍數且凍結未達上限 → `streakFreezes += 1`。

> 此邏輯為純函式，輸入日期字串與數字、輸出新值，完全可測，不依賴系統時間。

---

## 5. 徽章（設定資料驅動）

徽章清單為程式內常數（`badgeKey` + 名稱 + 描述 + 條件型別與門檻）：
- 連續天數：`streak-7`、`streak-30`、`streak-100`
- 精熟字數：`mastered-10`、`mastered-50`、`mastered-100`
- 等級：`level-5`、`level-10`、`level-25`
- 完美 session：`perfect-session`（一次 session 全對）

每次相關事件後，純函式 `evaluateBadges(context): string[]`（回傳本次新達成、尚未解鎖的 badgeKey）依目前狀態（streak / 精熟字數 / level / 本次 session 全對）判斷；新達成者寫入 `UserBadge`（依 `@@unique` 冪等）。

> 精熟字數需查詢（`UserCard where mastered=true count`）——由 gamification repository 提供 `countMastered(userId)`。完美 session 需要本次 session 的對錯統計（見 §7 事件）。

---

## 6. 顯示

- **頂部列元件**（app 各頁如首頁/單字書/複習）：🔥`streak` · `Lv.N` · 🪙`coinBalance`。server component 讀 `GamificationState`。
- **複習結束畫面**：顯示本次累計 `+XP`、`+幣`、是否升級（到 Lv.N）、新解鎖徽章。由 `submitAnswerAction` 回傳每次的 delta（xpGained/coinsGained/leveledUpTo?/newBadges?），客戶端累加，`finishSessionAction` 回傳 session 結算（含完美 session 徽章）。

---

## 7. 事件（前置改動）

擴充既有 `ReviewCompleted`，補上學習結果，供獎勵判斷：
```ts
{ type: 'ReviewCompleted'; userId; wordId; rating; correct: boolean; mastered: boolean; at: Date }
```
`SessionFinished` 補上本次對錯統計供完美 session 判斷：
```ts
{ type: 'SessionFinished'; userId; reviewed: number; correct: number; at: Date }
```
影響：`lib/events/bus.ts`（型別）、`lib/learning/submit.ts`（`submitAnswer` 已知 correct/mastered，發布時帶上；`finishSession` 增加 correct 計數參數）、其單元測試。學習核心仍只 publish，不知道遊戲化存在。

---

## 8. 架構與模組邊界

新模組 `lib/gamification`：

| 單元 | 職責 | 介面（概念） |
|---|---|---|
| `rules.ts`（純） | 獎勵/等級/streak/徽章規則 + 常數 | `levelForXp(xp)`、`xpForReview(correct)`、`updateStreak(...)`、`evaluateBadges(ctx)`、常數 |
| `badges.ts`（設定資料） | 徽章清單 | `BADGES: BadgeDef[]` |
| `repository.ts` | GamificationState CRUD、`countMastered` | `getState`/`saveState`/`unlockBadges`/`countMastered` |
| `service.ts` | 處理 ReviewCompleted/SessionFinished → 算新狀態、寫入、回傳 delta | `applyReview(...)`、`applySessionFinish(...)` |
| `register.ts` | 訂閱 eventBus，呼叫 service | （side-effect import） |

- **組合根**：`app/learn/[slug]/actions.ts` import `@/lib/gamification/register` 讓訂閱者在 server action 載入時生效；學習核心檔案不 import 遊戲化。
- 顯示 delta：`submitAnswerAction` 改為回傳 gamification delta（除既有 `ok`/`mastered`）。
- 所有 DB 經 repository；edge HTTP driver 單筆寫入（GamificationState 以 update-or-create，UserBadge 逐筆 create；不可 `$transaction`/`upsert`/`createMany`）。

---

## 9. 測試策略

- 純規則（`levelForXp`、`xpForReview`、`updateStreak` 各分支：連續/漏一天有凍結/漏多天凍結不足歸零/首次、`evaluateBadges` 各門檻）：單元測試。
- service（`applyReview`：跨日重置、達標獎勵、XP/幣累加、升級、精熟發幣、徽章解鎖；`applySessionFinish`：完美 session）：單元測試（注入 mock repository）。
- repository（getState/saveState 單筆寫入、countMastered、unlockBadges 冪等）：單元測試（mock）。
- 事件 payload 擴充後 submit 測試更新。
- 顯示：build + 手動驗證頂部列與結束畫面。
- 採 TDD。

---

## 10. 明確排除（後續計畫）

- 用幣購買凍結 / 主題 / 外觀 → P4b 虛擬幣商店。
- 排行榜 / 聯賽 / 社交 / 好友 → P4c。
- 統計儀表板（保留率、熱力圖、預估完成日）→ 獨立數據層計畫。
- 防作弊（前端送 correct 可偽造，僅影響自己進度；排行榜要防作弊時於 P4c 在 server 端重做答案比對）。

---

## 11. 數字參數（集中、可調）

`XP_CORRECT=10`、`XP_WRONG=2`、`COIN_DAILY_GOAL=50`、`COIN_MASTERY=20`、`XP_PER_LEVEL=100`、`DAILY_GOAL=20`（沿用 User.dailyGoal）、`FREEZE_PER_MILESTONE_DAYS=7`、`FREEZE_CAP=3`。徽章門檻見 §5。全部具名常數集中於 `rules.ts`/`badges.ts`。
