// 純日期工具：以使用者時區決定「今天」，並計算 YYYY-MM-DD 字串間天數差。
// 不依賴系統當下時間以外的隱含狀態，方便測試。
export function todayYmd(now: Date, timezone: string): string {
  // en-CA locale 產出 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// 回傳「now 在該時區當週的週一」YYYY-MM-DD。
export function weekStartYmd(now: Date, timezone: string): string {
  const today = todayYmd(now, timezone)
  const d = new Date(`${today}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1 // 距週一的天數
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`)
  const to = Date.parse(`${toYmd}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}
