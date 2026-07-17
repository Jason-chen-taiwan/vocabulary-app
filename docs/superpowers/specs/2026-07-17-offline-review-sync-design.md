# 離線複習＋同步佇列設計

日期：2026-07-17
狀態：設計已核可，待寫實作計畫

## 目標

離線也能完整複習：在線時自動預抓今日複習包存 IndexedDB，離線作答本地即時回饋，回線後批次同步、由後端權威重判與入帳。補齊 CLAUDE.md 原定範圍的最後一塊（離線 PWA：IndexedDB 離線複習＋同步佇列）。

## 範圍決定

- **只離線複習**：其他頁面（單字書瀏覽、統計、商店、排行榜）維持需連線。
- **獎勵回線入帳**：離線顯示對錯與進度，XP／硬幣／streak 等同步後由 server 計算入帳；離線結束畫面顯示「已記錄 N 題，回線後入帳」。
- **全自動預抓**：使用者零操作，在線進 app 時背景抓包。
- **同步機制＝原始作答重放（方案 A）**：佇列存原始作答，server 重判＋按時序重放 FSRS。方案 B（前端跑 FSRS）違後端權威與模組邊界鐵則；方案 C（Background Sync API）iOS Safari 不支援，不能當基礎。

## 鐵則落點

- **資安鐵則**：離線本地判分**僅供 UI 即時回饋**，不碰權威狀態；同步時 server 對每筆原始作答重新判定對錯（沿用線上路徑同一套判定），FSRS 與遊戲化全在 server 重放。不信任前端送的 correct、XP、時間順序。
- **模組化**：新增集中在 `lib/sync`（模組邊界表本就預留）＋ `/api/sync`、`/api/offline/pack` 兩條路由；`ts-fsrs` 仍藏在 scheduler 後，前端不碰。
- **虛擬經濟收斂**：離線期間前端不算不存任何幣／XP；一律同步後由 gamification 服務層入帳。

## §1 資料流

**預抓（在線）**
- 新增 `GET /api/offline/pack`：auth 後，對「有學習進度的書」（存在該 user 的 UserCard 的 WordBook）各組一份今日 session 包——複用既有 `buildSession`，包含出題所需完整字卡資料（headword／phonetic／partOfSpeech／definitionZh／examples／干擾選項）。
- 首頁掛隱形 client 元件 `<OfflinePrefetch/>`：idle 時每日打一次，結果整包存 IndexedDB `packs`。

**離線複習**
- `/learn/[slug]` 偵測離線（`navigator.onLine` ＋ fetch 失敗 fallback）→ 從 IndexedDB 讀該書今日包 → 出題／判分用既有 `lib/learning/question.ts` 純函式（前端可跑，僅供 UI）→ 每題 append 佇列 `{uuid, wordId, questionType, userAnswer, answeredAt}`。
- 離線結束畫面：顯示本地統計＋「已記錄 N 題，回線後入帳」（不顯示 XP／幣）。

**同步（回線）**
- 觸發：`online` 事件、app 啟動時檢查佇列非空。
- `POST /api/sync` body `{ entries: [{uuid, wordId, questionType, userAnswer, answeredAt}], session?: {reviewed, correct, finishedAt} }`。
- server：auth → zod 驗證 → 逐筆以 uuid 去重（已入帳者跳過）→ `judgeAnswer` 重判 → 按 `answeredAt` 升冪重放 `submitAnswer`（FSRS）＋ `gamificationService.applyReview` → 若帶 session 摘要則 `applySessionFinish`（reviewed/correct 以 server 重判結果重算，不信前端數字）→ 回 `{ applied, skipped, reward 彙總 }`。
- 前端：成功→清佇列＋toast「離線複習 N 題已入帳 +XX XP」；失敗→保留佇列下次再試；部分成功→依 server 回傳的 per-entry 結果只清已入帳者。

## §2 資料模型

Prisma（小 migration）：

```prisma
model ReviewLog {
  ...
  clientRef String? @unique   // 離線作答 uuid；冪等去重，重送安全
}
```

IndexedDB（前端，db `vocab-offline`）：
- `packs`：key = bookSlug，value = `{ ymd, cards[], savedAt }`（隔日視為過期，重抓）。
- `queue`：key = uuid，value = 作答 entry。
- `meta`：雜項（lastPrefetchYmd 等）。

**answeredAt clamp**（server）：`min(answeredAt, serverNow)` 且不早於 serverNow − 7 天；超窗者以邊界值計。降低撥時鐘作弊空間，非徹底防偽（見已知限制）。

## §3 模組拆解

```
lib/sync/                     新模組（介面對外，內部自由）
  idb.ts                      IndexedDB 薄封裝（open/get/put/delete/list），可注入 fake 測試
  pack-store.ts               savePacks / loadPack(bookSlug)（含當日有效性判斷）
  queue.ts                    enqueue / listAll / remove(uuids)（uuid 由此產生）
  client.ts                   syncNow()：讀佇列→POST /api/sync→按結果清除；registerOnlineSync()
  __tests__/

lib/learning/
  judge.ts                    judgeAnswer(word, questionType, userAnswer) 純函式
                              （自 submitAnswerAction 抽出，線上 action 與 /api/sync 共用）

app/api/sync/route.ts         POST：auth → zod → 去重 → 重判 → 時序重放 → 獎勵彙總
app/api/offline/pack/route.ts GET：auth → 有進度書的今日 session 包

app/learn/[slug]/             review-session 的「送出作答」抽成注入 prop：
                              在線＝現行 server action；離線＝judgeAnswer 本地回饋＋enqueue
components/offline-prefetch.tsx   idle 預抓（薄 client 元件）
components/sync-on-reconnect.tsx  同步觸發＋toast（薄 client 元件）

public/sw.js                  加 app-shell 快取（navigation fallback）——離線能開頁面的前置條件
```

## §4 測試（TDD）

| 測什麼 | 檔 |
|---|---|
| queue／pack 儲存與過期（fake idb） | `lib/sync/__tests__/` |
| `judgeAnswer` 三題型判定與線上 action 一致 | `lib/learning/__tests__/judge.test.ts` |
| `/api/sync` 未登入拒；同 uuid 重送不重複入帳；亂序 entries 按時序重放；壞 payload 擋；answeredAt clamp；session 摘要以 server 重判重算 | route 測試 |
| sync client：成功清佇列／失敗保留／部分成功只清已入帳 | `lib/sync/__tests__/client.test.ts` |
| 兩裝置交錯時間 replay 後 FSRS 狀態 deterministic 收斂 | 整合測試（CLAUDE.md 點名必測） |

## 明確跳過（YAGNI）

- Background Sync API（iOS 不支援；未來漸進增強）。
- 單字書／統計等頁離線瀏覽。
- 離線獎勵樂觀估算與校正。
- 衝突 UI（server 為準靜默合併即可）。

## 已知限制（誠實記錄）

- 客端時鐘可撥弄 `answeredAt`，影響 streak／每日達標判定；clamp 視窗只能降風險不能杜絕，徹底防偽（server 時間戳全權威）會犧牲離線正確性，遞延。
- 離線包含正解資料（mc 正解、typing 目標字）——與現況線上題庫對前端可見同級，非新增風險。
- 同步只在 app 打開且回線時發生（無背景同步）。
- 多裝置對同字重複複習會各記一筆 log；FSRS 按時序重放收斂，無資料損壞。
