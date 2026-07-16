import type { MetadataRoute } from 'next'
import { ContentRepository } from '@/lib/content/repository'
import { buildSitemapEntries } from '@/lib/seo/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let headwords: string[] = []
  try { headwords = await new ContentRepository().listAllHeadwords() } catch { /* DB 掛了至少回首頁 */ }
  return buildSitemapEntries(headwords)
}
