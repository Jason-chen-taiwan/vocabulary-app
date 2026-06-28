import { getCurrentUser } from '@/lib/auth/session'
import { GamificationRepository } from '@/lib/gamification/repository'

// 伺服器元件：顯示 🔥streak · Lv.N · 🪙coins。無登入或尚無狀態則顯示初始值。
export async function GamificationBar() {
  const user = await getCurrentUser()
  if (!user) return null
  let streak = 0
  let level = 1
  let coins = 0
  try {
    const { state } = await new GamificationRepository().getContext(user.id)
    if (state) {
      streak = state.streak
      level = state.level
      coins = state.coinBalance
    }
  } catch {
    // 取不到狀態時用初始值，不阻斷頁面
  }
  return (
    <div className="flex items-center justify-center gap-4 border-b border-gray-800 py-2 text-sm">
      <span title="連續達標天數">🔥 {streak}</span>
      <span title="等級">Lv.{level}</span>
      <span title="金幣">🪙 {coins}</span>
    </div>
  )
}
