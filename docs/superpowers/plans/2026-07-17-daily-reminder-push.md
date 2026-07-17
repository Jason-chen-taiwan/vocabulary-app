# Daily Reminder Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver "關 app 也收到" daily reminders via Web Push, triggered by a standalone Cloudflare Cron Worker, pulling reminder-due users from the shared Neon DB.

**Architecture:** Main OpenNext app stores push subscriptions + reminder prefs and exposes `/api/push/*`. A separate `workers/reminder` Worker runs an hourly cron, selects users whose local reminder-hour == now and who haven't hit today's goal, and sends Web Push. Core scheduler/gamification untouched — reminders subscribe to state, never mutate it.

**Tech Stack:** Next.js (App Router), Prisma + Neon HTTP adapter, Cloudflare Workers Cron Triggers, Web Push (VAPID), Vitest.

## Global Constraints

- **No runtime paid AI; no auto-billing overruns.** Reminders use free Web Push + free-tier Cron (≤3 triggers). Verbatim from spec 成本鐵則.
- **Backend authoritative; never trust frontend identity.** `/api/push/*` binds user via `getCurrentUser()` (Auth.js); never trust a client-sent userId.
- **DB access only through Prisma + repository pattern** (`getPrisma()` from `@/lib/db/client`); repositories take an injectable db interface for testing. No raw SQL.
- **ts-fsrs / scheduler / gamification core files must not change.** New code lives in `lib/push`, `app/api/push/*`, `workers/reminder`, plus additive schema + settings UI.
- **Edge-safe DB:** Neon HTTP adapter, no TCP pool.
- **Cron runs in UTC**; per-user local time via `utcHourFor(reminderHour, tzOffsetHours) = (reminderHour - tzOffsetHours + 24) % 24`.
- Notification copy (fixed this round): title `該背單字了 🦊`, body `今天還沒達標，來 5 分鐘`, url `/learn`.

---

## File Structure

- `prisma/schema.prisma` — add `PushSubscription` model + `User.reminderEnabled` / `User.reminderHour` (modify).
- `lib/push/time.ts` — pure `utcHourFor` + `localDateString` helpers.
- `lib/push/subscription-repo.ts` — `PushSubscriptionRepository` (upsert / delete / list-due).
- `lib/push/types.ts` — shared `PushSubscriptionData`, `DueUser` types.
- `app/api/push/subscribe/route.ts` — POST upsert subscription (auth).
- `app/api/push/unsubscribe/route.ts` — POST delete subscription (auth).
- `app/settings/reminder-actions.ts` — server action to save reminder prefs.
- `app/settings/reminder-form.tsx` — client toggle + hour select + subscribe button.
- `app/settings/page.tsx` — mount reminder form (modify).
- `lib/user/settings.ts` — extend repo with reminder prefs get/update (modify).
- `public/sw.js` — add `push` + `notificationclick` handlers (modify).
- `workers/reminder/wrangler.toml` — cron worker config.
- `workers/reminder/src/index.ts` — `scheduled()` handler.
- `workers/reminder/src/reminders.ts` — `selectDueUsers` + `runReminders` (pure-ish, db injected).
- `workers/reminder/src/push.ts` — `sendPush` wrapper.
- Test files colocated under `__tests__/`.

---

### Task 1: Schema — subscription table + reminder prefs

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `PushSubscription` model (`id`, `userId`, `endpoint @unique`, `p256dh`, `auth`, `createdAt`); `User.reminderEnabled Boolean @default(false)`, `User.reminderHour Int @default(20)`.

- [ ] **Step 1: Add reminder fields to User model**

In `prisma/schema.prisma`, inside `model User { ... }` (near `dailyGoal`), add:

```prisma
  reminderEnabled  Boolean  @default(false)
  reminderHour     Int      @default(20)
  pushSubscriptions PushSubscription[]
```

- [ ] **Step 2: Add PushSubscription model**

Append after the `User` model:

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 3: Generate client + create migration**

