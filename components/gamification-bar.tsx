import { getCurrentUser } from '@/lib/auth/session'
import { GamificationRepository } from '@/lib/gamification/repository'
import { StatPill } from '@/components/ui/stat-pill'

// 伺服器元件：🔥streak · Lv.N(本級進度) · 🪙coins。無登入/無狀態顯示初始值。
export async function GamificationBar() {
  const user = await getCurrentUser()
  if (!user) return null
  let streak = 0, level = 1, coins = 0, xp = 0
  try {
    const { state } = await new GamificationRepository().getContext(user.id)
    if (state) { streak = state.streak; level = state.level; coins = state.coinBalance; xp = state.xp }
  } catch {
    // 取不到狀態用初始值，不阻斷頁面
  }
  const levelPct = xp % 100
  return (
    <div className="sticky top-0 z-10 border-b border-primary-100 bg-bg-warm/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 px-4 py-2">
        <StatPill icon="🔥" value={streak} label="連續達標天數" />
        <span className="inline-flex items-center gap-2 rounded-pill bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-600">
          Lv.{level}
          <span className="h-1.5 w-10 overflow-hidden rounded-pill bg-primary-300/50">
            <span className="block h-full rounded-pill bg-primary-500" style={{ width: `${levelPct}%` }} />
          </span>
        </span>
        <StatPill icon="🪙" value={coins} label="金幣" />
      </div>
    </div>
  )
}
