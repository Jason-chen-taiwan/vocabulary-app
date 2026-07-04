// 安裝橫幅的決策純函式。install 狀態是裝置/瀏覽器本地，不經後端（見 spec 誠實記錄）。

export const DISMISS_KEY = 'pwa-install-dismissed'

export type InstallBannerState = 'hidden' | 'prompt' | 'ios-hint'

// 由 user-agent 判斷 iOS（iPhone/iPad/iPod）。
// 已知限制：iPadOS 13+ Safari 桌面版 UA 會回報 Macintosh，此情況回 false。
export function isIOS(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua)
}

// 是否已以 App（standalone）開啟。呼叫端把瀏覽器值傳入，函式保持純。
export function isInStandalone(opts: { displayModeStandalone: boolean; navigatorStandalone?: boolean }): boolean {
  return opts.displayModeStandalone || opts.navigatorStandalone === true
}

// 集中決策：已裝或已關 → hidden；可自動安裝 → prompt；iOS 無事件 → ios-hint；其餘 → hidden。
export function installBannerState(input: {
  inStandalone: boolean
  dismissed: boolean
  canPrompt: boolean
  ios: boolean
}): InstallBannerState {
  if (input.inStandalone || input.dismissed) return 'hidden'
  if (input.canPrompt) return 'prompt'
  if (input.ios) return 'ios-hint'
  return 'hidden'
}
