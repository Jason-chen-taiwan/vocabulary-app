# 多益 800 進階字擴充（~949 → ~2000）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 9 本主題書各擴到 ~220 字（新增 ~115 個 800 級進階字、附加在既有字之後），總計 ~2000 字。

**Architecture:** 純內容：每本 `content/toeic-<topic>.json` 附加進階字（`SeedBook` 格式），經既有 `npm run seed` 入 Neon；core/scheduler/learning/content 程式不動。進階字 `examTags` 多一個 `"advanced"` 標記；`order`（seed 以陣列索引指定）讓核心字先於進階字出現。

**Tech Stack:** 純 JSON 內容、既有 seed/check-content 管線、Vitest（既有測試）。

## Global Constraints

- **純內容**，無 schema/程式改動；既有 127 測試須全綠；`tsc`+`build` 不受影響。
- **零成本**：離線原創靜態 JSON；無 runtime AI / 外部請求 / 付費源。
- 資料格式 = 既有 `SeedWord`（`lib/content/seed-schema.ts`）：`headword`(必)、`partOfSpeech`(填)、`definitionZh`(必,繁中)、`examples`(必,1–2)、`examTags`、**無 `phonetic`**。`SeedExample`：`sentence`(英,≤90 字元)、`translationZh`(繁中)。
- 進階字 `examTags = ["TOEIC","<topic>","advanced"]`（既有核心字維持 `["TOEIC","<topic>"]`，**不回頭改**）。
- **附加**：新進階字加在各書 `words` 陣列**既有字之後**（保持既有字順序/index → core 先於 advanced）。
- **去重**：新進階字不得與該書既有字重複、不得與其他書任何既有字（全 ~949）重複、不得與本批其他書新字重複（小寫正規化）；`scripts/check-content.mjs` 為最終把關（跨書 headword 去重 + 同書 definitionZh 去重 + 例句存在 + 句長≤90）。
- 同書 `definitionZh` 必須互相區別（擴到 ~220 字後干擾項池更大）。
- 入庫：`npm run seed content/<file>.json`（idempotent；需 live Neon `DATABASE_URL`）。
- 選字為知識為本（spec 允許的 fallback）；於報告標註。

---

## File Structure

**修改（附加進階字；9 檔）**，含目前字數與目標：
| slug | name | 現有 | 目標 |
|---|---|---|---|
| `toeic-office` | 辦公室與日常溝通 | 119 | ~225 |
| `toeic-meetings` | 會議與簡報 | 109 | ~220 |
| `toeic-hr` | 人力資源與職場 | 106 | ~220 |
| `toeic-finance` | 財務與會計 | 110 | ~220 |
| `toeic-contracts` | 合約與法律 | 100 | ~215 |
| `toeic-marketing` | 行銷與業務 | 102 | ~215 |
| `toeic-logistics` | 物流與供應鏈 | 104 | ~220 |
| `toeic-travel` | 商務差旅 | 98 | ~213 |
| `toeic-tech` | 資訊科技與辦公設備 | 101 | ~215 |

（各 +~115；總計 ~949 → ~1985。）無新增檔案，無程式檔變動。

---

## Task 1: 為 9 本各生成 ~115 個 800 級進階字（附加；可平行）

> **執行建議**：9 本各自獨立、改不同檔案，**一本一個 subagent 平行**生成；每本各自品質 review。**不要 git commit**（控制器最後統一 commit，避免 git 競爭）。

**Files (each book):**
- Modify: `content/<slug>.json`（附加進階字到 `words` 之後）

**Interfaces:**
- Consumes：該書既有 `words`（headword + definitionZh，用於去重 + 定義區別）；`SeedBook`/`SeedWord` 格式；Global Constraints 品質與去重規則。
- Produces：同一個 `content/<slug>.json`，`words` 由現有 ~N 增為 ~N+115，新字附加在後，整檔仍為合法 `SeedBook`。

**每本書的程序（對 §File Structure 的 9 本各做一次）：**

- [ ] **Step 1: 讀既有書**

讀 `content/<slug>.json`，記下現有所有 `headword`（小寫）與 `definitionZh`（用於避免重複與定義撞義）。

- [ ] **Step 2: 生成 ~115 個進階字並附加**

挑 ~115 個該主題的 **800 級次高頻商務字**（小寫原形、單一單字、無片語/連字號/縮寫），**不與既有字重複**（headword 與語意都要有別）。每字產一筆 `SeedWord`：
```json
{
  "headword": "<advanced word>",
  "partOfSpeech": "<n./v./adj./...>",
  "definitionZh": "<繁中精簡釋義；與同書既有字夠區別>",
  "examTags": ["TOEIC", "<topic>", "advanced"],
  "examples": [ { "sentence": "<商務情境英文句，用到該字，≤90 字元>", "translationZh": "<繁中翻譯>" } ]
}
```
把這 ~115 筆**附加在既有 `words` 之後**，寫回 `content/<slug>.json`（保持既有字不動、順序在前）。

