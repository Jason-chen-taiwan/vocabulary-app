# 首次上線 + iPhone 真機驗收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `master` 上本輪完成的字彙 PWA 首次部署到 Cloudflare Workers，並在 iPhone/iPad 上完成真機驗收。

**Architecture:** 既有 OpenNext + wrangler 工具鏈已備妥；重用現有 Neon DB 為 prod。唯一程式碼變更是替 Auth.js v5 加 `trustHost: true`（非 Vercel 主機必需）。其餘為部署／設定／驗收的 ops 步驟，明確標注 🧑（使用者互動）與 🤖（我執行）。

**Tech Stack:** Next.js 16（App Router）、Auth.js v5（Google OAuth）、Neon Postgres + Prisma、@opennextjs/cloudflare、wrangler、PWA（manifest + SW + IndexedDB）。

## Global Constraints

- 成本鐵則：只用免費/固定低月費、無超量爆帳單的服務；不在 runtime 呼叫 AI。
- 資安鐵則：密鑰不外洩、不在 URL 帶敏感資料；密鑰值不得輸出到對話紀錄。
- 分工：互動式 / 需帳號或裝置的步驟一律 🧑 使用者做；程式碼、建置、部署、密鑰匯入 🤖 我做。
- 排序硬性依賴：**deploy（建 Worker）→ 匯入 secrets → OAuth redirect**，不可調換（見 spec「排序關鍵」）。
- 唯一程式碼變更是 `auth.ts` 加 `trustHost: true`；不做無關重構（CLAUDE.md 開發紀律）。
- Worker 名稱固定 `vocab-app`（`wrangler.toml`），callback 路徑固定 `/api/auth/callback/google`。
- 平台：本機為 Windows，家目錄含非 ASCII 字元；建置一律走 `npm run cf:build`（`scripts/cf-build.mjs` 已處理 ASCII temp dir workaround），不可直接呼叫 opennext CLI。

---

### Task 0: 起飛前 —— trustHost 修復 + junk file 清理 + 綠燈建置

**Files:**
- Modify: `auth.ts`（NextAuth 設定加 `trustHost: true`）
- Delete: repo 根目錄亂碼 junk file（檔名以 `task-1-report.md` 結尾、開頭為 `C：vocabulary_app...` 全形冒號，git status 顯示為 untracked）
- Modify: `.gitignore`（加一條防止該類亂碼檔再被追蹤）

**Interfaces:**
- Consumes: 無（起始任務）
- Produces: 一個 `trustHost: true` 已生效、測試綠燈、`.open-next/` 已產出的 build，供 Task 2 部署。

- [ ] **Step 1（🤖）：改 `auth.ts` 加 `trustHost: true`**

在 `auth.ts` 回傳的設定物件加入 `trustHost: true`。改後應如下：

```ts
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv()
  return {
    adapter: PrismaAdapter(getPrisma()),
    session: { strategy: 'database' },
    trustHost: true,
    providers: [
      Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
    ],
    secret: env.AUTH_SECRET,
    pages: { signIn: '/login' },
    callbacks: {
      session({ session, user }) {
        if (session.user) session.user.id = user.id
        return session
      },
    },
  }
})
```

> 註：此為部署設定，非 CLAUDE.md 列管的 TDD 對象（FSRS/遊戲化/事件/離線同步）。對 `NextAuth(() => …)` 工廠內部設定寫單元測試會觸及框架內部、脆弱且低價值。其正確驗證是 Task 5 的 prod 實機登入成功，加上本任務的 typecheck。

- [ ] **Step 2（🤖）：typecheck / lint 確認改動合法**

Run: `npx tsc --noEmit`
Expected: 無錯誤（0 errors）。

- [ ] **Step 3（🤖）：刪除亂碼 junk file**

Run（Bash 工具，repo 根目錄）：
```bash
find . -maxdepth 1 -name '*task-1-report.md' -print -delete
```
Expected: 印出該檔路徑後刪除；`git status --short` 不再顯示該 `??` 項目。

- [ ] **Step 4（🤖）：`.gitignore` 加防護條目**

在 `.gitignore` 末端（`.superpowers/` 那段之後）加入：
```gitignore
# stray path-escaping artifact (windows fullwidth-colon filename bug)
*task-*-report.md
```

- [ ] **Step 5（🤖）：跑完整測試**

Run: `npm test`
Expected: 全數 PASS（既有測試不受影響）。

- [ ] **Step 6（🤖）：Cloudflare 建置確認綠燈**

Run: `npm run cf:build`
Expected: 成功結束（exit 0），產出 `.open-next/worker.js` 與 `.open-next/assets/`。

- [ ] **Step 7（🤖）：Commit**

```bash
git add auth.ts .gitignore
git commit -m "fix(auth): trustHost:true for non-Vercel prod + gitignore stray report file"
```
> 註：junk file 為 untracked，`git rm` 不適用；Step 3 已直接刪除，無需 `git add` 該檔。

---

### Task 1: Cloudflare 登入（🧑 使用者互動）

**Files:** 無（本機 wrangler 憑證狀態）

