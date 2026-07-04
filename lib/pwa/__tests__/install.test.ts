import { describe, it, expect } from 'vitest'
import { isIOS, isInStandalone, installBannerState, DISMISS_KEY } from '@/lib/pwa/install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120'
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'

describe('isIOS', () => {
  it('detects iPhone/iPad/iPod', () => {
    expect(isIOS(IPHONE)).toBe(true)
    expect(isIOS(IPAD)).toBe(true)
    expect(isIOS('... iPod ...')).toBe(true)
  })
  it('is false for Android and desktop Chrome', () => {
    expect(isIOS(ANDROID)).toBe(false)
    expect(isIOS(WIN_CHROME)).toBe(false)
  })
})

describe('isInStandalone', () => {
  it('true when display-mode standalone', () => {
    expect(isInStandalone({ displayModeStandalone: true })).toBe(true)
  })
  it('true when navigator.standalone (iOS)', () => {
    expect(isInStandalone({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true)
  })
  it('false when neither', () => {
    expect(isInStandalone({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false)
    expect(isInStandalone({ displayModeStandalone: false })).toBe(false)
  })
})

describe('installBannerState', () => {
  const base = { inStandalone: false, dismissed: false, canPrompt: false, ios: false }
  it('hidden when already installed, even if promptable', () => {
    expect(installBannerState({ ...base, inStandalone: true, canPrompt: true })).toBe('hidden')
  })
  it('hidden when dismissed', () => {
    expect(installBannerState({ ...base, dismissed: true, canPrompt: true })).toBe('hidden')
  })
  it('prompt when a beforeinstallprompt event is available', () => {
    expect(installBannerState({ ...base, canPrompt: true })).toBe('prompt')
  })
  it('ios-hint on iOS with no prompt event, not installed, not dismissed', () => {
    expect(installBannerState({ ...base, ios: true })).toBe('ios-hint')
  })
  it('hidden on non-iOS with no prompt event (e.g. Firefox desktop)', () => {
    expect(installBannerState({ ...base })).toBe('hidden')
  })
})

describe('DISMISS_KEY', () => {
  it('is a stable localStorage key', () => {
    expect(DISMISS_KEY).toBe('pwa-install-dismissed')
  })
})
