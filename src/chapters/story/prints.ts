import * as THREE from 'three'
import { rng } from '../../core/math'
import { FONT, tile } from '../../kit/materials'

/*
 * THE CASE · prints. Every printed or hand-written surface in the guitar case
 * is a small canvas tile, drawn once (kit tile(): cached, the canvas freed on
 * upload). Designs are generic and our own — no album art, no logos: the
 * words on them are the band's own facts (content.ts STORY) or plainly
 * decorative (a staff of practice notes, "ADMIT ONE", a road map's roads).
 * Each drawer works in a fixed design space (w × h below) and is scaled to the
 * tile's real size (half on phones).
 */

type Ctx = CanvasRenderingContext2D

const INK = '#1d2233' // ballpoint blue-black
const MARKER = '#1a1512'
const PENCIL = 'rgba(70, 64, 58, 0.78)'
const RED = '#a8321f'

/** a canvas tile drawn in a W×H design space, at `scale` resolution */
function print(key: string, W: number, H: number, scale: number, draw: (g: Ctx, W: number, H: number) => void, opts?: { repeat?: boolean }) {
  const w = Math.round(W * scale)
  const h = Math.round(H * scale)
  return tile(
    `story-${key}-${w}`,
    w,
    h,
    g => {
      g.save()
      g.scale(w / W, h / H)
      draw(g, W, H)
      g.restore()
    },
    { repeat: opts?.repeat ?? false },
  )
}

/** paper stock: a base tone, fibres and mottling, edges browned with age */
function paper(g: Ctx, W: number, H: number, base: [number, number, number], seed: number, age = 0.22) {
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  g.fillRect(0, 0, W, H)
  const r = rng(seed)
  const n = Math.round((W * H) / 70)
  for (let i = 0; i < n; i++) {
    const d = r() < 0.5
    g.fillStyle = d ? `rgba(110,80,40,${r() * 0.05})` : `rgba(255,255,250,${r() * 0.06})`
    g.fillRect(r() * W, r() * H, 1 + r() * 4, 0.6 + r() * 1.4)
  }
  const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.56)
  grad.addColorStop(0, 'rgba(160,110,50,0)')
  grad.addColorStop(1, `rgba(150,100,40,${age})`)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
}

/** text squeezed horizontally to fit `maxW` (canvas has no font-stretch in Safari) */
function fitText(g: Ctx, text: string, x: number, y: number, maxW: number, mode: 'fill' | 'stroke' = 'fill') {
  const w = g.measureText(text).width
  const sx = Math.min(1, maxW / Math.max(1, w))
  g.save()
  g.translate(x, y)
  g.scale(sx, 1)
  if (mode === 'fill') g.fillText(text, 0, 0)
  else g.strokeText(text, 0, 0)
  g.restore()
}

/** a rounded-rect path (ctx.roundRect is missing in Safari 15) */
function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** a hand-written line: tiny per-letter wobble so it isn't typeset-perfect */
function hand(g: Ctx, text: string, x: number, y: number, px: number, color: string, seed: number, weight = 600, angle = 0) {
  const r = rng(seed)
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.font = FONT.script(px, weight)
  g.fillStyle = color
  g.textBaseline = 'alphabetic'
  let cx = 0
  const align = g.textAlign
  const total = g.measureText(text).width
  if (align === 'center') cx = -total / 2
  else if (align === 'right') cx = -total
  g.textAlign = 'left'
  for (const ch of text) {
    const cw = g.measureText(ch).width
    g.save()
    g.translate(cx, (r() - 0.5) * px * 0.06)
    g.rotate((r() - 0.5) * 0.06)
    g.fillText(ch, 0, 0)
    g.restore()
    cx += cw
  }
  g.restore()
}

/* ------------------------------------------------------------------ 1 · postcard */