- [ ] **Step 3: 結構驗證**

Run: `node --experimental-strip-types -e "import('./lib/content/seed-schema.ts').then(m=>{const fs=require('fs');const b=m.parseSeedBook(JSON.parse(fs.readFileSync('content/<slug>.json','utf8')));console.log('OK',b.slug,b.words.length)})"`
Expected: `OK <slug> ~220`（無 throw；字數約現有 +115）。

- [ ] **Step 4:（不 commit）回報**

不要執行 git。回報新增字數、最終字數、任何替換/取捨、驗證輸出。

---

## Task 2: 跨內容檢查 + 去重修正 + 提交

**Files:**
- Modify: 視 `check-content` 結果，修正有跨書重複的書。
- 然後 commit 全部 9 檔。

- [ ] **Step 1: 跨全部內容檢查**

Run: `npm run check-content`
Expected: 若有問題會列出（跨書 duplicate headword、同書 duplicate definition、no example、too long）。預期 ~10 書（9 主題；toeic-core 已退役不存在）、~1985 字。

- [ ] **Step 2: 修正重複**

對每個 `duplicate headword` 問題：保留較貼合主題的那本、從另一本移除該字的整筆 entry（或換一個不重複的進階字）。對 `duplicate definition`/`too long`/`no example`：修正該筆。重跑 `npm run check-content` 直到輸出 `OK: ... no problems.`。

（可用一次性 node 腳本移除指定 (檔, headword) 重複，比照先前作法。）

- [ ] **Step 3: 結構複驗 + 既有測試**

Run: `npx vitest run 2>&1 | tail -3`（既有測試應全綠，內容不影響邏輯）
Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E "Compiled|error"`（乾淨、成功）

- [ ] **Step 4: Commit 全部主題書**

```bash
git add content/toeic-*.json
git commit -m "content: add ~1050 TOEIC 800-level advanced words (9 books → ~2000 total)"
```

---

## Task 3: 逐本入庫 + 端到端驗證

**Files:** 無（seed + 驗證）

- [ ] **Step 1: 逐本 reseed（live Neon；分批避免逾時）**

對 9 本各跑（每本 ~220 字較久，建議分 2–3 批或背景執行）：
```bash
npm run seed content/toeic-office.json
npm run seed content/toeic-meetings.json
npm run seed content/toeic-hr.json
npm run seed content/toeic-finance.json
npm run seed content/toeic-contracts.json
npm run seed content/toeic-marketing.json
npm run seed content/toeic-logistics.json
npm run seed content/toeic-travel.json
npm run seed content/toeic-tech.json
```
Expected: 每本印出 `Seeded book "..." with ~220 words.`，無錯誤。

- [ ] **Step 2: 端到端驗證（dev）**

`npm run dev`，登入後：
- `/books` 各書顯示 ~220 字（總計 ~2000）。
- 進某主題書 → `/learn/<slug>`：新卡先出核心字（order 小）、進階字在後（order 大）。
- 較大詞庫下三題型運作；MC 干擾項（同書定義）仍合理區別。
驗證後關閉 dev server。

- [ ] **Step 3: 最終 commit（若驗收有微調）**

```bash
git add -A
git commit -m "content: seed + verify TOEIC ~2000-word pack (800 level)"
```

---

## Self-Review

**1. Spec coverage：**
- §2 結構（9 本各 ~220、進階附加在後、order 進度）→ Task 1（附加）+ Task 3 Step2（驗證 order）✓
- §3 選字（800 級、三層去重）→ Task 1 Step2 + Task 2（check-content 去重）✓
- §4 內容（欄位、advanced 標記、定義區別、無音標、句長）→ Global Constraints + Task 1 ✓
- §5 流程（每本附加、check-content、逐本 seed）→ Task 1/2/3 ✓
- §6 邊界（純內容、無 schema/程式改動）→ 全程；無程式檔在 Files ✓
- §7 驗收（check-content、測試、build、seed、e2e order）→ Task 2/3 ✓
- §8 排除 → 未納入 ✓；§9 參數（~115/本、句長≤90、advanced 標記）→ 對齊 ✓

**2. Placeholder scan：** 進階字「字本身」是執行時依規則產出的資料產物（給定 schema/數量/去重/品質/驗證指令），非佔位；驗證/seed 步驟皆具完整指令。✓

**3. Type consistency：** 沿用既有 `SeedBook`/`SeedWord`（含 `examTags` 陣列可含 `"advanced"`）；`check-content`/`seed`/`parseSeedBook` 介面不變；slug/檔名與既有一致。✓
