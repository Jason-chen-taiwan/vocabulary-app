'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateSettingsAction } from './actions'

export function SettingsForm({
  initialName,
  initialOptIn,
}: {
  initialName: string
  initialOptIn: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [optIn, setOptIn] = useState(initialOptIn)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setBusy(true)
    setSaved(false)
    try {
      await updateSettingsAction(name, optIn)
      setSaved(true)
      router.refresh()
    } catch {
      /* ignore */
    }
    setBusy(false)
  }

  return (
    <Card className="space-y-4 p-5">
      <label className="block">
        <span className="text-sm font-semibold text-neutral-600">排行榜暱稱</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="mt-1 w-full rounded-control border-2 border-primary-200 bg-surface px-3 py-2 text-neutral-900 focus:border-primary-500 focus:outline-none"
          placeholder="顯示在排行榜上的名稱"
        />
      </label>
      <label className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">出現在排行榜</span>
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="h-5 w-5 accent-primary-500"
        />
      </label>
      <Button onClick={save} disabled={busy} fullWidth>
        {busy ? '儲存中…' : '儲存'}
      </Button>
      {saved && <p className="text-sm text-success">已儲存</p>}
    </Card>
  )
}
