import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { shopService } from '@/lib/shop/service'
import { ShopRepository } from '@/lib/shop/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { ShopClient } from './shop-client'

export default async function ShopPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new ShopRepository()
  const [view, equipped] = await Promise.all([
    shopService.getShopView(user.id),
    repo.getEquipped(user.id),
  ])
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
        <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">商店</h1>
        <ShopClient view={view} equipped={equipped} />
      </main>
    </>
  )
}
