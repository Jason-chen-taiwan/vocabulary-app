# 吉祥物與插畫（小橙狐）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一隻原創 SVG 吉祥物「小橙狐」（4 種情境表情）與裝飾彩帶，整合進登入/首頁/空狀態/結束畫面，純表現層、不改任何邏輯/資料。

**Architecture:** 新增 `components/ui/mascot.tsx`（單一 inline SVG，依 `mood` 切換部件 + 純函式表情推導）與 `components/ui/confetti.tsx`（裝飾 SVG）。各頁只是 import 並放置元件，mood 由既有可得資料推導（零新查詢、零新依賴）。

**Tech Stack:** Next.js 16 App Router、React 19、Tailwind v4、Vitest。

## Global Constraints

- **純表現層**：不改業務邏輯、server action 介面、資料模型、repository；唯讀沿用既有資料。既有 **110 個測試須全綠**。
- **原創 + 零成本**：靜態 inline SVG，無外部圖檔、無 runtime AI、無外部請求、edge 安全。
- 沿用既有 tokens 與配色（verbatim）：橙 `#FF6A3D`、ink `#1A1A1A`、嘴吻 `#FFF7F2`、淺橙 `#FFB68F`、淚珠 `#2BB3C0`。
- mood 清單：`['hi','cheer','encourage','sad']`。推導門檻：home → goalMet 為 cheer / `streak===0 && longestStreak>0` 為 sad / 否則 hi；sessionEnd → 全對為 cheer / `correct/total < 0.5` 為 encourage / 否則 cheer。
- 裝飾元素 `aria-hidden`；尊重 `prefers-reduced-motion`（沿用既有 `.animate-pop-in`，該動畫在 reduced-motion 下已被全域降級）。
- 跟隨既有寫法：`components/ui/` 純表現元件、`@/` 別名、繁中文案。
- 採 TDD（先寫推導純函式測試）。
- 測試指令：`npx vitest run <path>`；型別：`npx tsc --noEmit`；建置：`npm run build`。

---

## File Structure

**新增**
- `components/ui/mascot.tsx` — `Mascot` 元件（單一 SVG，mood 切換）+ `MASCOT_MOODS` + `MascotMood` 型別 + 純函式 `moodForHome`、`moodForSessionEnd`。
- `components/ui/confetti.tsx` — `Confetti` 裝飾 SVG（彩帶/星點）。
- `components/ui/__tests__/mascot.test.ts` — 測 `MASCOT_MOODS`、`moodForHome`、`moodForSessionEnd`。

**修改（放置元件，純呈現）**
- `app/login/page.tsx`、`app/page.tsx`、`app/learn/[slug]/page.tsx`、`components/review-session.tsx`。

---

## Task 1: Mascot 元件 + 表情推導純函式

**Files:**
- Create: `components/ui/mascot.tsx`
- Test: `components/ui/__tests__/mascot.test.ts`

**Interfaces:**
- Produces:
  - `type MascotMood = 'hi' | 'cheer' | 'encourage' | 'sad'`
  - `MASCOT_MOODS: readonly MascotMood[]`
  - `moodForHome(args: { goalMet: boolean; streak: number; longestStreak: number }): MascotMood`
  - `moodForSessionEnd(args: { correct: number; total: number }): MascotMood`
  - `Mascot(props: { mood?: MascotMood; size?: number; className?: string }): JSX.Element`

- [ ] **Step 1: 寫失敗測試**

建立 `components/ui/__tests__/mascot.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { MASCOT_MOODS, moodForHome, moodForSessionEnd } from '@/components/ui/mascot'

describe('MASCOT_MOODS', () => {
  it('lists the four moods', () => {
    expect([...MASCOT_MOODS].sort()).toEqual(['cheer', 'encourage', 'hi', 'sad'])
  })
})

describe('moodForHome', () => {
  it('goal met → cheer (takes priority)', () => {
    expect(moodForHome({ goalMet: true, streak: 0, longestStreak: 9 })).toBe('cheer')
  })
  it('broken streak (now 0 but had one) → sad', () => {
    expect(moodForHome({ goalMet: false, streak: 0, longestStreak: 5 })).toBe('sad')
  })
  it('brand-new user (0/0) → hi, not sad', () => {
    expect(moodForHome({ goalMet: false, streak: 0, longestStreak: 0 })).toBe('hi')
  })
  it('active streak, goal not yet met → hi', () => {
    expect(moodForHome({ goalMet: false, streak: 3, longestStreak: 5 })).toBe('hi')
  })
})

describe('moodForSessionEnd', () => {
  it('all correct → cheer', () => {
    expect(moodForSessionEnd({ correct: 12, total: 12 })).toBe('cheer')
  })
  it('below half correct → encourage', () => {
    expect(moodForSessionEnd({ correct: 3, total: 12 })).toBe('encourage')
  })
  it('decent but not perfect → cheer', () => {
    expect(moodForSessionEnd({ correct: 9, total: 12 })).toBe('cheer')
  })
  it('empty session → cheer (no division by zero)', () => {
    expect(moodForSessionEnd({ correct: 0, total: 0 })).toBe('cheer')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/ui/__tests__/mascot.test.ts`
