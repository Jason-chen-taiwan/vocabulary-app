import { describe, it, expect } from 'vitest'
import { listPassages, getPassageBySlug, toPassagePayload, answerKey } from '../static'

describe('static passages', () => {
  it('loads every passage file', () => {
    expect(listPassages().length).toBeGreaterThanOrEqual(37)
  })

  it('gives each passage a stable slug-based id', () => {
    const p = listPassages()[0]
    expect(p.id).toBe(p.slug)
  })

  it('returns null for an unknown slug', () => {
    expect(getPassageBySlug('does-not-exist')).toBeNull()
  })

  it('lists toeic passages before stories', () => {
    const kinds = listPassages().map((p) => p.kind)
    const lastToeic = kinds.lastIndexOf('toeic')
    const firstStory = kinds.indexOf('story')
    if (firstStory !== -1 && lastToeic !== -1) expect(lastToeic).toBeLessThan(firstStory)
  })
})

describe('curated glossary resolution', () => {
  // seed-passages.mjs 原本在進 DB 時做這件事；靜態版改在載入時做，這裡守住它。
  it('replaces every curated flag with a real wordId', () => {
    for (const item of listPassages()) {
      const p = getPassageBySlug(item.slug)!
      for (const [lemma, e] of Object.entries(p.glossary)) {
        expect(e.curated, `${item.slug}:${lemma} 仍留著 curated 旗標`).toBeUndefined()
      }
    }
  })

  it('overrides the ECDICT gloss with the curated definition', () => {
    // ECDICT 首義常選錯詞義（net → 網），精修定義才正確
    const withNet = listPassages()
      .map((i) => getPassageBySlug(i.slug)!)
      .find((p) => p.glossary['net']?.wordId)
    if (withNet) expect(withNet.glossary['net'].zh).not.toBe('網')
  })
})

describe('toPassagePayload', () => {
  it('strips answers from the client payload', () => {
    const p = getPassageBySlug(listPassages().find((x) => x.questionCount > 0)!.slug)!
    const payload = toPassagePayload(p)
    for (const q of payload.questions) {
      expect((q as unknown as { answer?: number }).answer).toBeUndefined()
    }
  })

  it('exposes the answer key separately for local grading', () => {
    const item = listPassages().find((x) => x.questionCount > 0)!
    const key = answerKey(item.slug)
    expect(key).toHaveLength(item.questionCount)
    expect(key.every((a) => a >= 0 && a <= 3)).toBe(true)
  })

  it('returns an empty key for an unknown slug', () => {
    expect(answerKey('nope')).toEqual([])
  })
})