/** "Greetings from Long Island": a large-letter postcard; Levittown → Massapequa in ballpoint on the border */
export function postcardMap(scale = 1) {
  return print('postcard', 560, 360, scale, (g, W, H) => {
    paper(g, W, H, [246, 239, 222], 3, 0.16)
    const b = 16
    const foot = 40
    const x0 = b
    const y0 = b
    const w = W - 2 * b
    const h = H - 2 * b - foot + 8
    g.save()
    g.beginPath()
    g.rect(x0, y0, w, h)
    g.clip()
    // a sunset over the Sound
    const sky = g.createLinearGradient(0, y0, 0, y0 + h)
    sky.addColorStop(0, '#f7d7a0')
    sky.addColorStop(0.5, '#f0a55e')
    sky.addColorStop(0.72, '#d9703c')
    sky.addColorStop(1, '#8a3a22')
    g.fillStyle = sky
    g.fillRect(x0, y0, w, h)
    // the sun, low
    const sun = g.createRadialGradient(W * 0.7, y0 + h * 0.66, 4, W * 0.7, y0 + h * 0.66, 70)
    sun.addColorStop(0, 'rgba(255,244,214,1)')
    sun.addColorStop(0.35, 'rgba(255,214,150,0.9)')
    sun.addColorStop(1, 'rgba(255,190,120,0)')
    g.fillStyle = sun
    g.fillRect(x0, y0, w, h)
    // water: warm glints and a few dusk-blue swells
    const wy = y0 + h * 0.72
    g.fillStyle = '#6a3a2a'
    g.fillRect(x0, wy, w, h)
    const r = rng(8)
    for (let i = 0; i < 70; i++) {
      const yy = wy + 3 + r() * (h * 0.28)
      const blue = r() < 0.32
      g.fillStyle = blue ? `rgba(110,140,190,${0.35 + r() * 0.3})` : `rgba(255,${190 + r() * 50},${120 + r() * 60},${0.4 + r() * 0.4})`
      const len = 14 + r() * 70
      const near = Math.abs(W * 0.7 - (x0 + r() * w)) < 60
      g.fillRect(near ? W * 0.7 - len / 2 + (r() - 0.5) * 60 : x0 + r() * w, yy, len, 1.5 + r() * 1.5)
    }
    // dunes and beach grass silhouette
    g.fillStyle = '#3a1c12'
    g.beginPath()
    g.moveTo(x0, wy + 26)
    g.bezierCurveTo(x0 + 80, wy - 6, x0 + 150, wy + 4, x0 + 210, wy + 22)
    g.lineTo(x0 + 210, y0 + h)
    g.lineTo(x0, y0 + h)
    g.fill()
    g.strokeStyle = '#3a1c12'
    g.lineWidth = 1.4
    for (let i = 0; i < 40; i++) {
      const gx = x0 + 6 + r() * 170
      const gy = wy + 12 + r() * 10
      g.beginPath()
      g.moveTo(gx, gy)
      g.quadraticCurveTo(gx + 3, gy - 12, gx + 8 * (r() - 0.3), gy - 20 - r() * 12)
      g.stroke()
    }
    // a lighthouse on the point
    g.fillStyle = '#2e150d'
    g.beginPath()
    g.moveTo(x0 + 120, wy + 4)
    g.lineTo(x0 + 126, wy - 58)
    g.lineTo(x0 + 136, wy - 58)
    g.lineTo(x0 + 142, wy + 4)
    g.fill()
    g.fillRect(x0 + 122, wy - 66, 18, 8)
    g.fillStyle = '#ffe6b0'
    g.fillRect(x0 + 125, wy - 64, 12, 5)
    g.restore()

    // "Greetings from" in script, cream with a soft shadow
    g.textBaseline = 'alphabetic'
    g.textAlign = 'left'
    g.font = FONT.script(46, 700)
    g.fillStyle = 'rgba(60,20,10,0.55)'
    g.fillText('Greetings from', x0 + 20, y0 + 56)
    g.fillStyle = '#fff4dc'
    g.fillText('Greetings from', x0 + 18, y0 + 53)

    // LONG ISLAND — big block letters with a barn-red extrusion
    g.font = FONT.display(118, 900)
    const text = 'LONG ISLAND'
    const tw = g.measureText(text).width
    const maxW = w - 36
    const sx = Math.min(1, maxW / tw)
    const tx = x0 + 18
    const ty = y0 + 170
    g.save()
    g.translate(tx, ty)
    g.scale(sx, 1)
    for (let k = 9; k >= 1; k--) {
      g.fillStyle = k === 9 ? 'rgba(40,10,5,0.45)' : '#8e2c1c'
      g.fillText(text, k * 1.1, k * 1.1)
    }
    const lg = g.createLinearGradient(0, -90, 0, 6)
    lg.addColorStop(0, '#fff6df')
    lg.addColorStop(0.55, '#ffd48a')
    lg.addColorStop(1, '#f0a050')
    g.fillStyle = lg
    g.fillText(text, 0, 0)
    g.lineWidth = 3
    g.strokeStyle = '#4a1a0e'
    g.strokeText(text, 0, 0)
    g.restore()
    g.font = FONT.display(26, 800)
    g.fillStyle = '#fff4dc'
    g.textAlign = 'right'
    g.fillText('N.Y.', x0 + w - 18, ty + 34)

    // on the white border, in ballpoint
    g.textAlign = 'left'
    hand(g, 'Levittown → Massapequa', x0 + 10, H - 16, 30, INK, 21, 560, -0.012)
  })
}

/* ------------------------------------------------------------------ 2 · sheet music */

function trebleClef(g: Ctx, x: number, top: number, sp: number) {
  // a simplified G clef: a spiral round the G line, a tall stem, a hook below
  g.lineWidth = sp * 0.22
  g.beginPath()
  const gy = top + sp * 3
  g.moveTo(x + sp * 0.2, gy + sp * 0.1)
  g.bezierCurveTo(x - sp * 0.9, gy + sp * 0.1, x - sp * 0.7, gy - sp * 1.4, x + sp * 0.3, gy - sp * 1.2)
  g.bezierCurveTo(x + sp * 1.4, gy - sp * 0.9, x + sp * 1.2, gy + sp * 1.2, x - sp * 0.1, gy + sp * 1.1)
  g.bezierCurveTo(x - sp * 1.3, gy + sp * 1.0, x - sp * 1.4, gy - sp * 1.2, x + sp * 0.2, gy - sp * 2.6)
  g.bezierCurveTo(x + sp * 1.0, gy - sp * 3.3, x + sp * 0.9, gy - sp * 4.6, x + sp * 0.3, gy - sp * 4.4)
  g.bezierCurveTo(x - sp * 0.2, gy - sp * 4.2, x - sp * 0.1, gy - sp * 2.6, x + sp * 0.25, gy + sp * 2.2)
  g.stroke()
  g.beginPath()
  g.arc(x - sp * 0.05, gy + sp * 2.2, sp * 0.3, 0, Math.PI * 2)
  g.fill()
}