Expected: FAIL（`@/components/ui/mascot` 不存在）。

- [ ] **Step 3: 實作 `components/ui/mascot.tsx`**

```tsx
// 原創 SVG 吉祥物「小橙狐」。單一 SVG，依 mood 切換耳/眼/嘴/手勢部件，base 共用。
// 純表現、無業務依賴。顏色取自設計 tokens。
export const MASCOT_MOODS = ['hi', 'cheer', 'encourage', 'sad'] as const
export type MascotMood = (typeof MASCOT_MOODS)[number]

export function moodForHome(args: { goalMet: boolean; streak: number; longestStreak: number }): MascotMood {
  if (args.goalMet) return 'cheer'
  if (args.streak === 0 && args.longestStreak > 0) return 'sad'
  return 'hi'
}

export function moodForSessionEnd(args: { correct: number; total: number }): MascotMood {
  if (args.total > 0 && args.correct === args.total) return 'cheer'
  if (args.total > 0 && args.correct / args.total < 0.5) return 'encourage'
  return 'cheer'
}

const ORANGE = '#FF6A3D'
const INK = '#1A1A1A'
const MUZZLE = '#FFF7F2'
const LIGHT = '#FFB68F'

export function Mascot({ mood = 'hi', size = 120, className = '' }: { mood?: MascotMood; size?: number; className?: string }) {
  const sad = mood === 'sad'
  return (
    <svg
      width={size}
      height={(size * 130) / 120}
      viewBox="0 0 120 130"
      fill="none"
      role="img"
      aria-label="小橙狐吉祥物"
      className={className}
    >
      {/* behind-face limbs */}
      {mood === 'hi' && (
        <path d="M86 78 q16 4 14 22" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
      )}
      {mood === 'cheer' && (
        <>
          <path d="M24 58 q-12 -14 -4 -28" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
          <path d="M96 58 q12 -14 4 -28" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
        </>
      )}

      {/* ears */}
      {sad ? (
        <>
          <path d="M28 44 Q15 30 30 14 Q31 33 50 35 Z" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M92 44 Q105 30 90 14 Q89 33 70 35 Z" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <polygon points="30,40 22,8 52,30" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <polygon points="90,40 98,8 68,30" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <polygon points="33,36 31,19 45,30" fill={LIGHT} />
          <polygon points="87,36 89,19 75,30" fill={LIGHT} />
        </>
      )}

      {/* face base (shared) */}
      <ellipse cx="60" cy="62" rx="40" ry="36" fill={ORANGE} stroke={INK} strokeWidth="3.5" />
      <ellipse cx="60" cy="78" rx="26" ry="16" fill={MUZZLE} />
      <ellipse cx="33" cy="69" rx="7" ry="5" fill={LIGHT} />
      <ellipse cx="87" cy="69" rx="7" ry="5" fill={LIGHT} />

      {/* eyes */}
      {mood === 'cheer' ? (
        <>
          <path d="M41 56 Q47 49 53 56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M67 56 Q73 49 79 56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="47" cy="54" r="6" fill={INK} />
          <circle cx="73" cy="54" r="6" fill={INK} />
          <circle cx="49" cy="52" r="2" fill="#fff" />
          <circle cx="75" cy="52" r="2" fill="#fff" />
        </>
      )}

      {/* nose (shared) */}
      <ellipse cx="60" cy="71" rx="4.5" ry="3.5" fill={INK} />

      {/* mouth */}
      {mood === 'cheer' ? (
        <path d="M51 78 Q60 90 69 78 Z" fill={INK} />
      ) : sad ? (
        <path d="M52 84 Q60 78 68 84" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M52 80 Q60 87 68 80" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      )}

      {/* front extras */}
      {mood === 'encourage' && (
        <>
          <path d="M90 72 q15 0 16 -12" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
          <circle cx="106" cy="54" r="7" fill={ORANGE} stroke={INK} strokeWidth="3" />
          <path d="M106 47 v-6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {mood === 'cheer' && (
        <>
          <text x="14" y="26" fontSize="16">✨</text>
          <text x="94" y="22" fontSize="13">✨</text>
        </>
      )}
      {mood === 'sad' && (
        <path d="M84 66 q4 7 0 11 q-4 -4 0 -11 Z" fill="#2BB3C0" stroke={INK} strokeWidth="1.5" />
      )}
    </svg>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run components/ui/__tests__/mascot.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: 型別 + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功。

- [ ] **Step 6: Commit**

```bash
git add components/ui/mascot.tsx components/ui/__tests__/mascot.test.ts
git commit -m "feat(ui): 小橙狐 mascot component + mood derivation"
```

---

## Task 2: Confetti 裝飾元件

**Files:**
- Create: `components/ui/confetti.tsx`

**Interfaces:**
- Produces：`Confetti(props: { className?: string }): JSX.Element`（裝飾性 SVG 彩帶/星點，`aria-hidden`）。

- [ ] **Step 1: 實作（純裝飾元件，無邏輯，不需測試）**

建立 `components/ui/confetti.tsx`：

```tsx
// 裝飾性彩帶/星點，用於慶祝畫面背景。aria-hidden，純呈現。
export function Confetti({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 80" width="200" height="80" fill="none" aria-hidden className={className}>
      <rect x="18" y="14" width="8" height="14" rx="2" fill="#FF6A3D" transform="rotate(-18 22 21)" />
      <rect x="170" y="10" width="8" height="14" rx="2" fill="#7C5CFC" transform="rotate(20 174 17)" />
      <circle cx="50" cy="10" r="4" fill="#F5B301" />
      <circle cx="150" cy="30" r="4" fill="#22A06B" />
      <path d="M96 6 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1 Z" fill="#F5B301" />
      <rect x="120" y="16" width="7" height="12" rx="2" fill="#2BB3C0" transform="rotate(-25 123 22)" />
      <circle cx="78" cy="34" r="3.5" fill="#FF6A3D" />
    </svg>
  )
}
```

- [ ] **Step 2: 型別 + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功。

- [ ] **Step 3: Commit**

```bash
git add components/ui/confetti.tsx
git commit -m "feat(ui): decorative Confetti element"
```

---

## Task 3: 放置於登入頁 + 首頁

**Files:**
- Modify: `app/login/page.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes：`Mascot`、`moodForHome`（Task 1）。

