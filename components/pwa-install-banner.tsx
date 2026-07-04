'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Mascot } from '@/components/ui/mascot'
import { DISMISS_KEY, isIOS, isInStandalone, installBannerState, type InstallBannerState } from '@/lib/pwa/install'

// beforeinstallprompt 尚非標準 lib.dom 型別，最小宣告。
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// 由 app/layout.tsx 的 beforeInteractive inline script 早一步攔下並存於 window。
declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null
    __pwaInstalled?: boolean
  }
}

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showIosSteps, setShowIosSteps] = useState(false)
  const [env, setEnv] = useState<{ ios: boolean; inStandalone: boolean } | null>(null)

  useEffect(() => {
    try {
      const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
      const navigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone
      setEnv({
        ios: isIOS(window.navigator.userAgent),
        inStandalone: isInStandalone({ displayModeStandalone, navigatorStandalone }),
      })
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      // 隱私模式等存取失敗：維持 env=null → 不顯示。
    }

    // 早捕捉：inline <head> script 可能已在 hydration 前攔到事件，存於 window。
    if (window.__deferredInstallPrompt) setDeferred(window.__deferredInstallPrompt)
    if (window.__pwaInstalled) setInstalled(true)

    const onCaptured = () => {
      if (window.__deferredInstallPrompt) setDeferred(window.__deferredInstallPrompt)
    }
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('pwa-bip-captured', onCaptured)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('pwa-bip-captured', onCaptured)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!env || installed) return null

  const state: InstallBannerState = installBannerState({
    inStandalone: env.inStandalone,
    dismissed,
    canPrompt: deferred !== null,
    ios: env.ios,
  })
  if (state === 'hidden') return null

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  const install = async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch { /* ignore */ }
    setDeferred(null) // prompt 只能用一次
    window.__deferredInstallPrompt = null
  }

  return (
    <Card className="flex w-full items-center gap-3 p-4">
      <Mascot mood="hi" size={48} />
      <div className="flex-1">
        <p className="text-sm font-extrabold text-neutral-900">把 App 裝到主畫面</p>
        {state === 'prompt' && <p className="text-xs text-neutral-600">離線也能背，開啟更快。</p>}
        {state === 'ios-hint' && (
          <>
            <button
              onClick={() => setShowIosSteps((v) => !v)}
              className="text-xs font-semibold text-primary-600 hover:underline"
            >
              iPhone / iPad 怎麼裝？
            </button>
            {showIosSteps && (
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-neutral-600">
                <li>點下方工具列的「分享」<span aria-hidden> ⬆️</span></li>
                <li>捲動選單，點「加入主畫面」</li>
                <li>右上角點「加入」</li>
              </ol>
            )}
          </>
        )}
      </div>
      {state === 'prompt' && <Button variant="primary" onClick={install}>安裝</Button>}
      <button onClick={close} aria-label="關閉安裝提示" className="self-start text-neutral-600 hover:text-neutral-900">
        ✕
      </button>
    </Card>
  )
}