function bassClef(g: Ctx, x: number, top: number, sp: number) {
  g.lineWidth = sp * 0.24
  g.beginPath()
  g.arc(x - sp * 0.2, top + sp * 1.0, sp * 0.3, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(x - sp * 0.4, top + sp * 1.0)
  g.bezierCurveTo(x - sp * 0.4, top - sp * 0.2, x + sp * 1.3, top - sp * 0.3, x + sp * 1.2, top + sp * 1.4)
  g.bezierCurveTo(x + sp * 1.1, top + sp * 2.6, x + sp * 0.2, top + sp * 3.3, x - sp * 0.6, top + sp * 3.6)
  g.stroke()
  g.beginPath()
  g.arc(x + sp * 1.7, top + sp * 0.5, sp * 0.16, 0, Math.PI * 2)
  g.arc(x + sp * 1.7, top + sp * 1.5, sp * 0.16, 0, Math.PI * 2)
  g.fill()
}

/** a page of piano practice: grand staves of plain notes, pencil fingerings */
export function sheetMusicMap(scale = 1) {
  return print('sheet', 440, 560, scale, (g, W, H) => {
    paper(g, W, H, [247, 242, 228], 5, 0.2)
    // a fold crease down the middle
    const crease = g.createLinearGradient(W / 2 - 8, 0, W / 2 + 8, 0)
    crease.addColorStop(0, 'rgba(120,90,50,0)')
    crease.addColorStop(0.5, 'rgba(120,90,50,0.14)')
    crease.addColorStop(1, 'rgba(120,90,50,0)')
    g.fillStyle = crease
    g.fillRect(W / 2 - 8, 0, 16, H)
    const r = rng(33)
    const ink = '#211a16'
    g.fillStyle = ink
    g.strokeStyle = ink
    g.textAlign = 'center'
    g.font = FONT.mono(11, 500)
    g.fillText('— 4 —', W / 2, 30)
    const sp = 6.4
    const left = 30
    const right = W - 24
    for (let s = 0; s < 4; s++) {
      const topT = 62 + s * 124
      const topB = topT + sp * 4 + 30
      // staves
      g.lineWidth = 0.9
      for (const t of [topT, topB])
        for (let i = 0; i < 5; i++) {
          g.beginPath()
          g.moveTo(left, t + i * sp)
          g.lineTo(right, t + i * sp)
          g.stroke()
        }
      // brace + system line
      g.lineWidth = 1.6
      g.beginPath()
      g.moveTo(left, topT)
      g.lineTo(left, topB + sp * 4)
      g.stroke()
      g.lineWidth = 2.2
      g.beginPath()
      g.moveTo(left - 7, topT)
      g.quadraticCurveTo(left - 13, (topT + topB + sp * 4) / 2, left - 7, topB + sp * 4)
      g.stroke()
      trebleClef(g, left + 14, topT, sp)
      bassClef(g, left + 12, topB, sp)
      // barlines
      const bars = [left + 44, left + 44 + (right - left - 44) / 3, left + 44 + ((right - left - 44) * 2) / 3, right]
      g.lineWidth = 1
      for (const bx of bars.slice(1)) {
        g.beginPath()
        g.moveTo(bx, topT)
        g.lineTo(bx, topB + sp * 4)
        g.stroke()
      }
      // notes: four to a bar in the right hand, two in the left
      for (let m = 0; m < 3; m++) {
        const bx0 = bars[m] + 10
        const bw = bars[m + 1] - bars[m] - 16
        for (let n = 0; n < 4; n++) {
          const nx = bx0 + (n + 0.5) * (bw / 4)
          const step = Math.floor(r() * 9) - 1
          const ny = topT + sp * 4 - step * (sp / 2)
          g.save()
          g.translate(nx, ny)
          g.rotate(-0.35)
          g.beginPath()
          g.ellipse(0, 0, sp * 0.62, sp * 0.44, 0, 0, Math.PI * 2)
          g.fill()
          g.restore()
          g.lineWidth = 1
          g.beginPath()
          const up = step < 4
          g.moveTo(nx + (up ? sp * 0.56 : -sp * 0.56), ny)
          g.lineTo(nx + (up ? sp * 0.56 : -sp * 0.56), ny + (up ? -sp * 3.3 : sp * 3.3))
          g.stroke()
          if (step < 0) {
            g.beginPath()
            g.moveTo(nx - sp, topT + sp * 5)
            g.lineTo(nx + sp, topT + sp * 5)
            g.stroke()
          }
          // pencil fingerings over some notes
          if (r() < 0.3) {
            g.save()
            g.font = FONT.script(15, 600)
            g.fillStyle = PENCIL
            g.fillText(String(1 + Math.floor(r() * 5)), nx, topT - 6)
            g.restore()
          }
        }
        for (let n = 0; n < 2; n++) {
          const nx = bx0 + (n + 0.5) * (bw / 2)
          const step = Math.floor(r() * 7)
          const ny = topB + sp * 4 - step * (sp / 2)
          g.save()
          g.translate(nx, ny)
          g.rotate(-0.35)
          g.lineWidth = 1.3
          g.beginPath()
          g.ellipse(0, 0, sp * 0.62, sp * 0.44, 0, 0, Math.PI * 2)
          g.stroke()
          g.restore()
          g.lineWidth = 1
          g.beginPath()
          g.moveTo(nx - sp * 0.56, ny)
          g.lineTo(nx - sp * 0.56, ny + sp * 3.3)
          g.stroke()
        }
      }
    }
    // a pencil ring round one bar, and a star
    g.strokeStyle = PENCIL
    g.lineWidth = 1.6
    g.beginPath()
    g.ellipse(W * 0.58, 62 + 124 + 26, 70, 42, -0.08, 0, Math.PI * 2)
    g.stroke()
    g.save()
    g.fillStyle = PENCIL
    g.textAlign = 'left'
    hand(g, 'slow!', W * 0.72, 62 + 124 - 18, 22, PENCIL, 5, 600, -0.08)
    g.restore()
  })
}

/* ------------------------------------------------------------------ 3 · VHS */

/** the VHS's top face: black shell, the window on its reels, a hand-labelled sticker */
export function vhsFaceMap(scale = 1) {
  return print('vhs-face', 400, 220, scale, (g, W, H) => {
    g.fillStyle = '#141211'
    g.fillRect(0, 0, W, H)
    const r = rng(9)
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.03})`
      g.fillRect(r() * W, r() * H, 1, 1)
    }
    // the recessed label bay
    g.fillStyle = '#0d0c0b'
    g.fillRect(22, 18, W - 44, H - 36)
    // the window: smoke-dark, the two tape packs behind it
    const wx = 96
    const wy = 28
    const ww = W - 192
    const wh = 70
    g.fillStyle = '#0a0808'
    g.fillRect(wx, wy, ww, wh)
    for (const [cx, rad] of [
      [wx + ww * 0.24, 48],
      [wx + ww * 0.76, 30],
    ] as [number, number][]) {
      g.save()
      g.beginPath()
      g.rect(wx, wy, ww, wh)
      g.clip()
      const cy = wy + wh * 0.62
      g.fillStyle = '#2a1a12'
      g.beginPath()
      g.arc(cx, cy, rad, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(90,60,40,0.5)'
      for (let k = 12; k < rad; k += 3) {
        g.lineWidth = 0.6
        g.beginPath()
        g.arc(cx, cy, k, 0, Math.PI * 2)
        g.stroke()
      }
      g.fillStyle = '#d8d2c6'
      g.beginPath()
      g.arc(cx, cy, 11, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#2a2624'
      for (let k = 0; k < 6; k++) {
        g.save()
        g.translate(cx, cy)
        g.rotate((k / 6) * Math.PI * 2)
        g.fillRect(-1.2, -9, 2.4, 5)
        g.restore()
      }
      g.restore()
    }
    // window glare
    const glare = g.createLinearGradient(wx, wy, wx + ww, wy + wh)
    glare.addColorStop(0, 'rgba(255,255,255,0.1)')
    glare.addColorStop(0.4, 'rgba(255,255,255,0.02)')
    glare.addColorStop(1, 'rgba(255,255,255,0.06)')
    g.fillStyle = glare
    g.fillRect(wx, wy, ww, wh)
    // the sticker
    const lx = 40
    const ly = 108
    const lw = W - 80
    const lh = 96
    g.save()
    g.translate(lx + lw / 2, ly + lh / 2)
    g.rotate(-0.012)
    g.translate(-lw / 2, -lh / 2)
    paper(g, lw, lh, [244, 240, 230], 12, 0.1)
    g.strokeStyle = 'rgba(160,60,40,0.55)'
    g.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      g.beginPath()
      g.moveTo(8, i * 22 + 6)
      g.lineTo(lw - 8, i * 22 + 6)
      g.stroke()
    }
    g.textAlign = 'left'
    hand(g, 'hair metal videos', 14, 46, 38, MARKER, 3, 700, -0.02)
    hand(g, 'off MTV', 16, 82, 26, RED, 7, 700, -0.01)
    g.font = FONT.mono(10, 500)
    g.fillStyle = '#6a5a4a'
    g.textAlign = 'right'
    g.fillText('T-120', lw - 12, 20)
    g.fillText('SP  LP  EP', lw - 12, lh - 12)
    g.strokeStyle = MARKER
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(lw - 30, lh - 20)
    g.lineTo(lw - 25, lh - 12)
    g.lineTo(lw - 14, lh - 30)
    g.stroke()
    g.restore()
  })
}

/** the VHS spine (the front edge): a white strip in marker */
export function vhsSpineMap(scale = 1) {
  return print('vhs-spine', 400, 56, scale, (g, W, H) => {
    g.fillStyle = '#141211'
    g.fillRect(0, 0, W, H)
    g.save()
    g.translate(30, 8)
    paper(g, W - 60, H - 16, [242, 238, 228], 14, 0.08)
    g.textAlign = 'left'
    hand(g, 'HAIR METAL', 12, 32, 30, MARKER, 4, 700)
    g.restore()
  })
}

/* ------------------------------------------------------------------ 4 · the TV */

/**
 * The picture on the little TV: a generic, warm test-card-like pattern (a
 * ring, a grid, muted bars) — never a person. The screen shader adds the
 * scanlines, the slow hum bar and a quiet shimmer.
 */
export function testCardMap(scale = 1) {
  return print('testcard', 320, 240, scale, (g, W, H) => {
    const bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7)
    bg.addColorStop(0, '#8a7a66')
    bg.addColorStop(1, '#4a3a2c')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    // grid
    g.strokeStyle = 'rgba(245,232,210,0.55)'
    g.lineWidth = 1.5
    for (let x = 20; x < W; x += 28) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, H)
      g.stroke()
    }
    for (let y = 8; y < H; y += 28) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }
    // the ring
    const cx = W / 2
    const cy = H / 2
    const R = H * 0.42
    g.fillStyle = '#2e241c'
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.fill()
    g.save()
    g.beginPath()
    g.arc(cx, cy, R - 3, 0, Math.PI * 2)
    g.clip()
    // warm bars across the middle band
    const bars = ['#f4e8d2', '#ffd98a', '#eaa64e', '#b4432f', '#7a3820', '#6f8fc4', '#2a1c14']
    const bw = (R * 2) / bars.length
    bars.forEach((c, i) => {
      g.fillStyle = c
      g.fillRect(cx - R + i * bw, cy - R * 0.36, bw + 1, R * 0.72)
    })
    // a grey ramp above, a fine-line pattern below
    for (let i = 0; i < 6; i++) {
      const v = 40 + i * 40
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`
      g.fillRect(cx - R + (i * R * 2) / 6, cy - R, (R * 2) / 6 + 1, R * 0.64)
    }
    for (let x = cx - R; x < cx + R; x += 4) {
      g.fillStyle = '#efe2c8'
      g.fillRect(x, cy + R * 0.36, 2, R * 0.64)
    }
    g.restore()
    g.strokeStyle = '#f4e8d2'
    g.lineWidth = 2.4
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(cx, cy, R * 0.18, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(cx - R * 0.3, cy)
    g.lineTo(cx + R * 0.3, cy)
    g.moveTo(cx, cy - R * 0.3)
    g.lineTo(cx, cy + R * 0.3)
    g.stroke()
  })
}

