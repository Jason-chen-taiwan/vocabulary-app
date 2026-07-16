import type { ShareCardContent } from './card-data'

// 1080x1350（IG 直式 4:5）。純繪製：所有文案來自 content，不做任何邏輯。
export const CARD_W = 1080
export const CARD_H = 1350

const ORANGE = '#FF6A3D'
const CREAM = '#FFF7F2'
const INK = '#1A1A1A'
const GREY = '#555555'
const FONT = '"Nunito", "Noto Sans TC", sans-serif'

export function drawShareCard(canvas: HTMLCanvasElement, content: ShareCardContent, mascot: HTMLImageElement | null): void {
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = ORANGE
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 內卡
  const pad = 48
  ctx.fillStyle = CREAM
  roundRect(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 40)
  ctx.fill()

  ctx.textAlign = 'center'

  // 狐狸（icon-source.svg 為方形，等比置頂）
  if (mascot) ctx.drawImage(mascot, CARD_W / 2 - 160, 110, 320, 320)

  // 標題（過長自動縮字級）
  ctx.fillStyle = INK
  let size = 64
  ctx.font = `800 ${size}px ${FONT}`
  while (ctx.measureText(content.headline).width > CARD_W - pad * 4 && size > 36) {
    size -= 4
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.fillText(content.headline, CARD_W / 2, 540)

  // 數據列
  let y = 680
  for (const line of content.lines) {
    ctx.font = `700 44px ${FONT}`
    ctx.fillStyle = GREY
    ctx.textAlign = 'left'
    ctx.fillText(line.label, pad + 80, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = `800 52px ${FONT}`
    ctx.fillText(line.value, CARD_W - pad - 80, y)
    y += 120
  }

  // 日期 + footer
  ctx.textAlign = 'center'
  ctx.fillStyle = GREY
  ctx.font = `600 36px ${FONT}`
  ctx.fillText(content.dateLabel, CARD_W / 2, 1140)
  ctx.fillStyle = ORANGE
  ctx.font = `800 44px ${FONT}`
  ctx.fillText(content.footer, CARD_W / 2, 1230)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