- [ ] **Step 1: 登入頁換掉 🔥 emoji**

於 `app/login/page.tsx`：頂部加 `import { Mascot } from '@/components/ui/mascot'`。將：
```tsx
      <div className="text-5xl">🔥</div>
```
換成：
```tsx
      <Mascot mood="hi" size={132} />
```

- [ ] **Step 2: 首頁問候區放吉祥物**

於 `app/page.tsx`：頂部加 `import { Mascot, moodForHome } from '@/components/ui/mascot'`。
現有問候行為（約 line 31）：
```tsx
        <h1 className="text-xl font-extrabold text-neutral-900">歡迎，{user.name ?? user.email}</h1>
```
在它**上方**插入吉祥物（mood 由既有 `done`/`goal`/`streak`/`longest` 推導）：
```tsx
        <Mascot mood={moodForHome({ goalMet: done >= goal, streak, longestStreak: longest })} size={120} />
        <h1 className="text-xl font-extrabold text-neutral-900">歡迎，{user.name ?? user.email}</h1>
```
（`done`/`goal`/`streak`/`longest` 是該檔已宣告的變數；不要改它們的計算。）

- [ ] **Step 3: 型別 + build + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、全綠（110 既有 + Task 1 新增）。

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/page.tsx
git commit -m "feat(ui): place 小橙狐 on login + home"
```

---

## Task 4: 放置於空狀態 + 結束慶祝（含 Confetti）

**Files:**
- Modify: `app/learn/[slug]/page.tsx`, `components/review-session.tsx`

**Interfaces:**
- Consumes：`Mascot`、`moodForSessionEnd`（Task 1）、`Confetti`（Task 2）；既有 state `correctCount`、`items`。

- [ ] **Step 1: /learn 空狀態放吉祥物**

於 `app/learn/[slug]/page.tsx`：頂部加 `import { Mascot } from '@/components/ui/mascot'`。
空狀態現有（約 line 48-49）：
```tsx
          <h1 className="text-2xl font-extrabold text-neutral-900">{book.name}</h1>
          <p className="mt-4 text-neutral-600">今天沒有待複習的單字了 🎉</p>
