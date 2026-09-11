import type { MetadataRoute } from 'next'
import { listWordBooks } from '@/lib/content/static'
import { SITE_URL } from '@/lib/seo/site'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/books`, priority: 0.8 },
    ...listWordBooks().map((b) => ({ url: `${SITE_URL}/books/${b.slug}`, priority: 0.6 })),
  ]
}