Run: `npx prisma migrate dev --name push_subscriptions`
Expected: migration created, `prisma generate` runs, no errors. (If offline DB, run `npx prisma generate` and hand-write the SQL migration under `prisma/migrations/`.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(push): schema for push subscriptions + reminder prefs"
```

---

### Task 2: Time helpers (pure)

**Files:**
- Create: `lib/push/time.ts`
- Test: `lib/push/__tests__/time.test.ts`

**Interfaces:**
- Produces: `utcHourFor(reminderHour: number, tzOffsetHours: number): number`; `localDateString(nowUtcMs: number, tzOffsetHours: number): string` (YYYY-MM-DD).

- [ ] **Step 1: Write the failing test**

`lib/push/__tests__/time.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { utcHourFor, localDateString } from '../time'

describe('utcHourFor', () => {
  it('converts Taipei (UTC+8) 20:00 local to 12:00 UTC', () => {
    expect(utcHourFor(20, 8)).toBe(12)
  })
  it('wraps past midnight: Taipei 06:00 local -> 22:00 UTC', () => {
    expect(utcHourFor(6, 8)).toBe(22)
  })
  it('handles negative offset: EST (UTC-5) 20:00 -> 01:00 UTC', () => {
    expect(utcHourFor(20, -5)).toBe(1)
  })
})

describe('localDateString', () => {
  it('returns local calendar date for a UTC instant', () => {
    // 2026-07-17T23:30:00Z + 8h = 2026-07-18 07:30 local
    const ms = Date.UTC(2026, 6, 17, 23, 30)
    expect(localDateString(ms, 8)).toBe('2026-07-18')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/push/__tests__/time.test.ts`
Expected: FAIL — cannot find module `../time`.

- [ ] **Step 3: Write minimal implementation**

`lib/push/time.ts`:

```typescript
// Pure time helpers for reminder scheduling. Cron runs in UTC; users pick a
// local hour. tzOffsetHours is the user's offset from UTC (Asia/Taipei = 8).

export function utcHourFor(reminderHour: number, tzOffsetHours: number): number {
  return ((reminderHour - tzOffsetHours) % 24 + 24) % 24
}

export function localDateString(nowUtcMs: number, tzOffsetHours: number): string {
  const local = new Date(nowUtcMs + tzOffsetHours * 3600_000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/push/__tests__/time.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/push/time.ts lib/push/__tests__/time.test.ts
git commit -m "feat(push): pure utcHourFor + localDateString helpers"
```

---

### Task 3: Subscription repository

**Files:**
- Create: `lib/push/types.ts`
- Create: `lib/push/subscription-repo.ts`
- Test: `lib/push/__tests__/subscription-repo.test.ts`

**Interfaces:**
- Consumes: `getPrisma()` from `@/lib/db/client` (injectable).
- Produces:
  - `PushSubscriptionData = { endpoint: string; p256dh: string; auth: string }`
  - `DueUser = { userId: string; timezone: string; subscriptions: PushSubscriptionData[] }`
  - `class PushSubscriptionRepository` with:
    - `upsert(userId: string, sub: PushSubscriptionData): Promise<void>`
    - `deleteByEndpoint(endpoint: string): Promise<void>`
    - `listDue(nowUtcHour: number): Promise<DueUser[]>`

- [ ] **Step 1: Write the failing test**

`lib/push/__tests__/subscription-repo.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { PushSubscriptionRepository } from '../subscription-repo'

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    pushSubscription: {
      upsert: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    user: {
      findMany: vi.fn(async () => []),
    },
    ...overrides,
  } as never
}

describe('PushSubscriptionRepository', () => {
  it('upsert keys on endpoint and stores keys + userId', async () => {
    const db = fakeDb()
    const repo = new PushSubscriptionRepository(db)
    await repo.upsert('u1', { endpoint: 'https://push/x', p256dh: 'k', auth: 'a' })
    expect((db as never as { pushSubscription: { upsert: ReturnType<typeof vi.fn> } })
      .pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://push/x' },
      create: { userId: 'u1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' },
      update: { userId: 'u1', p256dh: 'k', auth: 'a' },
    })
  })

  it('deleteByEndpoint removes the row', async () => {
    const db = fakeDb()
    const repo = new PushSubscriptionRepository(db)
    await repo.deleteByEndpoint('https://push/x')
    expect((db as never as { pushSubscription: { delete: ReturnType<typeof vi.fn> } })
      .pushSubscription.delete).toHaveBeenCalledWith({ where: { endpoint: 'https://push/x' } })
  })

  it('listDue queries reminderEnabled users with subscriptions and shapes DueUser', async () => {
    const db = fakeDb({
      user: {
        findMany: vi.fn(async () => [
          {
            id: 'u1',
            timezone: 'Asia/Taipei',
            pushSubscriptions: [{ endpoint: 'e', p256dh: 'k', auth: 'a' }],
          },
        ]),
      },
    })
    const repo = new PushSubscriptionRepository(db)
    const due = await repo.listDue(12)
    expect(due).toEqual([
      { userId: 'u1', timezone: 'Asia/Taipei', subscriptions: [{ endpoint: 'e', p256dh: 'k', auth: 'a' }] },
    ])
    const call = (db as never as { user: { findMany: ReturnType<typeof vi.fn> } }).user.findMany.mock.calls[0][0]
    expect(call.where.reminderEnabled).toBe(true)
    expect(call.where.pushSubscriptions).toEqual({ some: {} })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/push/__tests__/subscription-repo.test.ts`
Expected: FAIL — cannot find module `../subscription-repo`.

- [ ] **Step 3: Write types**

`lib/push/types.ts`:

```typescript
export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export interface DueUser {
  userId: string
  timezone: string
  subscriptions: PushSubscriptionData[]
}
```

- [ ] **Step 4: Write repository**

`lib/push/subscription-repo.ts`:

```typescript
import { getPrisma } from '@/lib/db/client'
import type { PushSubscriptionData, DueUser } from './types'

interface PushDb {
  pushSubscription: {
    upsert(a: unknown): Promise<unknown>
    delete(a: unknown): Promise<unknown>
  }
  user: {
    findMany(a: unknown): Promise<unknown[]>
  }
}

// listDue returns every reminder-enabled user that has at least one subscription.
// Hour filtering (utcHourFor) happens in the worker, which knows each user's
// tzOffset — the DB layer just narrows to enabled + subscribed. nowUtcHour is
// accepted for a future SQL-side hour filter; kept in the signature now so the
// worker call site is stable.
export class PushSubscriptionRepository {
  private readonly db: PushDb
  constructor(db?: PushDb) {
    this.db = db ?? (getPrisma() as unknown as PushDb)
  }

  async upsert(userId: string, sub: PushSubscriptionData): Promise<void> {
    await this.db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    })
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.pushSubscription.delete({ where: { endpoint } })
  }

  async listDue(_nowUtcHour: number): Promise<DueUser[]> {
    const rows = (await this.db.user.findMany({
      where: { reminderEnabled: true, pushSubscriptions: { some: {} } },
      select: {
        id: true,
        timezone: true,
        pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
      },
    })) as Array<{ id: string; timezone: string; pushSubscriptions: PushSubscriptionData[] }>

    return rows.map((r) => ({
      userId: r.id,
      timezone: r.timezone,
      subscriptions: r.pushSubscriptions,
    }))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/push/__tests__/subscription-repo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/push/types.ts lib/push/subscription-repo.ts lib/push/__tests__/subscription-repo.test.ts
git commit -m "feat(push): PushSubscriptionRepository (upsert/delete/listDue)"
```

---

### Task 4: Subscribe / unsubscribe API routes

**Files:**
- Create: `app/api/push/subscribe/route.ts`
- Create: `app/api/push/unsubscribe/route.ts`
- Test: `app/api/push/__tests__/routes.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser()` from `@/lib/auth/session`; `PushSubscriptionRepository` from Task 3.
- Produces: `POST /api/push/subscribe` (body `{ endpoint, keys: { p256dh, auth } }`), `POST /api/push/unsubscribe` (body `{ endpoint }`). Both return `{ ok: boolean }`.

Routes are thin; to keep them testable the handler logic lives in exported functions that take an injected user + repo.

- [ ] **Step 1: Write the failing test**

`app/api/push/__tests__/routes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { handleSubscribe, handleUnsubscribe } from '../subscribe/handler'

const okUser = { id: 'u1', email: 'a@b.c', name: null, image: null }

function repo() {
  return { upsert: vi.fn(async () => {}), deleteByEndpoint: vi.fn(async () => {}) }
}

describe('handleSubscribe', () => {
  it('rejects when not authenticated', async () => {
    const r = repo()
    const res = await handleSubscribe(null, { endpoint: 'e', keys: { p256dh: 'k', auth: 'a' } }, r as never)
    expect(res.ok).toBe(false)
    expect(r.upsert).not.toHaveBeenCalled()
  })

  it('upserts subscription bound to session user, ignoring any client userId', async () => {
    const r = repo()
    const res = await handleSubscribe(
      okUser,
      { endpoint: 'e', keys: { p256dh: 'k', auth: 'a' }, userId: 'ATTACKER' } as never,
      r as never
    )
    expect(res.ok).toBe(true)
    expect(r.upsert).toHaveBeenCalledWith('u1', { endpoint: 'e', p256dh: 'k', auth: 'a' })
  })

  it('rejects malformed body', async () => {
    const r = repo()
    const res = await handleSubscribe(okUser, { endpoint: 'e' } as never, r as never)
    expect(res.ok).toBe(false)
  })
})

describe('handleUnsubscribe', () => {
  it('deletes by endpoint when authed', async () => {
    const r = repo()
    const res = await handleUnsubscribe(okUser, { endpoint: 'e' }, r as never)
    expect(res.ok).toBe(true)
    expect(r.deleteByEndpoint).toHaveBeenCalledWith('e')
  })
  it('rejects when not authed', async () => {
    const r = repo()
    const res = await handleUnsubscribe(null, { endpoint: 'e' }, r as never)
    expect(res.ok).toBe(false)
    expect(r.deleteByEndpoint).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/push/__tests__/routes.test.ts`
Expected: FAIL — cannot find module `../subscribe/handler`.

- [ ] **Step 3: Write the handler logic**

`app/api/push/subscribe/handler.ts`:

```typescript
import type { SessionUser } from '@/lib/auth/session'
import type { PushSubscriptionRepository } from '@/lib/push/subscription-repo'

interface SubscribeBody {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

export async function handleSubscribe(
  user: SessionUser | null,
  body: SubscribeBody,
  repo: Pick<PushSubscriptionRepository, 'upsert'>
): Promise<{ ok: boolean }> {
  if (!user) return { ok: false }
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return { ok: false }
  }
  await repo.upsert(user.id, { endpoint, p256dh, auth })
  return { ok: true }
}

export async function handleUnsubscribe(
  user: SessionUser | null,
  body: { endpoint?: unknown },
  repo: Pick<PushSubscriptionRepository, 'deleteByEndpoint'>
): Promise<{ ok: boolean }> {
  if (!user) return { ok: false }
  if (typeof body?.endpoint !== 'string') return { ok: false }
  await repo.deleteByEndpoint(body.endpoint)
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/push/__tests__/routes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the route handlers**

`app/api/push/subscribe/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { PushSubscriptionRepository } from '@/lib/push/subscription-repo'
import { handleSubscribe } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const res = await handleSubscribe(user, body, new PushSubscriptionRepository())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
```

`app/api/push/unsubscribe/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { PushSubscriptionRepository } from '@/lib/push/subscription-repo'
import { handleUnsubscribe } from '../subscribe/handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const res = await handleUnsubscribe(user, body, new PushSubscriptionRepository())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS (all suites, including new push tests).

- [ ] **Step 7: Commit**

```bash
git add app/api/push
git commit -m "feat(push): subscribe/unsubscribe routes bound to session user"
```

---

### Task 5: Settings — reminder prefs (repo + action)

**Files:**
- Modify: `lib/user/settings.ts`
- Create: `app/settings/reminder-actions.ts`
- Test: `lib/user/__tests__/reminder-settings.test.ts`

**Interfaces:**
- Consumes: existing `UserSettingsRepository` db interface.
- Produces:
  - `UserSettingsRepository.getReminder(userId): Promise<{ reminderEnabled: boolean; reminderHour: number }>`
  - `UserSettingsRepository.updateReminder(userId, { reminderEnabled, reminderHour }): Promise<void>`
  - `updateReminderAction(enabled: boolean, hour: number): Promise<{ ok: boolean }>`

- [ ] **Step 1: Write the failing test**

`lib/user/__tests__/reminder-settings.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { UserSettingsRepository } from '../settings'

function db(row: unknown = null) {
  return {
    user: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async () => ({})),
    },
  } as never
}

describe('reminder settings', () => {
  it('getReminder returns defaults when row missing', async () => {
    const repo = new UserSettingsRepository(db(null))
    expect(await repo.getReminder('u1')).toEqual({ reminderEnabled: false, reminderHour: 20 })
  })

  it('getReminder returns stored prefs', async () => {
    const repo = new UserSettingsRepository(db({ reminderEnabled: true, reminderHour: 7 }))
    expect(await repo.getReminder('u1')).toEqual({ reminderEnabled: true, reminderHour: 7 })
  })

  it('updateReminder clamps hour to 0-23', async () => {
    const d = db()
    const repo = new UserSettingsRepository(d)
    await repo.updateReminder('u1', { reminderEnabled: true, reminderHour: 99 })
    const arg = (d as never as { user: { update: ReturnType<typeof vi.fn> } }).user.update.mock.calls[0][0]
    expect(arg.data.reminderHour).toBe(23)
    expect(arg.data.reminderEnabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/user/__tests__/reminder-settings.test.ts`
Expected: FAIL — `getReminder` is not a function.

- [ ] **Step 3: Extend the repository**

In `lib/user/settings.ts`, extend the `UserDb` interface `select` usage and add two methods inside the class:

```typescript
  async getReminder(userId: string): Promise<{ reminderEnabled: boolean; reminderHour: number }> {
    const row = (await this.db.user.findUnique({
      where: { id: userId },
      select: { reminderEnabled: true, reminderHour: true },
    })) as { reminderEnabled: boolean; reminderHour: number } | null
    return row ?? { reminderEnabled: false, reminderHour: 20 }
  }

  async updateReminder(
    userId: string,
    data: { reminderEnabled: boolean; reminderHour: number }
  ): Promise<void> {
    const hour = Math.max(0, Math.min(23, Math.trunc(data.reminderHour)))
    await this.db.user.update({
      where: { id: userId },
      data: { reminderEnabled: data.reminderEnabled, reminderHour: hour },
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/user/__tests__/reminder-settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the server action**

`app/settings/reminder-actions.ts`:

```typescript
'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { UserSettingsRepository } from '@/lib/user/settings'

export async function updateReminderAction(
  enabled: boolean,
  hour: number
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await new UserSettingsRepository().updateReminder(user.id, {
    reminderEnabled: enabled,
    reminderHour: hour,
  })
  return { ok: true }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/user/settings.ts app/settings/reminder-actions.ts lib/user/__tests__/reminder-settings.test.ts
git commit -m "feat(push): reminder prefs repo methods + server action"
```

---

### Task 6: Settings UI — reminder form + subscribe flow

**Files:**
- Create: `app/settings/reminder-form.tsx`
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: `updateReminderAction` (Task 5); `POST /api/push/subscribe|unsubscribe` (Task 4); `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env (set in Task 8).
- Produces: `<ReminderForm initialEnabled initialHour />` client component.

- [ ] **Step 1: Write the client component**

`app/settings/reminder-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateReminderAction } from './reminder-actions'

// VAPID public key must be url-base64 decoded to a Uint8Array for PushManager.
function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function subscribeBrowser(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return false
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(key),
  })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(json),
  })
  return res.ok
}

async function unsubscribeBrowser(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  await sub.unsubscribe()
}

export function ReminderForm({
  initialEnabled,
  initialHour,
}: {
  initialEnabled: boolean
  initialHour: number
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [hour, setHour] = useState(initialHour)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      if (enabled) {
        const ok = await subscribeBrowser()
        if (!ok) {
          setMsg('無法開啟通知（需允許權限，iOS 需先把 App 加到主畫面）')
          setBusy(false)
          return
        }
      } else {
        await unsubscribeBrowser()
      }
      await updateReminderAction(enabled, hour)
      setMsg('已儲存')
      router.refresh()
    } catch {
      setMsg('儲存失敗')
    }
    setBusy(false)
  }

  return (
    <Card className="mt-4 space-y-4 p-5">
      <label className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">每日提醒</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 accent-primary-500"
        />
      </label>
      <label className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">提醒時間</span>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          disabled={!enabled}
          className="rounded-control border-2 border-primary-200 bg-surface px-3 py-1.5 text-neutral-900 focus:border-primary-500 focus:outline-none disabled:opacity-50"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </label>
      <Button onClick={save} disabled={busy} fullWidth>
        {busy ? '儲存中…' : '儲存'}
      </Button>
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
    </Card>
  )
}
```

- [ ] **Step 2: Mount in settings page**

In `app/settings/page.tsx`, import and render the form. Add near the top:

```tsx
import { ReminderForm } from './reminder-form'
```

Fetch reminder prefs alongside existing settings (after the `const s = ...` line):

```tsx
  const r = await new UserSettingsRepository().getReminder(user.id)
```

Then render `<ReminderForm />` right after the existing `<SettingsForm .../>`:

```tsx
      <ReminderForm initialEnabled={r.reminderEnabled} initialHour={r.reminderHour} />
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds, no type errors in `app/settings`.

- [ ] **Step 4: Commit**

```bash
git add app/settings/reminder-form.tsx app/settings/page.tsx
git commit -m "feat(push): settings reminder toggle + browser subscribe flow"
```

---

### Task 7: Service worker push + click handlers

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: push payload `{ title, body, url }` sent by the reminder worker (Task 9).
- Produces: notification display + focus/open `/learn` on click.

- [ ] **Step 1: Add push + notificationclick handlers**

Append to `public/sw.js`:

```javascript
self.addEventListener('push', (event) => {
  let data = { title: '該背單字了 🦊', body: '今天還沒達標，來 5 分鐘', url: '/learn' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (_e) {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/learn'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
```

- [ ] **Step 2: Verify icon path exists**

Run: `ls public/icon-192.png`
Expected: file exists. If the icon has a different name, run `ls public/*.png` and use the actual 192px icon path in both `icon` and `badge` above.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(push): service worker push + notificationclick handlers"
```

---

### Task 8: VAPID keys + env wiring

**Files:**
- Create: `workers/reminder/.dev.vars.example`
- Modify: `.env.example` (or create if absent)
- Modify: `README.md` (deploy note — append a short section)

**Interfaces:**
- Produces: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (main app, public), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (reminder worker secrets).

- [ ] **Step 1: Generate a VAPID keypair**

Run: `npx web-push generate-vapid-keys --json`
Expected: JSON with `publicKey` and `privateKey`. Copy both. (This installs `web-push` transitively via npx; Task 9 adds it as a real dep.)

- [ ] **Step 2: Document main-app public key**

Add to `.env.example`:

```
# Web Push (public key is safe to expose to the browser)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<paste publicKey from web-push generate-vapid-keys>
```

Set the real value in the Cloudflare Pages/Workers dashboard for the main app (env var, not secret — it is public).

- [ ] **Step 3: Document worker secrets**

`workers/reminder/.dev.vars.example`:

```
VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
VAPID_SUBJECT=mailto:you@example.com
DATABASE_URL=<same Neon HTTP URL as main app>
```

Real secrets set via: `cd workers/reminder && npx wrangler secret put VAPID_PRIVATE_KEY` (repeat per secret). `DATABASE_URL` is the same Neon connection string the main app uses.

- [ ] **Step 4: Append a README deploy note**

Add a short "Daily reminder push" section to `README.md` covering: generate VAPID keys, set the public key on the main app, set worker secrets, deploy the reminder worker (`cd workers/reminder && npx wrangler deploy`).

- [ ] **Step 5: Commit**

```bash
git add .env.example workers/reminder/.dev.vars.example README.md
git commit -m "docs(push): VAPID key generation + env wiring notes"
```

---

### Task 9: Reminder worker — selection + send + cron

**Files:**
- Create: `workers/reminder/package.json`
- Create: `workers/reminder/wrangler.toml`
- Create: `workers/reminder/tsconfig.json`
- Create: `workers/reminder/src/tz.ts`
- Create: `workers/reminder/src/reminders.ts`
- Create: `workers/reminder/src/push.ts`
- Create: `workers/reminder/src/index.ts`
- Test: `workers/reminder/src/__tests__/reminders.test.ts`

**Interfaces:**
- Consumes: `utcHourFor`, `localDateString` (reimplemented locally in `tz.ts` — the worker is a separate build with no path alias to the main app; keep the two copies identical in behavior, covered by the same test cases).
- Produces:
  - `tzOffsetHours(timezone: string, nowUtcMs: number): number`
  - `selectDueUsers(users: DueUserInput[], nowUtcHour: number, nowUtcMs: number): DueUserInput[]`
  - `runReminders(deps): Promise<{ sent: number; pruned: number }>`

The worker cannot import from the Next.js app (separate build, no bundler alias). It has its own small copies. `selectDueUsers` is pure and fully tested; the DB query + push send are injected as `deps` so `runReminders` is testable without network.

- [ ] **Step 1: Write worker package.json**

`workers/reminder/package.json`:

```json
{
  "name": "vocab-reminder",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.0",
    "web-push": "^3.6.7"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.90.0"
  }
}
```

Run: `cd workers/reminder && npm install`
Expected: installs without error. (Pin versions to the latest resolved at install time; the carets above are floors.)

- [ ] **Step 2: Write wrangler.toml + tsconfig**

`workers/reminder/wrangler.toml`:

```toml
name = "vocab-reminder"
main = "src/index.ts"
compatibility_date = "2025-06-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 * * * *"]

[[kv_namespaces]]
binding = "REMINDER_LOCKS"
id = "<create via: wrangler kv namespace create REMINDER_LOCKS>"
```

`workers/reminder/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

Run: `cd workers/reminder && npx wrangler kv namespace create REMINDER_LOCKS`
Expected: prints an `id`. Paste it into `wrangler.toml`.

- [ ] **Step 3: Write the failing selection test**

`workers/reminder/src/__tests__/reminders.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { tzOffsetHours, selectDueUsers, runReminders } from '../reminders'

describe('tzOffsetHours', () => {
  it('returns 8 for Asia/Taipei', () => {
    const ms = Date.UTC(2026, 6, 17, 0, 0)
    expect(tzOffsetHours('Asia/Taipei', ms)).toBe(8)
  })
})

const taipeiUser = {
  userId: 'u1',
  timezone: 'Asia/Taipei',
  reminderHour: 20,
  lastGoalDate: null as string | null,
  subscriptions: [{ endpoint: 'e', p256dh: 'k', auth: 'a' }],
}

describe('selectDueUsers', () => {
  // Taipei 20:00 local == 12:00 UTC. Pick 2026-07-17T12:00Z.
  const nowMs = Date.UTC(2026, 6, 17, 12, 0)

  it('includes a user whose local hour matches and who has not hit goal today', () => {
    const due = selectDueUsers([taipeiUser], 12, nowMs)
    expect(due.map((u) => u.userId)).toEqual(['u1'])
  })

  it('excludes a user at the wrong local hour', () => {
    const due = selectDueUsers([taipeiUser], 13, nowMs)
    expect(due).toEqual([])
  })

  it('excludes a user who already hit today’s goal (local date)', () => {
    const already = { ...taipeiUser, lastGoalDate: '2026-07-17' }
    const due = selectDueUsers([already], 12, nowMs)
    expect(due).toEqual([])
  })
})

describe('runReminders', () => {
  const nowMs = Date.UTC(2026, 6, 17, 12, 0)
  function deps(overrides = {}) {
    return {
      listDue: vi.fn(async () => [taipeiUser]),
      lockGet: vi.fn(async () => null),
      lockSet: vi.fn(async () => {}),
      send: vi.fn(async () => ({ status: 201 })),
      prune: vi.fn(async () => {}),
      nowUtcHour: 12,
      nowUtcMs: nowMs,
      ...overrides,
    }
  }

  it('sends one push and records the idempotency lock', async () => {
    const d = deps()
    const res = await runReminders(d as never)
    expect(d.send).toHaveBeenCalledTimes(1)
    expect(d.lockSet).toHaveBeenCalledWith('u1-2026-07-17')
    expect(res.sent).toBe(1)
  })

  it('skips a user already locked today', async () => {
    const d = deps({ lockGet: vi.fn(async () => '1') })
    const res = await runReminders(d as never)
    expect(d.send).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
  })

  it('prunes a subscription that returns 410 Gone', async () => {
    const d = deps({ send: vi.fn(async () => ({ status: 410 })) })
    await runReminders(d as never)
    expect(d.prune).toHaveBeenCalledWith('e')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd workers/reminder && npx vitest run`
Expected: FAIL — cannot find module `../reminders`.

- [ ] **Step 5: Write tz + reminders logic**

`workers/reminder/src/tz.ts`:

```typescript
// Offset (hours) from UTC for an IANA timezone at a given instant, via Intl.
export function tzOffsetHours(timeZone: string, nowUtcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(nowUtcMs))
  const map: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value)
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second)
  return Math.round((asUtc - nowUtcMs) / 3600_000)
}

export function localDateString(nowUtcMs: number, tzOffsetHours: number): string {
  const local = new Date(nowUtcMs + tzOffsetHours * 3600_000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

`workers/reminder/src/reminders.ts`:

```typescript
import { tzOffsetHours as tzOff, localDateString } from './tz'

export const tzOffsetHours = tzOff

export interface Sub { endpoint: string; p256dh: string; auth: string }
export interface DueUserInput {
  userId: string
  timezone: string
  reminderHour: number
  lastGoalDate: string | null
  subscriptions: Sub[]
}

// Pure: from the enabled+subscribed set, keep users whose local hour == now
// and who have not hit today's goal (compared in the user's local date).
export function selectDueUsers(
  users: DueUserInput[],
  nowUtcHour: number,
  nowUtcMs: number
): DueUserInput[] {
  return users.filter((u) => {
    const off = tzOff(u.timezone, nowUtcMs)
    const userUtcHour = ((u.reminderHour - off) % 24 + 24) % 24
    if (userUtcHour !== nowUtcHour) return false
    const today = localDateString(nowUtcMs, off)
    return u.lastGoalDate !== today
  })
}

export interface RunDeps {
  listDue(nowUtcHour: number): Promise<DueUserInput[]>
  lockGet(key: string): Promise<string | null>
  lockSet(key: string): Promise<void>
  send(sub: Sub): Promise<{ status: number }>
  prune(endpoint: string): Promise<void>
  nowUtcHour: number
  nowUtcMs: number
}

export async function runReminders(deps: RunDeps): Promise<{ sent: number; pruned: number }> {
  const candidates = await deps.listDue(deps.nowUtcHour)
  const due = selectDueUsers(candidates, deps.nowUtcHour, deps.nowUtcMs)
  let sent = 0
  let pruned = 0
  for (const u of due) {
    const off = tzOff(u.timezone, deps.nowUtcMs)
    const key = `${u.userId}-${localDateString(deps.nowUtcMs, off)}`
    if (await deps.lockGet(key)) continue
    let delivered = false
    for (const sub of u.subscriptions) {
      const res = await deps.send(sub)
      if (res.status === 410 || res.status === 404) {
        await deps.prune(sub.endpoint)
        pruned++
      } else if (res.status >= 200 && res.status < 300) {
        delivered = true
      }
    }
    if (delivered) {
      await deps.lockSet(key)
      sent++
    }
  }
  return { sent, pruned }
}
```

- [ ] **Step 6: Run test to verify selection passes**

Run: `cd workers/reminder && npx vitest run`
Expected: PASS (all reminders tests).

- [ ] **Step 7: Write the push sender**

`workers/reminder/src/push.ts`:

```typescript
import webpush from 'web-push'
import type { Sub } from './reminders'

export interface Vapid { publicKey: string; privateKey: string; subject: string }

const PAYLOAD = JSON.stringify({
  title: '該背單字了 🦊',
  body: '今天還沒達標，來 5 分鐘',
  url: '/learn',
})

// Returns the HTTP status from the push service (201 ok, 410/404 = gone).
export async function sendPush(sub: Sub, vapid: Vapid): Promise<{ status: number }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      PAYLOAD
    )
    return { status: res.statusCode }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status) return { status }
    throw e
  }
}
```

Note: if `web-push` fails at runtime on Workers (node crypto incompatibility — the spec's flagged first verification point), replace `push.ts` with a `crypto.subtle` VAPID-JWT implementation. Confirm via `npx wrangler dev` + `curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"` before deploying. Keep the `sendPush(sub, vapid) => { status }` signature identical so `index.ts` is unaffected.

- [ ] **Step 8: Write the worker entry + DB query**

`workers/reminder/src/index.ts`:

```typescript
import { neon } from '@neondatabase/serverless'
import { runReminders, type DueUserInput } from './reminders'
import { sendPush } from './push'

interface Env {
  DATABASE_URL: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  REMINDER_LOCKS: KVNamespace
}

async function listDue(sql: ReturnType<typeof neon>): Promise<DueUserInput[]> {
  // Enabled users with >=1 subscription; hour/goal filtering done in JS
  // (selectDueUsers) because tz offset needs Intl.
  const rows = (await sql`
    SELECT u.id, u.timezone, u."reminderHour",
           g."lastGoalDate" AS "lastGoalDate",
           s.endpoint, s.p256dh, s.auth
    FROM "User" u
    JOIN "PushSubscription" s ON s."userId" = u.id
    LEFT JOIN "GamificationState" g ON g."userId" = u.id
    WHERE u."reminderEnabled" = true
  `) as Array<{
    id: string; timezone: string; reminderHour: number; lastGoalDate: string | null
    endpoint: string; p256dh: string; auth: string
  }>

  const byUser = new Map<string, DueUserInput>()
  for (const r of rows) {
    let u = byUser.get(r.id)
    if (!u) {
      u = { userId: r.id, timezone: r.timezone, reminderHour: r.reminderHour, lastGoalDate: r.lastGoalDate, subscriptions: [] }
      byUser.set(r.id, u)
    }
    u.subscriptions.push({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth })
  }
  return [...byUser.values()]
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const sql = neon(env.DATABASE_URL)
    const nowUtcMs = controller.scheduledTime
    const nowUtcHour = new Date(nowUtcMs).getUTCHours()
    const vapid = {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    }
    ctx.waitUntil(
      runReminders({
        listDue: () => listDue(sql),
        lockGet: (k) => env.REMINDER_LOCKS.get(k),
        lockSet: async (k) => { await env.REMINDER_LOCKS.put(k, '1', { expirationTtl: 86_400 }) },
        send: (sub) => sendPush(sub, vapid),
        prune: async (endpoint) => { await sql`DELETE FROM "PushSubscription" WHERE endpoint = ${endpoint}` },
        nowUtcHour,
        nowUtcMs,
      }).then((r) => console.log('reminders', r)).catch((e) => console.error('reminders failed', e))
    )
  },
}
```

- [ ] **Step 9: Typecheck the worker**

Run: `cd workers/reminder && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 10: Local scheduled smoke test**

Run: `cd workers/reminder && npx wrangler dev` (in one shell), then in another:
`curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"`
Expected: worker logs `reminders { sent, pruned }` with no crash. (Needs `.dev.vars` populated from Task 8. If `web-push` throws a crypto error here, switch to the `crypto.subtle` fallback noted in Step 7.)

- [ ] **Step 11: Commit**

```bash
git add workers/reminder
git commit -m "feat(push): reminder cron worker (select due + send + prune)"
```

---

### Task 10: Deploy + end-to-end verification

**Files:** none (deploy + manual verify).

- [ ] **Step 1: Run the full main-app test suite**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 2: Deploy the main app**

Push to `master` (existing GitHub Actions auto-deploys to Cloudflare). Confirm the run succeeds and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set in the main-app environment.

Run: `gh run list --limit 1`
Expected: latest Deploy run `success`, headSha == current `master`.

- [ ] **Step 3: Set worker secrets + deploy worker**

Run:
```bash
cd workers/reminder
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put DATABASE_URL
npx wrangler deploy
```
Expected: deploy succeeds; dashboard shows cron trigger `0 * * * *`.

- [ ] **Step 4: Manual E2E on device**

On an installed PWA (iOS: added to home screen): Settings → enable 每日提醒, pick the current local hour, save → allow the permission prompt. Confirm a `PushSubscription` row exists (Neon console). At the top of that UTC hour (or trigger once via a temporary `*/2 * * * *` cron in a throwaway deploy, then revert), confirm the notification arrives and tapping it opens `/learn`.

- [ ] **Step 5: Revert any temporary cron + final commit**

Ensure `crons = ["0 * * * *"]`, redeploy if changed. No code commit needed unless the `web-push` fallback was used (already committed in Task 9).

---

## Self-Review

**Spec coverage:**
- §1 architecture (main app stores subs + prefs, standalone cron worker) → Tasks 4, 5, 9. ✅
- §2 data model (`PushSubscription`, `reminderEnabled`/`reminderHour`, reuse `timezone`/`lastGoalDate`, endpoint-unique upsert, idempotency KV) → Tasks 1, 3, 9. ✅
- §3 worker + cron (hourly UTC, `utcHourFor`, `selectDueUsers`, `runReminders`, 410/404 prune, VAPID) → Tasks 2, 9. ✅
- Main-app subscribe/unsubscribe/settings/sw → Tasks 4, 6, 7. ✅
- VAPID key + fallback note → Tasks 8, 9 (Step 7). ✅
- Known limits (iOS install-first, DST, web-push compat) → surfaced in Tasks 6 (UI copy), 9 (Step 7 fallback), README (Task 8). ✅

**Placeholder scan:** No TBD/TODO; all code shown; the only external values (VAPID keys, KV id) are generated by explicit commands in Tasks 8/9. ✅

**Type consistency:** `PushSubscriptionData` / `Sub` (endpoint/p256dh/auth) consistent across repo, handler, worker. `DueUser` (main app) vs `DueUserInput` (worker, adds reminderHour + lastGoalDate) intentionally distinct — worker query supplies the extra fields. `sendPush(sub, vapid) => { status }` and `runReminders(deps) => { sent, pruned }` match their call sites. `utcHourFor` logic duplicated in `lib/push/time.ts` and `workers/reminder/src/reminders.ts` by necessity (separate builds); both covered by identical test cases. ✅