**Interfaces:**
- Consumes: Task 0 的綠燈 build。
- Produces: 已驗證的 wrangler 會話 + 已註冊的 workers.dev 子網域，供 Task 2 部署。

- [ ] **Step 1（🧑）：登入 Cloudflare**

請使用者在 Claude Code 輸入框輸入：
```
! npx wrangler login
```
瀏覽器會開啟授權頁；同意後若提示註冊 workers.dev 子網域，請完成註冊。

- [ ] **Step 2（🤖）：確認登入成功**

Run: `npx wrangler whoami`
Expected: 顯示帳號 email 與 account id（不再是 "You are not authenticated"）。若仍未登入，回到 Step 1。

---

### Task 2: 首次部署 —— 建 Worker 並取得網址（🤖）

**Files:** 無（使用既有 `wrangler.toml`、`open-next.config.ts`、`scripts/cf-build.mjs`）

**Interfaces:**
- Consumes: Task 1 的 wrangler 會話。
- Produces: 線上 Worker `vocab-app` + 公開網址 `https://vocab-app.<子網域>.workers.dev`（記為 `$PROD_URL`），供 Task 3、4、5 使用。

- [ ] **Step 1（🤖）：部署**

Run: `npm run cf:deploy`
Expected: 建置成功後 wrangler 上傳並印出已部署網址。

- [ ] **Step 2（🤖）：擷取並記錄 `$PROD_URL`**

從 Step 1 輸出取得 `https://vocab-app.<子網域>.workers.dev`。在回覆中明確告知使用者此網址（後續 Task 4 OAuth、Task 5 驗收都要用）。

- [ ] **Step 3（🤖）：冒煙檢查（預期尚未可用）**

Run: `curl -sS -o /dev/null -w "%{http_code}\n" $PROD_URL`
Expected: 有回應（HTTP 狀態碼回傳即可）。**此時登入/DB 相關頁面可能報錯是預期現象**——secrets 尚未匯入，Task 3 修復。不需在此除錯 env 相關 500。

---

### Task 3: 匯入 Worker Secrets（🤖 自動化，值不進對話紀錄）

**Files:**
- 讀取：`.env`（DATABASE_URL / AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET）
- 暫存：scratchpad 內 `cf-secrets.json`（用後即刪，不進 repo、不進 transcript）

**Interfaces:**
- Consumes: Task 2 已存在的 Worker `vocab-app`。
- Produces: Worker 上 4 個加密 secret，使 `getEnv()` 在 prod 可讀齊 `lib/env.ts` 要求的 key。

- [ ] **Step 1（🤖）：由 `.env` 產生 wrangler bulk JSON（值不輸出）**

用一段 Node 腳本讀 `.env`、只挑這 4 個 key、寫成 `wrangler secret bulk` 需要的 `{ "KEY": "value" }` JSON 到 scratchpad，**不 print 任何值**。存到：
`C:\Users\帥哥\AppData\Local\Temp\claude\C--vocabulary-app\<session>\scratchpad\cf-secrets.json`

Run（Bash，於 repo 根目錄；`$SCRATCH` 換成本 session scratchpad 路徑）：
```bash
node -e '
const fs=require("fs");
const keys=["DATABASE_URL","AUTH_SECRET","AUTH_GOOGLE_ID","AUTH_GOOGLE_SECRET"];
const env={};
for(const line of fs.readFileSync(".env","utf8").split(/\r?\n/)){
  const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) env[m[1]]=m[2];
}
const out={}; for(const k of keys){ if(!env[k]){console.error("MISSING "+k);process.exit(1);} out[k]=env[k]; }
fs.writeFileSync(process.env.SCRATCH_JSON, JSON.stringify(out));
console.log("wrote "+keys.length+" keys ("+Object.keys(out).join(",")+") — values not printed");
' 
```
（執行前以 `SCRATCH_JSON=<scratchpad>/cf-secrets.json` 環境變數指定輸出路徑。）
Expected: 印出 `wrote 4 keys (DATABASE_URL,AUTH_SECRET,AUTH_GOOGLE_ID,AUTH_GOOGLE_SECRET) — values not printed`。**不得**印出任何 value。

- [ ] **Step 2（🤖）：bulk 匯入到 Worker**

Run: `npx wrangler secret bulk "$SCRATCH_JSON"`
Expected: wrangler 回報 4 個 secret 建立/更新成功（`vocab-app`）。

- [ ] **Step 3（🤖）：立即刪除暫存 JSON**

Run: `rm -f "$SCRATCH_JSON"`
Expected: 檔案已刪。（scratchpad 本就隔離，但仍即時清除以免殘留密鑰。）

- [ ] **Step 4（🤖）：確認 secrets 已上架**

Run: `npx wrangler secret list`
Expected: 列出 4 個 key（僅名稱、無值）：DATABASE_URL、AUTH_SECRET、AUTH_GOOGLE_ID、AUTH_GOOGLE_SECRET。

- [ ] **Step 5（🤖）：確認 secrets 對 live Worker 生效**

Run: `curl -sS -o /dev/null -w "%{http_code}\n" $PROD_URL`
Expected: 首頁回 2xx/3xx（不再因缺 env 而 500）。若仍 500，檢查 secret 名稱拼字與 `lib/env.ts` REQUIRED 是否一致。

