'use client'
import { useEffect, useState } from 'react'
import { buildUtterance } from '@/lib/content/tts'

export function TtsButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)
  }, [])

  function speak() {
    const cfg = buildUtterance(text)
    const u = new SpeechSynthesisUtterance(cfg.text)
    u.lang = cfg.lang
    u.rate = cfg.rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  return (
    <button
      type="button"
      onClick={speak}
      disabled={!supported}
      aria-label={`播放「${text}」的發音`}
      className="inline-flex min-h-9 items-center gap-1 rounded-pill border-2 border-primary-200 bg-surface px-3 py-1 text-sm font-bold text-primary-600 transition hover:bg-primary-50 disabled:opacity-40"
    >
      🔊 發音
    </button>
  )
}
