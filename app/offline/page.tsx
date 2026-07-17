import { OfflineHome } from '@/components/offline-home'

// 靜態頁：不碰 auth 與 DB，build 時預渲染，SW 預快取後當離線 navigation fallback。
export const dynamic = 'force-static'

export default function OfflinePage() {
  return <OfflineHome />
}