> 註：secret 對 live Worker 立即生效，通常不需重新部署；若 wrangler 提示需重新部署才套用，執行一次 `npm run cf:deploy`。

---

### Task 4: Google OAuth Redirect URI 收尾（🧑 使用者，Google Cloud Console）

**Files:** 無（Google Cloud Console 設定）

**Interfaces:**
- Consumes: Task 2 的 `$PROD_URL`。
- Produces: Google OAuth client 接受 prod callback，使 Task 5 登入可成功。

- [ ] **Step 1（🤖）：把要填的值準備好交給使用者**

在回覆中明確給出兩個要填的值（用實際 `$PROD_URL` 代入）：
- Authorized redirect URI：`$PROD_URL/api/auth/callback/google`
- （如該 OAuth client 有設 Authorized JavaScript origins）Origin：`$PROD_URL`

- [ ] **Step 2（🧑）：在 Google Cloud Console 設定**

使用者到 Google Cloud Console → APIs & Services → Credentials → 對應的 OAuth 2.0 Client → 加入 Step 1 的 redirect URI（及 origin，如適用）→ 儲存。

- [ ] **Step 3（🧑→🤖）：確認可載入登入頁**

使用者回報已儲存後，Run: `curl -sS -o /dev/null -w "%{http_code}\n" $PROD_URL/login`
Expected: 2xx。（實際 Google 登入導轉在 Task 5 用真機驗證。）

---

### Task 5: iPhone 真機驗收（🧑 使用者操作 + 🤖 對照清單）

**Files:** 無（人工驗收）

**Interfaces:**
- Consumes: Task 2 `$PROD_URL`、Task 3 secrets、Task 4 OAuth 設定。
- Produces: 驗收結果紀錄（通過項目 + 已知限制），供更新 memory。

- [ ] **Step 1（🤖）：把驗收清單交給使用者**

在回覆中列出下表，請使用者在 iPhone/iPad Safari 逐項操作並回報。

| 項 | 操作 | 預期 |
|---|---|---|
| 首頁載入 | Safari 開 `$PROD_URL` | 正常渲染、無 500 |
| Google 登入 | 點登入、選 Google 帳號 | 成功導回、建立 session（驗證 trustHost 生效）|
| 一輪複習 | 進複習、作答數題 | 出題/作答/server 判定/FSRS 排程更新正常 |
| 遊戲化 | 完成該輪 | 賺幣、成就等事件正常（`coinBalance` 後端權威）|
| 離線複習 | 開飛航模式再複習、恢復連線 | IndexedDB 佇列可用、恢復後同步 |
| iOS 安裝提示 | 觀察首頁 banner | 出現 iOS「加到主畫面」手動提示（`components/pwa-install-banner.tsx` 的 iOS 路徑）|
| install 鈕 | 觀察 | **不出現＝正確**。iOS Safari 不支援 `beforeinstallprompt`，非 bug |

- [ ] **Step 2（🧑）：逐項操作並回報結果**

使用者回報每項通過與否；任何未通過項，🤖 依回報症狀進 systematic-debugging（本任務不預先展開）。

- [ ] **Step 3（🤖）：記錄驗收結果與已知限制**

彙整通過項目；明載已知限制：**install 鈕的實際觸發無法在 iPhone 驗證**（需 Android Chrome 或桌面 Chrome 全新設定檔 + prod build），與既有 memory 一致。

- [ ] **Step 4（🤖）：更新 memory**

更新 `vocab-app-progress.md`：本輪已首次上線至 Cloudflare（記錄 `$PROD_URL`）、iPhone 真機驗收通過項目、install 鈕 iPhone 不可驗證之限制、prod 重用 dev Neon DB 之現況。

---

## Self-Review

**1. Spec coverage：**
- trustHost 修復 → Task 0 ✅
- junk file 清理 → Task 0 ✅
- 首次部署 → Task 2 ✅
- secrets 自動化匯入（值不進 transcript）→ Task 3 ✅
- OAuth redirect → Task 4 ✅
- iPhone 驗收清單（含 install 鈕不出現＝正確）→ Task 5 ✅
- 已知限制記錄（install 鈕不可驗證、DB 重用）→ Task 5 Step 3–4 ✅
- 排序關鍵（deploy→secrets→oauth）→ 反映在 Task 2→3→4 順序 + Global Constraints ✅
- 分工 🧑/🤖 → 每任務標注 ✅

無未覆蓋的 spec 需求。

**2. Placeholder scan：** 無 TBD/TODO/「稍後實作」；程式碼步驟均附完整內容；命令均附預期輸出。`$PROD_URL`/`$SCRATCH_JSON` 為明確定義的執行期值（Task 2 Step 2 / Task 3 Step 1 產生），非佔位符。

**3. Type consistency：** secret key 名稱在 Task 3 各步驟與 `lib/env.ts` REQUIRED 一致（DATABASE_URL / AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET）；Worker 名稱 `vocab-app` 與 `wrangler.toml` 一致；callback 路徑 `/api/auth/callback/google` 在 Task 4 一致。
