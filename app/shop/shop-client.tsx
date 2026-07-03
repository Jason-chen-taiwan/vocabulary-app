'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mascot } from '@/components/ui/mascot'
import { purchaseAction, equipAction } from './actions'
import type { ShopView } from '@/lib/shop/service'
import type { Equipped } from '@/lib/shop/repository'
import type { Slot } from '@/lib/shop/catalog'

function reasonText(reason: string): string {
  switch (reason) {
    case 'insufficient': return '硬幣不足'
    case 'freeze_full': return '凍結已達上限'
    case 'unknown_item': return '找不到品項'
    case 'unauthorized': return '請先登入'
    case 'not_owned': return '尚未擁有'
    case 'wrong_slot': return '槽位不符'
    default: return '操作失敗'
  }
}

export function ShopClient({ view, equipped }: { view: ShopView; equipped: Equipped }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function buy(key: string) {
    setBusy(true); setMsg(null)
    const r = await purchaseAction(key)
    setMsg(r.ok ? (r.alreadyOwned ? '已擁有' : '購買成功！') : reasonText(r.reason))
    router.refresh()
    setBusy(false)
  }

  async function toggleEquip(slot: Slot, key: string, isEquipped: boolean) {
    setBusy(true); setMsg(null)
    await equipAction(slot, isEquipped ? null : key)
    router.refresh()
    setBusy(false)
  }

  const consumables = view.items.filter((i) => i.item.kind === 'consumable')
  const accessories = view.items.filter((i) => i.item.kind === 'accessory')

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4 p-5">
        <Mascot mood="hi" size={96} equipped={equipped} />
        <div>
          <div className="text-2xl font-extrabold text-primary-600">🪙 {view.coinBalance}</div>
          <div className="text-xs font-semibold text-neutral-600">凍結 {view.streakFreezes}/{view.freezeCap}</div>
        </div>
      </Card>

      {msg && <p className="text-sm font-semibold text-primary-600">{msg}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-neutral-900">凍結</h2>
        {consumables.map(({ item, affordable }) => {
          const full = view.streakFreezes >= view.freezeCap
          return (
            <Card key={item.key} className="flex items-center justify-between p-4">
              <div>
                <div className="font-bold text-neutral-900">{item.name}</div>
                <div className="text-xs text-neutral-600">{item.desc}</div>
              </div>
              <Button onClick={() => buy(item.key)} disabled={busy || full || !affordable}>
                {full ? '已滿' : `🪙 ${item.cost}`}
              </Button>
            </Card>
          )
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-extrabold text-neutral-900">小橙狐配件</h2>
        {accessories.map(({ item, owned, equipped: isEquipped, affordable }) => {
          const slot = item.kind === 'accessory' ? item.slot : 'head'
          return (
            <Card key={item.key} className="flex items-center justify-between p-4">
              <div>
                <div className="font-bold text-neutral-900">{item.name} <span className="text-xs font-normal text-neutral-600">（{slot}）</span></div>
                <div className="text-xs text-neutral-600">{item.desc}</div>
              </div>
              {owned ? (
                <Button variant="secondary" onClick={() => toggleEquip(slot as Slot, item.key, isEquipped)} disabled={busy}>
                  {isEquipped ? '卸下' : '裝備'}
                </Button>
              ) : (
                <Button onClick={() => buy(item.key)} disabled={busy || !affordable}>🪙 {item.cost}</Button>
              )}
            </Card>
          )
        })}
      </section>
    </div>
  )
}