/* ------------------------------------------------------------------ 5 · the CD */

/** the jewel case's insert: our own plain typographic card (not the album art) */
export function cdInsertMap(scale = 1) {
  return print('cd-insert', 300, 264, scale, (g, W, H) => {
    paper(g, W, H, [236, 226, 204], 17, 0.14)
    // a strip of film across the middle
    const fy = H * 0.34
    const fh = H * 0.3
    g.fillStyle = '#1a1210'
    g.fillRect(0, fy, W, fh)
    g.fillStyle = '#e9dcc0'
    for (let x = 6; x < W; x += 20) {
      g.fillRect(x, fy + 6, 10, 8)
      g.fillRect(x, fy + fh - 14, 10, 8)
    }
    for (let i = 0; i < 4; i++) {
      const fr = g.createLinearGradient(0, fy + 20, 0, fy + fh - 20)
      fr.addColorStop(0, '#7a4a2a')
      fr.addColorStop(1, '#3a2016')
      g.fillStyle = fr
      g.fillRect(8 + i * 74, fy + 20, 64, fh - 40)
    }
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.font = FONT.displayItalic(46, 560)
    g.fillStyle = '#1b120e'
    fitText(g, 'Like a Movie', W / 2, H * 0.27, W - 40)
    g.font = FONT.mono(14, 600)
    g.fillStyle = '#5a3a24'
    g.fillText('G R E G   J O N E S', W / 2, H * 0.8)
    g.font = FONT.mono(12, 500)
    g.fillText('1 9 9 9', W / 2, H * 0.9)
  })
}

