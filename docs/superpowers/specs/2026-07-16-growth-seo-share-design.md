# 成長與推廣：公開門面、SEO、成就分享卡 — 設計

日期：2026-07-16
狀態：已與使用者確認設計，待實作

## 目標

讓更多人找到並開始使用 VocabApp（0stack.org）：

1. 陌生訪客打開 `0stack.org` 能看懂這是什麼、被吸引登入（目前未登入直接 redirect `/login`，什麼都看不到）。
2. 搜尋「某單字 中文意思」的 TOEIC 考生能從 Google 掉進單字頁（目前單字頁登入才能看，Google 無法索引）。
3. 既有使用者能一鍵把學習成果分享到 LINE/IG/FB，幫忙擴散。

成本鐵則不變：零新增伺服器成本、不呼叫付費服務、不在 runtime 呼叫 AI。

## 範圍

本輪做：

- 公開 landing page（`/` 未登入版）
- 公開單字頁 `/word/[headword]` + SEO 基礎建設（robots/sitemap/OG）
- 成就分享卡（純前端 Canvas + Web Share API）

本輪**不做**：邀請獎勵/推薦碼（碰硬幣經濟，需後端防刷，留待之後）、伺服器動態 OG 圖（satori/workers-og，視分享卡使用狀況再升級）、部落格內容、付費廣告。

## 設計

### 1. Landing page（`/`）

`app/page.tsx`：未登入時**不再 redirect `/login`**，改渲染 `<LandingPage />`（新元件群 `components/landing/`）；已登入維持現有 home 完全不動。

Landing 內容：

- Hero：狐狸吉祥物 + 一句話價值主張 + 「用 Google 登入，免費開始」CTA（導 `/login`）
- 特色三格：FSRS 科學複習排程、遊戲化（連續天數/徽章/商店）、離線 PWA 可安裝
- 單字書預覽：12 本 TOEIC 主題書（`ContentRepository.listWordBooks()`，匿名可讀）
- 頁尾：連到數個熱門單字頁（內部連結利於 SEO）

`/login` 頁保留不動線（既有導向都不用改），內容加一行「回首頁看介紹」連結。

### 2. 公開單字頁（`/word/[headword]`）

- 新公開路由，**單數 `word`** 與登入版 `/words/[id]` 區隔；登入版不動。
- headword 統一小寫正規化後查詢；同一 headword 出現在多本書時合併顯示（音標/詞性/中譯取首筆，例句聯集，標示所屬單字書標籤）。此頁為該字的 canonical。
- 內容：headword、音標、詞性、中譯、例句＋中譯、TTS 按鈕（重用既有 `TtsButton`）、所屬單字書 pill、頁尾 CTA「登入把這個字加入複習」。
- 查無此字 → `notFound()`。
- `ContentRepository` 新增：
  - `getWordByHeadword(headword: string)` — 跨書合併結果
  - `listAllHeadwords()` — 給 sitemap 用
- 資安：題庫內容本來就對前端可見（CLAUDE.md 已知限制），公開此頁無新增風險；不暴露任何使用者資料。

### 3. SEO 基礎建設

- `app/robots.ts`：允許全站，指向 sitemap。
- `app/sitemap.ts`：含 `/`、全部 `/word/[headword]` 頁。
- `app/layout.tsx` metadata 補齊：`metadataBase: new URL('https://0stack.org')`、OG/Twitter card 預設值。
- 靜態 OG image：1200×630 PNG（狐狸＋標題），一次性製作放 `public/`，供 landing 與未各自指定的頁面使用（LINE/FB 貼連結有預覽卡）。
- 單字頁 `generateMetadata`：title「{headword} 中文意思・例句｜VocabApp」、description 取中譯＋首句例句。

### 4. 成就分享卡（純前端）

- 入口：`/stats` 頁「分享我的成績 📤」按鈕；home 放一個小入口。
- 產圖：新元件群 `components/share-card/`。`<canvas>` 畫 1080×1350（IG 直式友善）：狐狸吉祥物（SVG 序列化 → `Image` → `drawImage`）、連續天數 🔥、等級/XP、徽章數、今日達標狀態、日期、`0stack.org` 字樣。等 `document.fonts.ready` 再繪製，避免字型閃替。
- 分享：`navigator.canShare({ files })` 支援 → Web Share API（手機直接分享到 LINE/IG）；不支援（桌機）→ fallback 下載 PNG。
- 資料來源：全部用頁面上已有的 gamification 資料（後端算好的既有值），**不新增 API、不碰硬幣經濟**。分享卡只是把已呈現的數字畫成圖。

## 模組邊界

- 新增程式落在 `content`（repository 兩個查詢方法）與純前端呈現層（landing、word 頁、share-card），不動 `scheduler`/`learning`/`gamification`/`shop` 邏輯。
- 分享卡不 publish/subscribe 任何領域事件、不寫任何狀態。

## 測試（TDD）

- `getWordByHeadword`：大小寫正規化、多書合併（例句聯集、首筆欄位）、查無此字回 null。
- `listAllHeadwords`：去重、排序穩定。
- `app/sitemap.ts` 條目生成邏輯（抽成可測純函式）。
- 分享卡「gamification 資料 → 版面文案」抽成 pure function 測試；canvas 繪製本身不單測。

## 手動驗收

- iPhone 實機：Web Share 分享到 LINE/IG。
- LINE/FB 貼 `0stack.org` 與單字頁連結，確認 OG 預覽卡。
- 上線後 Google Search Console 提交 sitemap（使用者操作）。

## 已知限制

- 靜態 OG image 對所有頁面同一張（單字頁不做動態 OG 圖，留待之後評估 workers-og）。
- 公開單字頁可被爬蟲整包抓走題庫內容——內容本來就對前端可見，接受此限制。