```
在 `<h1>` **上方**插入：
```tsx
          <Mascot mood="cheer" size={120} className="mx-auto" />
          <h1 className="text-2xl font-extrabold text-neutral-900">{book.name}</h1>
          <p className="mt-4 text-neutral-600">今天沒有待複習的單字了 🎉</p>
```

- [ ] **Step 2: 結束畫面換掉 🎉 並加 Confetti**

於 `components/review-session.tsx`：頂部 import 加上 `Mascot`、`moodForSessionEnd`、`Confetti`：
```tsx
import { Mascot, moodForSessionEnd } from '@/components/ui/mascot'
import { Confetti } from '@/components/ui/confetti'
```
結束畫面現有（約 line 97）：
```tsx
        <div className="text-5xl">🎉</div>
```
換成（彩帶置中於上、狐狸依答對率換表情）：
```tsx
        <Confetti className="mx-auto" />
        <Mascot mood={moodForSessionEnd({ correct: correctCount, total: items.length })} size={132} className="mx-auto" />
```
不要改任何 state/handler（`correctCount`、`items` 為既有；reward 累加、busy 守衛、`router.refresh()` 全部不動）。

- [ ] **Step 3: 型別 + build + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、全綠。

- [ ] **Step 4: Commit**

```bash
git add app/learn/[slug]/page.tsx components/review-session.tsx
git commit -m "feat(ui): place 小橙狐 + confetti on empty-state + session-end"
```

---

## Task 5: 全量驗證 + 手動視覺驗收

**Files:** 無（驗證）

- [ ] **Step 1: 全量測試**

Run: `npx vitest run`
Expected: 全部 passed（110 既有 + mascot 純函式新測）。

- [ ] **Step 2: 型別 + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功，6 路由產生。

- [ ] **Step 3: 手動視覺驗收（dev，手機寬視窗）**

`npm run dev`，登入後檢查：
- 登入頁：小橙狐揮手（取代 🔥）。
- 首頁：問候上方有狐狸；達標日顯示歡呼、平日揮手、（若曾有 streak 現歸零）難過。
- 進一本書 → 若今天已無到期字，空狀態顯示歡呼狐狸。
- 跑一輪複習到結束：彩帶 + 狐狸（全對歡呼、答對率<50% 鼓勵）。
四種表情都確認「單一鼻子 + 單一嘴」、描邊正常。驗證後關閉 dev server（PowerShell 找 port 3000 node 程序結束）。

- [ ] **Step 4: 最終 commit（若手動驗收有微調）**

```bash
git add -A
git commit -m "test(ui): mascot visual verification"
```

---

## Self-Review

**1. Spec coverage：**
- §3 小橙狐 + 4 表情（單鼻單嘴、部件切換）→ Task 1 `Mascot` ✓
- §4 元件架構（Mascot + MASCOT_MOODS + moodForHome/moodForSessionEnd）→ Task 1 ✓
- §5 出沒地點（登入/首頁/空狀態/結束）→ Task 3/4 ✓
- §6 場景插畫（結束彩帶）→ Task 2 `Confetti` + Task 4 放置 ✓（空狀態維持輕量、不另做大場景＝符合 spec）
- §7 動效（pop-in；reduced-motion 全域降級）→ 沿用既有 ✓
- §8 模組邊界（components/ui 純表現、頁面唯讀沿用資料）→ 全程 ✓
- §9 測試（推導純函式單元測試 + build + 手動）→ Task 1 + Task 5 ✓
- §10 排除（多角色/點陣/AI）→ 未納入 ✓
- §11 參數（顏色/門檻/size）→ Task 1 具名常數/函式 ✓

**2. Placeholder scan：** 無 TBD/「適當處理」；每個 code step 皆含完整程式或精確替換指示。✓

**3. Type consistency：**
- `MascotMood`/`MASCOT_MOODS`/`moodForHome`/`moodForSessionEnd`/`Mascot`/`Confetti` 在 Task 1/2 定義、Task 3/4 使用一致 ✓。
- `moodForHome` 參數名 `longestStreak`；首頁變數為 `longest`，已在 Task 3 以 `longestStreak: longest` 對應 ✓。
- `moodForSessionEnd({ correct, total })` 對應 `correctCount`/`items.length` ✓。
- 顏色常數與 tokens 值一致（#FF6A3D/#1A1A1A/#FFF7F2/#FFB68F/#2BB3C0）✓。