/** the disc's printed face (a ring: RingGeometry maps it planar) */
export function cdLabelMap(scale = 1) {
  return print('cd-label', 256, 256, scale, (g, W, H) => {
    const cx = W / 2
    const cy = H / 2
    const bg = g.createRadialGradient(cx, cy, 20, cx, cy, W / 2)
    bg.addColorStop(0, '#f1e6cf')
    bg.addColorStop(1, '#e2d0aa')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(122,56,32,0.6)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(cx, cy, W * 0.46, 0, Math.PI * 2)
    g.stroke()
    g.textAlign = 'center'
    g.fillStyle = '#1b120e'
    g.font = FONT.displayItalic(30, 560)
    g.fillText('Like a Movie', cx, cy - 44)
    g.font = FONT.mono(11, 600)
    g.fillStyle = '#7a3820'
    g.fillText('GREG JONES · 1999', cx, cy + 58)
  })
}

/* ------------------------------------------------------------------ 6 · road map */

/** a folded road map of the Jersey side: river, shore, highways, a circle in pen */
export function roadMapMap(scale = 1) {
  return print('roadmap', 560, 380, scale, (g, W, H) => {
    paper(g, W, H, [240, 232, 212], 23, 0.18)
    const r = rng(41)
    const water = '#8fa6c8'
    // the river on the west edge, the ocean on the east
    g.fillStyle = water
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(70, 0)
    g.bezierCurveTo(110, 70, 40, 130, 90, 190)
    g.bezierCurveTo(130, 240, 60, 300, 120, H)
    g.lineTo(0, H)
    g.fill()
    g.beginPath()
    g.moveTo(W, 0)
    g.lineTo(W - 60, 0)
    g.bezierCurveTo(W - 90, 90, W - 50, 160, W - 110, 250)
    g.bezierCurveTo(W - 150, 310, W - 120, 350, W - 170, H)
    g.lineTo(W, H)
    g.fill()
    // barrier islands
    g.strokeStyle = '#e8dcc0'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(W - 40, 20)
    g.bezierCurveTo(W - 70, 120, W - 60, 180, W - 100, 270)
    g.stroke()
    // thin grey roads
    g.strokeStyle = 'rgba(90,80,70,0.55)'
    g.lineWidth = 1
    for (let i = 0; i < 46; i++) {
      g.beginPath()
      let x = 90 + r() * (W - 240)
      let y = r() * H
      g.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * 90
        y += (r() - 0.5) * 90
        g.lineTo(x, y)
      }
      g.stroke()
    }
    // highways: amber with a dark casing, barn red for the big ones
    const road = (pts: number[], col: string, wdt: number) => {
      g.lineJoin = 'round'
      g.strokeStyle = 'rgba(40,20,10,0.55)'
      g.lineWidth = wdt + 2
      g.beginPath()
      g.moveTo(pts[0], pts[1])
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
      g.stroke()
      g.strokeStyle = col
      g.lineWidth = wdt
      g.stroke()
    }
    road([100, 20, 180, 110, 250, 170, 330, 250, 400, 340, 430, H], '#b4432f', 5)
    road([120, 300, 220, 250, 330, 250, 420, 200, W - 120, 150], '#eaa64e', 4)
    road([150, 0, 190, 80, 210, 160, 200, 260, 230, H], '#eaa64e', 3.5)
    road([90, 150, 200, 160, 300, 120, 400, 90, W - 90, 60], '#eaa64e', 3.5)
    // town dots
    g.fillStyle = '#3a2a20'
    for (let i = 0; i < 14; i++) {
      g.beginPath()
      g.arc(110 + r() * (W - 260), 20 + r() * (H - 40), 2.4, 0, Math.PI * 2)
      g.fill()
    }
    // compass
    g.save()
    g.translate(W - 210, H - 60)
    g.fillStyle = '#3a2a20'
    g.beginPath()
    g.moveTo(0, -24)
    g.lineTo(7, 0)
    g.lineTo(0, -5)
    g.lineTo(-7, 0)
    g.fill()
    g.font = FONT.mono(12, 600)
    g.textAlign = 'center'
    g.fillText('N', 0, -30)
    g.restore()
    // fold creases
    for (let i = 1; i < 4; i++) {
      const x = (W * i) / 4
      const cg = g.createLinearGradient(x - 6, 0, x + 6, 0)
      cg.addColorStop(0, 'rgba(90,60,30,0)')
      cg.addColorStop(0.5, 'rgba(90,60,30,0.2)')
      cg.addColorStop(1, 'rgba(90,60,30,0)')
      g.fillStyle = cg
      g.fillRect(x - 6, 0, 12, H)
    }
    // the pen: a ring and a note
    g.strokeStyle = RED
    g.lineWidth = 3
    g.beginPath()
    g.ellipse(270, 250, 120, 76, -0.12, 0.2, Math.PI * 2 + 0.05)
    g.stroke()
    g.textAlign = 'left'
    hand(g, 'South Jersey', 176, 250, 44, RED, 12, 700, -0.06)
    hand(g, '2001', 300, 296, 34, RED, 19, 700, -0.04)
  })
}

