// 商店品項設定資料。新增品項＝往 CATALOG 加一筆，程式不動（CLAUDE.md 準則 4）。
// 純函式，無 I/O。
export type Slot = 'head' | 'face' | 'neck'
export const SLOTS: readonly Slot[] = ['head', 'face', 'neck']

export type ConsumableItem = {
  key: string; kind: 'consumable'; effect: 'freeze'; name: string; desc: string; cost: number
}
export type AccessoryItem = {
  key: string; kind: 'accessory'; slot: Slot; name: string; desc: string; cost: number
}
export type ShopItem = ConsumableItem | AccessoryItem

export const CATALOG: readonly ShopItem[] = [
  { key: 'freeze_refill', kind: 'consumable', effect: 'freeze', name: '凍結補充', desc: '+1 連續達標凍結（上限 3）', cost: 120 },
  { key: 'hat_party',     kind: 'accessory', slot: 'head', name: '派對帽',   desc: '慶祝感十足的尖頂帽', cost: 150 },
  { key: 'hat_grad',      kind: 'accessory', slot: 'head', name: '學士帽',   desc: '學霸象徵',           cost: 250 },
  { key: 'glasses_round', kind: 'accessory', slot: 'face', name: '圓框眼鏡', desc: '文青風圓框',         cost: 150 },
  { key: 'glasses_star',  kind: 'accessory', slot: 'face', name: '星星墨鏡', desc: '派對明星',           cost: 300 },
  { key: 'scarf_orange',  kind: 'accessory', slot: 'neck', name: '橙圍巾',   desc: '溫暖的橙色圍巾',     cost: 150 },
  { key: 'bowtie',        kind: 'accessory', slot: 'neck', name: '領結',     desc: '正式場合首選',       cost: 200 },
]

export function itemByKey(key: string): ShopItem | undefined {
  return CATALOG.find((i) => i.key === key)
}

export function isAccessory(i: ShopItem): i is AccessoryItem {
  return i.kind === 'accessory'
}

export function accessoriesBySlot(slot: Slot): AccessoryItem[] {
  return CATALOG.filter((i): i is AccessoryItem => isAccessory(i) && i.slot === slot)
}
