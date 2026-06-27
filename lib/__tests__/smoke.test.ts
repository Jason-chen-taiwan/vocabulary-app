import { describe, it, expect } from 'vitest'
import { appName } from '@/lib/meta'

describe('smoke', () => {
  it('exposes the app name', () => {
    expect(appName()).toBe('VocabApp')
  })
})
