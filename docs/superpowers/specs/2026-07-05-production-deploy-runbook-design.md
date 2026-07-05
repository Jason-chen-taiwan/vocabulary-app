# 首次上線 + iPhone 真機驗收 Runbook

**日期**：2026-07-05
**類型**：部署 runbook（非功能開發）
**目標**：把目前在 `master`、本輪全部完成的字彙 PWA **首次部署到 Cloudflare**，並在 **iPhone/iPad** 上做真機驗收，關掉 P5-b 遺留的驗收債。

---

## 背景與現況盤點

本輪功能（P1–P3、active-recall、P4a/b/c 遊戲化、P5-a `/stats`、P5-b PWA 安裝引導）全部完成並在 `master`。從未部署過。

| 項目 | 狀態 |
|---|---|
| 部署工具鏈 | ✅ 已備妥：`npm run cf:deploy` = `scripts/cf-build.mjs`（OpenNext build）+ `wrangler deploy`；`wrangler.toml` 已設 `name = "vocab-app"`、`nodejs_compat`、ASSETS binding |
| Neon DB | ✅ 已串好、已 seed 內容（`.env` 的 `DATABASE_URL`，本次**重用為 prod**，符合成本鐵則的免費/固定低月費原則）|
| Auth.js 4 個 secret | ✅ 本機 `.env` 齊全（`DATABASE_URL` / `AUTH_SECRET` / `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`）；⚠️ **尚未**設到 Worker |
| Cloudflare 登入 | ❌ 這台機器 `wrangler` 未驗證 |
| 曾部署過 | ❌ 從未（首次上線）|

`lib/env.ts` 要求上述 4 個 key 存在（缺任一即 throw）；`getEnv()` 從 `process.env` 讀取，OpenNext-Cloudflare 會把 Worker secrets 映射進 `process.env`，故 `wrangler secret` 設好即生效。

---

## 一個必須先修的程式問題（唯一程式碼變更）

`auth.ts` 目前**沒有** `trustHost: true`。Auth.js v5 在非 Vercel 主機上，若不設 `trustHost`（或 `AUTH_TRUST_HOST=true`），會拒絕從請求標頭推斷自身 / callback URL，**production 的 Google 登入會直接失敗**。

**決策**：在 `auth.ts` 的 NextAuth 設定加入 `trustHost: true`（一行）。選程式碼設定而非額外環境變數，理由：少一個要記得設的 Worker 變數、意圖顯性寫在程式裡。此為本 runbook 唯一程式碼變更。

---

## 分工原則

- 🧑 **你做**：任何互動式 / 需要你帳號或裝置的步驟——Cloudflare 登入、Google Cloud Console、拿 iPhone 驗收。
- 🤖 **我做**：本機程式碼、建置、部署、密鑰匯入（自動化，但值不進對話紀錄）。

---

## 排序關鍵（chicken-and-egg）

1. **Worker secrets 需要 Worker 先存在** → 所以先 `cf:deploy` 建出 Worker，再匯入 secrets（secrets 對 live Worker 立即生效，不需再部署）。
2. **Google OAuth redirect URI 需要真網址** → workers.dev 子網域在首次部署後才確定，故 OAuth 收尾排在部署之後。
3. 首次部署會短暫在無 env 下執行（登入/DB 會報錯）——**預期現象**，下一步匯入 secrets 即修復。

---

## Runbook

| # | 步驟 | 誰 | 指令 / 動作 | 完成判準 |
|---|---|---|---|---|
| 0 | 起飛前 | 🤖 | 加 `trustHost: true`、`npm test`、`npm run cf:build`、清掉亂碼 junk file 並 gitignore | 測試綠燈、`cf:build` 成功產出 `.open-next/` |
| 1 | Cloudflare 登入 | 🧑 | 輸入框打 `! npx wrangler login`，瀏覽器授權，註冊 workers.dev 子網域 | `npx wrangler whoami` 顯示帳號 |
| 2 | 首次部署 | 🤖 | `npm run cf:deploy` | 拿到 `https://vocab-app.<子網域>.workers.dev` |
| 3 | 匯入 secrets | 🤖 | 由 `.env` 產生 wrangler 要的 JSON（值不印出）→ `wrangler secret bulk` → 刪除暫存 JSON | `wrangler secret list` 顯示 4 個 key |
| 4 | Google OAuth 收尾 | 🧑 | Google Cloud Console → OAuth client → Authorized redirect URIs 加 `https://<網址>/api/auth/callback/google` | 存檔成功 |
| 5 | iPhone 真機驗收 | 🧑+🤖 | 見下方驗收清單 | 清單逐項通過 |

### Secrets 匯入方式（步驟 3 細節）

使用者已選「自動化」：以腳本讀 `.env`、轉成 `wrangler secret bulk` 需要的 `{ "KEY": "value" }` JSON、寫到暫存檔、`wrangler secret bulk <file>`、隨即刪除暫存檔。**密鑰值全程只在檔案↔wrangler 之間流動，不輸出到對話紀錄。** 使用者已知悉此法安全性低於手動 `secret put`，並明確選擇之。

---

## iPhone 真機驗收清單

| 項 | 預期 |
|---|---|
| Safari 開網址、載入首頁 | 正常渲染、無 500 |
| Google 登入 | 成功導回、建立 session（驗證 `trustHost` 修復生效）|
| 做一輪複習 | 出題、作答、server 判定、FSRS 排程更新 |
| 遊戲化 | 賺幣、成就等事件正常（`coinBalance` 由後端權威更新）|
| 離線複習 | 斷網後 IndexedDB 佇列可用、恢復連線後同步 |
| iOS「加到主畫面」提示 | 出現 iOS 手動安裝提示（`components` 內的 iOS hint 路徑）|
| **install 鈕** | **不出現——正確行為**。iOS Safari 不支援 `beforeinstallprompt`，非 bug |

### 已知限制（誠實記錄）

- **install 鈕的實際觸發無法在 iPhone 驗證**。真正驗證 `beforeinstallprompt` 需 Android Chrome，或桌面 Chrome 全新設定檔 + prod build。此限制與既有 memory 記載一致，本輪不解決。
- prod 重用 dev Neon DB：資料未隔離。對個人專案可接受；若日後要多人正式使用，再拆獨立 prod 庫。

---

## 範圍

**做**：`trustHost` 修復、首次 Cloudflare 部署、secrets 匯入、OAuth redirect 設定、iPhone 驗收、junk file 清理。

**不做**：獨立 prod DB、自訂網域、CI/CD 自動部署、Android/桌面 install 鈕驗證、任何新功能。這些若需要，各自另開 spec。
