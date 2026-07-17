'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateReminderAction } from './reminder-actions'

// VAPID public key must be url-base64 decoded to a Uint8Array for PushManager.
function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function subscribeBrowser(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return false
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(key).buffer as ArrayBuffer,
  })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(json),
  })
  return res.ok
}

async function unsubscribeBrowser(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  await sub.unsubscribe()
}

export function ReminderForm({
  initialEnabled,
  initialHour,
}: {
  initialEnabled: boolean
  initialHour: number
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [hour, setHour] = useState(initialHour)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      if (enabled) {
        const ok = await subscribeBrowser()
        if (!ok) {
          setMsg('無法開啟通知（需允許權限，iOS 需先把 App 加到主畫面）')
          setBusy(false)
          return
        }
      } else {
        await unsubscribeBrowser()
      }
      await updateReminderAction(enabled, hour)
      setMsg('已儲存')
      router.refresh()
    } catch {
      setMsg('儲存失敗')
    }
    setBusy(false)
  }

  return (
    <Card className="mt-4 space-y-4 p-5">
      <label className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">每日提醒</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 accent-primary-500"
        />
      </label>
      <label className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">提醒時間</span>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          disabled={!enabled}
          className="rounded-control border-2 border-primary-200 bg-surface px-3 py-1.5 text-neutral-900 focus:border-primary-500 focus:outline-none disabled:opacity-50"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </label>
      <Button onClick={save} disabled={busy} fullWidth>
        {busy ? '儲存中…' : '儲存'}
      </Button>
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
    </Card>
  )
}
