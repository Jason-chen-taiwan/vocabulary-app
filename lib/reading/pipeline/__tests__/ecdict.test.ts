import { describe, it, expect } from 'vitest'
import { parseCsvLine, buildDictIndex, glossFromTranslation } from '@/lib/reading/pipeline/ecdict'

const id = (s: string) => s

describe('parseCsvLine', () => {
  it('處理引號欄位與內嵌逗號/雙引號', () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
    expect(parseCsvLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c'])
  })
})

describe('buildDictIndex', () => {
  it('只收 needed 內的字（省記憶體），欄位對映 word/pos/translation', () => {
    // ECDICT 欄序：word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
    const csv = [
      'word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio',
      'run,rʌn,to move fast,"v. 跑, 奔跑\\nn. 跑步",v:80/n:20,3,1,cet4,100,120,,,',
      'skip,skɪp,to jump,跳过,,,,,,,,,',
    ].join('\n')
    const idx = buildDictIndex(csv, new Set(['run']))
    expect(idx.has('skip')).toBe(false)
    expect(idx.get('run')?.translation).toBe('v. 跑, 奔跑\\nn. 跑步')
  })
})

describe('glossFromTranslation', () => {
  it('取第一義、剝詞性前綴為 pos、在逗號截為短對譯，經繁化函式輸出', () => {
    expect(glossFromTranslation('v. 跑, 奔跑\\nn. 跑步', id)).toEqual({ zh: '跑', pos: 'v.' })
  })
  it('無詞性前綴也可', () => {
    expect(glossFromTranslation('跳过', id)).toEqual({ zh: '跳过' })
  })
  it('空翻譯回 null', () => {
    expect(glossFromTranslation('', id)).toBeNull()
  })
})
