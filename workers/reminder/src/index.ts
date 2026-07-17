import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { runReminders, type DueUserInput } from './reminders'
import { sendPush } from './push'

interface Env {
  DATABASE_URL: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  REMINDER_LOCKS: KVNamespace
}

// ponytail: cast to any-mode neon fn to avoid deep generic variance mismatch
type Sql = NeonQueryFunction<false, false>

async function listDue(sql: Sql): Promise<DueUserInput[]> {
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
    const sql: Sql = neon(env.DATABASE_URL)
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
