import type { MetadataRoute } from 'next'
import { ContentRepository } from '@/lib/content/repository'
import { buildSitemapEntries } from '@/lib/seo/site'

// build 環境的 Prisma(wasm) 跑不起來，靜態預渲染會烤出只有首頁的 sitemap；
// 強制在 Workers runtime 產生（那裡 DB 一定可用）。
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let headwords: string[] = []
  try {
    headwords = await new ContentRepository().listAllHeadwords()
  } catch (err) {
    console.error('[sitemap] listAllHeadwords failed, serving homepage-only sitemap:', err)
  }
  return buildSitemapEntries(headwords)
}
