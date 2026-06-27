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
      className="rounded-md border border-gray-600 px-2 py-1 text-sm hover:bg-gray-800 disabled:opacity-40"
    >
      🔊 發音
    </button>
  )
}
