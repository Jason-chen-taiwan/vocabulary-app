import { describe, it, expect } from 'vitest'
import { SITE_URL, buildSitemapEntries } from '@/lib/seo/site'

describe('buildSitemapEntries', () => {
  it('首頁 priority 1，單字頁 0.6 並做 URL encode', () => {
    const entries = buildSitemapEntries(['invoice', 'e-mail'])
    expect(entries[0]).toEqual({ url: `${SITE_URL}/`, priority: 1 })
    expect(entries).toContainEqual({ url: `${SITE_URL}/word/invoice`, priority: 0.6 })
    expect(entries).toContainEqual({ url: `${SITE_URL}/word/e-mail`, priority: 0.6 })
    expect(entries).toHaveLength(3)
  })

  it('無單字時仍含首頁', () => {
    expect(buildSitemapEntries([])).toEqual([{ url: `${SITE_URL}/`, priority: 1 }])
  })
})