/* ------------------------------------------------------------------ 7 · the calendar */

/**
 * A wall calendar sheet for the summer of 2014: a hundred numbered day boxes,
 * 88 of them struck through in marker, and the tally along the foot (17 gates
 * and three: 88).
 */
export function calendarMap(scale = 1) {
  return print('calendar', 420, 560, scale, (g, W, H) => {
    paper(g, W, H, [247, 243, 233], 29, 0.12)
    // spiral holes along the top
    g.fillStyle = '#2a201a'
    for (let i = 0; i < 17; i++) {
      g.beginPath()
      g.arc(24 + i * ((W - 48) / 16), 14, 3.4, 0, Math.PI * 2)
      g.fill()
    }
    // header band
    g.fillStyle = '#7a3820'
    g.fillRect(20, 30, W - 40, 62)
    g.textBaseline = 'alphabetic'
    g.textAlign = 'left'
    g.fillStyle = '#f4e8d2'
    g.font = FONT.display(40, 700)
    g.fillText('Summer', 34, 76)
    g.font = FONT.mono(22, 600)
    g.textAlign = 'right'
    g.fillText('2014', W - 34, 74)
    // 10 × 10 day boxes
    const gx = 20
    const gy = 104
    const cw = (W - 40) / 10
    const ch = 34
    g.strokeStyle = 'rgba(60,40,30,0.5)'
    g.lineWidth = 1
    const r = rng(88)
    // twelve nights off, spread through the hundred
    const off = new Set<number>()
    while (off.size < 12) off.add(Math.floor(r() * 100))
    for (let i = 0; i < 100; i++) {
      const cx = gx + (i % 10) * cw
      const cy = gy + Math.floor(i / 10) * ch
      g.strokeRect(cx, cy, cw, ch)
      g.font = FONT.mono(8.5, 500)
      g.fillStyle = 'rgba(60,40,30,0.75)'
      g.textAlign = 'left'
      g.fillText(String(i + 1), cx + 3, cy + 10)
      if (!off.has(i)) {
        g.strokeStyle = RED
        g.lineWidth = 2.6
        g.lineCap = 'round'
        const j = (r() - 0.5) * 4
        g.beginPath()
        g.moveTo(cx + 8 + j, cy + ch - 6)
        g.lineTo(cx + cw - 7, cy + 7 + j)
        g.stroke()
        g.strokeStyle = 'rgba(60,40,30,0.5)'
        g.lineWidth = 1
      }
    }
    // the tally: 17 gates of five, then three — 88
    const ty = gy + 10 * ch + 22
    g.strokeStyle = MARKER
    g.lineCap = 'round'
    g.lineWidth = 2
    let x = 24
    let y = ty
    for (let k = 0; k < 18; k++) {
      const n = k < 17 ? 4 : 3
      if (k === 9) {
        x = 24
        y += 36
      }
      for (let s = 0; s < n; s++) {
        const j = (r() - 0.5) * 2
        g.beginPath()
        g.moveTo(x + s * 7 + j, y)
        g.lineTo(x + s * 7, y + 26)
        g.stroke()
      }
      if (k < 17) {
        g.beginPath()
        g.moveTo(x - 4, y + 22)
        g.lineTo(x + 26, y + 4)
        g.stroke()
      }
      x += 42
    }
    g.textAlign = 'right'
    hand(g, '88 shows / 100 days', W - 22, H - 16, 34, RED, 31, 700, -0.03)
  })
}

/* ------------------------------------------------------------------ 8 · the ticket */

/** a ticket stub: 12/14 8:00pm, World Cafe Live, Philadelphia */
export function ticketMap(scale = 1) {
  return print('ticket', 540, 216, scale, (g, W, H) => {
    paper(g, W, H, [244, 226, 186], 37, 0.2)
    const stub = 120
    // the stub: barn red, ADMIT ONE up the side
    g.fillStyle = '#a8412c'
    g.fillRect(0, 0, stub, H)
    g.save()
    g.translate(stub / 2 + 10, H / 2)
    g.rotate(-Math.PI / 2)
    g.textAlign = 'center'
    g.fillStyle = '#f7ead0'
    g.font = FONT.mono(20, 700)
    g.fillText('ADMIT ONE', 0, 0)
    g.restore()
    // perforation
    g.fillStyle = '#5a2a18'
    for (let y = 6; y < H; y += 12) {
      g.beginPath()
      g.arc(stub, y, 2.4, 0, Math.PI * 2)
      g.fill()
    }
    // the print
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    g.fillStyle = '#7a3820'
    g.font = FONT.mono(13, 600)
    g.fillText('W O R L D   C A F E   L I V E', stub + 24, 38)
    g.fillStyle = '#1b120e'
    g.font = FONT.display(40, 760)
    fitText(g, 'Greg Jones Project', stub + 22, 92, W - stub - 44)
    g.strokeStyle = 'rgba(60,30,20,0.4)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(stub + 24, 112)
    g.lineTo(W - 22, 112)
    g.stroke()
    g.font = FONT.display(52, 700)
    g.fillStyle = '#1b120e'
    g.fillText('12/14', stub + 22, 172)
    g.font = FONT.mono(22, 600)
    g.fillStyle = '#7a3820'
    g.fillText('8:00PM', stub + 180, 166)
    g.font = FONT.mono(12, 500)
    g.fillStyle = '#4a3020'
    g.textAlign = 'right'
    g.fillText('PHILADELPHIA', W - 22, 166)
  })
}

