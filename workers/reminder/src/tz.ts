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
