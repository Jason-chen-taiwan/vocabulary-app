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