/* ------------------------------------------------------------------ 9 · the reel */

/** a strip of masking tape on the reel's flange, in marker */
export function reelLabelMap(scale = 1) {
  return print('reel-label', 360, 110, scale, (g, W, H) => {
    tapeStrip(g, W, H, 51)
    g.textAlign = 'left'
    hand(g, 'GJP — Volume ONE', 20, 50, 40, MARKER, 3, 700, -0.01)
    hand(g, 'Summer 2016 · 2 inch', 22, 90, 28, MARKER, 9, 600, -0.01)
  })
}

/** the tape pack's face: concentric winds of brown tape */
export function tapePackMap(scale = 1) {
  return print('tapepack', 256, 256, scale, (g, W, H) => {
    const cx = W / 2
    const cy = H / 2
    g.fillStyle = '#1f130d'
    g.fillRect(0, 0, W, H)
    const r = rng(61)
    for (let k = 40; k < W / 2; k += 0.9) {
      const v = 26 + r() * 22
      g.strokeStyle = `rgb(${v + 14},${v},${v - 8})`
      g.lineWidth = 1
      g.beginPath()
      g.arc(cx, cy, k, 0, Math.PI * 2)
      g.stroke()
    }
  })
}

/* ------------------------------------------------------------------ bits */

/** masking tape: a beige strip with torn ends (transparent outside) */
function tapeStrip(g: Ctx, W: number, H: number, seed: number) {
  const r = rng(seed)
  g.clearRect(0, 0, W, H)
  g.beginPath()
  g.moveTo(8, 4)
  for (let y = 4; y <= H - 4; y += 6) g.lineTo(4 + r() * 8, y)
  g.lineTo(W - 8, H - 4)
  for (let y = H - 4; y >= 4; y -= 6) g.lineTo(W - 4 - r() * 8, y)
  g.closePath()
  g.fillStyle = '#e4d3a8'
  g.fill()
  g.save()
  g.clip()
  for (let i = 0; i < (W * H) / 30; i++) {
    g.fillStyle = `rgba(120,90,40,${r() * 0.08})`
    g.fillRect(r() * W, r() * H, 2 + r() * 6, 1)
  }
  g.restore()
}

/** a bare strip of masking tape (to hold paper to the lid) */
export function tapeMap(scale = 1) {
  return print('tape', 160, 56, scale, (g, W, H) => tapeStrip(g, W, H, 71))
}

/* ------------------------------------------------------------------ stickers */

export interface StickerDesign {
  key: string
  W: number
  H: number
  draw: (g: Ctx, W: number, H: number) => void
}

function dieCut(g: Ctx, path: () => void, fill: string) {
  g.save()
  path()
  g.fillStyle = '#f6efe0'
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = 4
  g.fill()
  g.restore()
  g.save()
  g.translate(0, 0)
  path()
  g.clip()
  g.fillStyle = fill
  g.fill()
  g.restore()
}

/** the influences, as stickers inside the lid (names only, set in our own type) */
export const STICKERS: StickerDesign[] = [
  {
    key: 'stills',
    W: 256,
    H: 256,
    draw(g, W, H) {
      const c = W / 2
      g.save()
      g.beginPath()
      g.arc(c, H / 2, W / 2 - 4, 0, Math.PI * 2)
      g.fillStyle = '#f6efe0'
      g.fill()
      g.beginPath()
      g.arc(c, H / 2, W / 2 - 16, 0, Math.PI * 2)
      g.fillStyle = '#a8412c'
      g.fill()
      g.strokeStyle = '#f4e8d2'
      g.lineWidth = 2
      g.beginPath()
      g.arc(c, H / 2, W / 2 - 28, 0, Math.PI * 2)
      g.stroke()
      g.textAlign = 'center'
      g.fillStyle = '#fff4dc'
      g.font = FONT.displayItalic(46, 600)
      g.fillText('Stephen', c, H / 2 - 4)
      g.font = FONT.display(58, 800)
      g.fillText('STILLS', c, H / 2 + 54)
      g.restore()
    },
  },
  {
    key: 'garcia',
    W: 340,
    H: 190,
    draw(g, W, H) {
      g.save()
      const path = () => {
        g.beginPath()
        g.ellipse(W / 2, H / 2, W / 2 - 4, H / 2 - 4, 0, 0, Math.PI * 2)
      }
      dieCut(g, path, '#f6efe0')
      g.beginPath()
      g.ellipse(W / 2, H / 2, W / 2 - 16, H / 2 - 16, 0, 0, Math.PI * 2)
      g.fillStyle = '#eaa64e'
      g.fill()
      g.textAlign = 'center'
      g.fillStyle = '#2a1206'
      g.font = FONT.script(66, 700)
      g.fillText('Jerry Garcia', W / 2, H / 2 + 20)
      g.restore()
    },
  },
  {
    key: 'lamontagne',
    W: 420,
    H: 130,
    draw(g, W, H) {
      g.save()
      g.fillStyle = '#f6efe0'
      roundRect(g, 3, 3, W - 6, H - 6, 12)
      g.fill()
      g.fillStyle = '#23150e'
      roundRect(g, 12, 12, W - 24, H - 24, 7)
      g.fill()
      g.textAlign = 'center'
      g.fillStyle = '#ffc98a'
      g.font = FONT.mono(34, 700)
      fitText(g, 'RAY LaMONTAGNE', W / 2, H / 2 + 12, W - 60)
      g.restore()
    },
  },
]

