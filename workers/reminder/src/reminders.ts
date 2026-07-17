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
