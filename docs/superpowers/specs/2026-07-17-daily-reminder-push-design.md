# 每日提醒推播（Web Push）設計

日期：2026-07-17
狀態：設計已核可，待寫實作計畫

## 目標

「關 app 也收到」的每日提醒推播，把裝過 PWA 的使用者拉回來背單字。以 Web Push（VAPID）＋ Cloudflare Cron Trigger 實作，守成本鐵則（cron 限流固定跑、push 免費、VAPID 自產），核心引擎零改動。

## 鐵則落點

- **成本鐵則**：無 runtime 付費 AI；推播走免費 Web Push；排程用 Cloudflare Cron（免費層 3 triggers 內）；無超量爆帳單。
- **資安鐵則**：`/api/push/*` 以 Auth.js `auth()` 綁 user，不信任前端宣稱身分；subscription 綁 server session。
- **模組化**：推播為獨立關注點——新增 `PushSubscription` table、`/api/push/*` 路由、`lib/push`、獨立 reminder Worker。scheduler／gamification 核心不動。

## §1 架構總覽

```
使用者裝置 (PWA standalone)
  ① 設定頁「開啟提醒」→ PushManager.subscribe(VAPID pubkey)
  ② POST subscription → 主 app /api/push/subscribe
        │
        ▼ 共享 Neon DB
        ▲
獨立 reminder Worker (新, 自己的 wrangler.toml, cron)
  每小時 (UTC) → selectDueUsers → 送 Web Push → SW 顯示通知 → 點擊開 /learn
```

三方靠**共享 Neon DB ＋ 共享 VAPID 金鑰**溝通，不直接互呼。主 app 核心零改動。獨立 Worker 與 OpenNext 主 app 解耦（OpenNext worker 只導 fetch、無 scheduled hook，故不包它、另起小 Worker）。

## §2 資料模型

**已有、直接用**（不新增）：
- `User.timezone`（`Asia/Taipei`）→ 換算 UTC 排程
- `User.dailyGoal` / `GamificationState.lastGoalDate` → 判「今天還沒達標」

**新增 1 張 table**：

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique          // push service URL，天然唯一，去重靠它
  p256dh    String                    // client public key
  auth      String                    // client auth secret
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**新增提醒偏好**（加在 `User`，屬設定非遊戲狀態）：

```prisma
model User {
  ...
  reminderEnabled Boolean @default(false)   // 是否開提醒
  reminderHour    Int     @default(20)      // 當地幾點提醒 (0-23)，預設 20:00
}
```

規則：
- 一使用者多裝置 → 多筆 subscription；`endpoint @unique` upsert 去重。
- 送失敗（410 Gone / 404）→ 刪該 subscription。
- 提醒條件三合一：`reminderEnabled` && 當地 `reminderHour`==現在 && 今天 `lastGoalDate` != 今天。
- 冪等：reminder Worker 記 `userId-YYYY-MM-DD` 到 KV（24h TTL），同人同日不重送。

## §3 reminder Worker + cron 邏輯

**檔案落點**（新目錄，與主 app 分開）：

```
workers/reminder/
  wrangler.toml         name=vocab-reminder；crons=["0 * * * *"] 每小時整點 UTC
  src/index.ts          scheduled() handler
  src/reminders.ts      純函式 selectDueUsers()（可測）
  src/push.ts           sendPush(sub, payload, vapid)
  src/__tests__/reminders.test.ts
```

**cron 排程換算**（每小時跑）：
- 全 UTC。`utcHourFor(user) = (reminderHour - tzOffset + 24) % 24`。
- 每小時醒：`selectDueUsers(nowUtcHour)` = 篩 `reminderEnabled && utcHourFor==nowUtcHour && lastGoalDate!=today(user tz)`，join 只撈有 subscription 者。
- DST：台灣無 DST，預設安全；他時區列已知限制。

**scheduled() 流程**（10ms CPU 限制 → 全塞 `waitUntil`）：
```ts
async scheduled(ctrl, env, ctx) {
  ctx.waitUntil(runReminders(env, hourFromCtrl(ctrl)).catch(logErr))
}
```

**runReminders**：
1. `selectDueUsers(hour)` — 一次 query，join subscription。
2. 每 user：KV 查冪等鎖，已送跳過。
3. 送 push 給該 user 全部 subscription；410/404 → 刪該 sub。
4. 成功 → KV 記鎖（TTL 24h）。

**Web Push 送信**：
- VAPID 金鑰對：一次性 `web-push generate-vapid-keys`。pubkey → 主 app env（前端訂閱用）；privkey → reminder Worker secret。
- payload：`{ title:"該背單字了 🦊", body:"今天還沒達標，來 5 分鐘", url:"/learn" }`。
- web-push 套件需 `nodejs_compat`；若依賴 node crypto 不相容 Workers，fallback 用 Workers 原生 `crypto.subtle` 做 VAPID JWT（實作時首個驗證點，先試 web-push）。

**主 app 端新增**（核心零改）：
```
app/api/push/subscribe/route.ts     POST auth() → upsert PushSubscription
app/api/push/unsubscribe/route.ts   POST auth() → 刪
app/settings/                       + 提醒開關 + 時間選 + 訂閱按鈕 (client)
public/sw.js                        + push / notificationclick handler
lib/push/                           subscription repo + 純函式 utcHourFor / selectDue
```

## 測試（TDD）

| 測什麼 | 檔 |
|---|---|
| `utcHourFor` 各時區換算正確 | `lib/push` + reminder 測試 |
| `selectDueUsers` 只回 該時、未達標、有訂閱者 | `reminders.test.ts` |
| 冪等：同人同日第二次跳過 | 同上 |
| subscribe route 未登入拒、endpoint upsert 去重 | route 測試 |
| 410/404 → 刪 subscription | push 測試 |

## 明確跳過（YAGNI）

- 通知內容個人化／多語（先固定文案）。
- 提醒頻率自訂（先每日一次）。
- streak 快斷的緊急提醒（先只每日達標提醒）。
- email fallback（先只 push）。

## 已知限制（誠實記錄）

- iOS 需先裝 PWA 到主畫面才收 push（已有 install 引導接得上）；桌面／Android 直接可。
- 非台灣時區 DST 需手動處理或列後續。
- web-push 套件 Workers 相容性 = 實作時首個驗證點；不相容則改原生 `crypto.subtle`。
- cron at-least-once + 15 分傳播延遲：提醒可能晚到 ±1 分或偶爾重試（冪等鎖擋重送）。