export function stickerMap(d: StickerDesign, scale = 1) {
  return print(`sticker-${d.key}`, d.W, d.H, scale, (g, W, H) => {
    g.clearRect(0, 0, W, H)
    d.draw(g, W, H)
  })
}

/* ------------------------------------------------------------------ room */

/** a worn kilim stage rug: barn red field, stepped amber lozenges, cream and walnut borders */
export function rugMap(scale = 1) {
  return print('rug', 640, 400, scale, (g, W, H) => {
    g.fillStyle = '#4a1810'
    g.fillRect(0, 0, W, H)
    const r = rng(77)
    // borders
    const band = (inset: number, wdt: number, col: string) => {
      g.strokeStyle = col
      g.lineWidth = wdt
      g.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
    }
    band(10, 20, '#2a140c')
    band(26, 6, '#9a6a3a')
    band(40, 16, '#3a1a10')
    // a zig-zag in the outer border
    g.strokeStyle = '#8a5a30'
    g.lineWidth = 3
    for (const [y, dir] of [
      [10, 1],
      [H - 10, -1],
    ] as [number, number][]) {
      g.beginPath()
      for (let x = 0; x <= W; x += 12) g.lineTo(x, y + dir * ((x / 12) % 2 ? 6 : -6))
      g.stroke()
    }
    // stepped lozenges down the field
    const lozenge = (cx: number, cy: number, s: number, col: string, inner: string) => {
      for (const [k, c] of [
        [1, col],
        [0.62, inner],
        [0.3, col],
      ] as [number, string][]) {
        g.fillStyle = c
        g.beginPath()
        const a = s * k
        const st = 5
        for (let i = 0; i <= st; i++) g.lineTo(cx - a + (a / st) * i, cy - (a / st) * i * 0.8)
        for (let i = 0; i <= st; i++) g.lineTo(cx + (a / st) * i, cy - a * 0.8 + (a / st) * i * 0.8)
        for (let i = 0; i <= st; i++) g.lineTo(cx + a - (a / st) * i, cy + (a / st) * i * 0.8)
        for (let i = 0; i <= st; i++) g.lineTo(cx - (a / st) * i, cy + a * 0.8 - (a / st) * i * 0.8)
        g.fill()
      }
    }
    lozenge(W * 0.25, H / 2, 86, '#9a6a3a', '#2a140c')
    lozenge(W * 0.5, H / 2, 100, '#b89c78', '#7a2618')
    lozenge(W * 0.75, H / 2, 86, '#9a6a3a', '#2a140c')
    for (const x of [W * 0.12, W * 0.37, W * 0.63, W * 0.88])
      for (const y of [H * 0.24, H * 0.76]) lozenge(x, y, 22, '#b89c78', '#4a1810')
    // wear: fibres and faded patches
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(255,220,170,${r() * 0.06})`
      g.fillRect(r() * W, r() * H, 1 + r() * 3, 1)
    }
    const wear = g.createRadialGradient(W * 0.45, H * 0.5, 20, W * 0.45, H * 0.5, W * 0.6)
    wear.addColorStop(0, 'rgba(255,200,150,0.08)')
    wear.addColorStop(1, 'rgba(0,0,0,0.18)')
    g.fillStyle = wear
    g.fillRect(0, 0, W, H)
  })
}

/* ------------------------------------------------------------------ velvet */

/** crushed velvet: irregular pressed patches (colour) — tileable */
export function velvetMap(mobile: boolean) {
  const s = mobile ? 128 : 256
  return tile(
    `story-velvet-${s}`,
    s,
    s,
    (g, w, h) => {
      g.fillStyle = '#3e1311'
      g.fillRect(0, 0, w, h)
      const r = rng(19)
      // pressed patches, drawn with wrap-around so the tile repeats
      for (let i = 0; i < 260; i++) {
        const x = r() * w
        const y = r() * h
        const rx = (4 + r() * 16) * (w / 256)
        const ry = rx * (0.25 + r() * 0.45)
        const a = r() * Math.PI
        const light = r() < 0.5
        const col = light ? `rgba(120,44,34,${0.05 + r() * 0.1})` : `rgba(14,3,3,${0.08 + r() * 0.14})`
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            g.fillStyle = col
            g.beginPath()
            g.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2)
            g.fill()
          }
      }
      // the pile's fine grain
      for (let i = 0; i < w * h * 0.25; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(150,60,50,${r() * 0.06})`
        g.fillRect(r() * w, r() * h, 1, 1)
      }
    },
    { srgb: true },
  )
}

/** the velvet's pile as a bump map (grey) — tileable */
export function velvetBump(mobile: boolean) {
  const s = mobile ? 64 : 128
  return tile(
    `story-velvet-bump-${s}`,
    s,
    s,
    (g, w, h) => {
      g.fillStyle = 'rgb(128,128,128)'
      g.fillRect(0, 0, w, h)
      const r = rng(23)
      for (let i = 0; i < 120; i++) {
        const x = r() * w
        const y = r() * h
        const rx = (4 + r() * 16) * (w / 128)
        const ry = rx * (0.3 + r() * 0.4)
        const a = r() * Math.PI
        const v = r() < 0.5 ? 160 + r() * 60 : 60 + r() * 50
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            g.fillStyle = `rgba(${v},${v},${v},0.35)`
            g.beginPath()
            g.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2)
            g.fill()
          }
      }
    },
    { srgb: false },
  )
}

/** keep three's texture filtering crisp for printed type seen at an angle */
export function crisp(t: THREE.Texture) {
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}
