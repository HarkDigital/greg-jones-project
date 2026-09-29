import { rng } from '../../core/math'
import { FONT, tile } from '../../kit/materials'
import { ALBUMS } from '../../content'

/*
 * LISTEN · canvas art (small cached tiles, drawn once): walnut, brushed
 * aluminium, the wound-tape edge of a reel pack, the VU meter face, the
 * counter drums, the transport legends, the track sheet taped inside the
 * Volume ONE tape box lid, the Like a Movie disc print, the live cassette's
 * face. Every key is prefixed `ls-`. Decorative words only (transport
 * legends, channel numbers, a side letter); every title, date and time is
 * from content.ts.
 */

const VOL1 = ALBUMS[0]
const MOVIE = ALBUMS[1]

/** a rounded-rect path (ctx.roundRect is missing in Safari 15) */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + k, y)
  g.arcTo(x + w, y, x + w, y + h, k)
  g.arcTo(x + w, y + h, x, y + h, k)
  g.arcTo(x, y + h, x, y, k)
  g.arcTo(x, y, x + w, y, k)
  g.closePath()
}

/** value noise into ImageData (tileable at `period`) */
function noise(g: CanvasRenderingContext2D, w: number, h: number, period: number, seed: number, fn: (n: number, x: number, y: number) => [number, number, number]) {
  const r = rng(seed)
  const grid = Array.from({ length: period * period }, () => r())
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)]
  const img = g.createImageData(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * period
      const fy = (y / h) * period
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      let tx = fx - ix
      let ty = fy - iy
      tx = tx * tx * (3 - 2 * tx)
      ty = ty * ty * (3 - 2 * ty)
      const n = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty
      const [a, b, c] = fn(n, x, y)
      const i = (y * w + x) * 4
      img.data[i] = a
      img.data[i + 1] = b
      img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
}

/** oiled walnut: dark chocolate with long wavy grain (x along the grain) */
export function walnutMap() {
  return tile('ls-walnut', 256, 256, (g, w, h) => {
    noise(g, w, h, 6, 71, n => [66 + n * 30, 40 + n * 18, 26 + n * 12])
    const r = rng(23)
    for (let i = 0; i < 110; i++) {
      const y = r() * h
      const dark = r() > 0.35
      g.strokeStyle = dark ? `rgba(20,10,6,${0.12 + r() * 0.26})` : `rgba(150,96,58,${0.06 + r() * 0.12})`
      g.lineWidth = 0.6 + r() * 2.2
      g.beginPath()
      const amp = 2 + r() * 6
      const ph = r() * 6
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin((x / w) * Math.PI * 2 + ph) * amp
        if (x === 0) g.moveTo(x, yy)
        else g.lineTo(x, yy)
      }
      g.stroke()
    }
  })
}

/** brushed aluminium: fine straight streaks (x along the brushing) */
export function brushedMap() {
  return tile('ls-brushed', 256, 128, (g, w, h) => {
    g.fillStyle = '#c9c6c1'
    g.fillRect(0, 0, w, h)
    const r = rng(5)
    for (let i = 0; i < 700; i++) {
      const y = r() * h
      const v = 150 + r() * 105
      g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.18 + r() * 0.3})`
      g.fillRect(0, y, w, 0.5 + r() * 0.9)
    }
  })
}

/** spun aluminium (a reel flange, UV centred): fine concentric turning marks */
export function spunMap() {
  return tile(
    'ls-spun',
    512,
    512,
    (g, w, h) => {
      const cx = w / 2
      const cy = h / 2
      g.fillStyle = '#cfcac2'
      g.fillRect(0, 0, w, h)
      const r = rng(12)
      for (let rad = 1; rad < w * 0.72; rad += 0.8) {
        const v = 150 + r() * 105
        g.strokeStyle = `rgba(${v},${v - 3},${v - 8},${0.2 + r() * 0.35})`
        g.lineWidth = 0.7
        g.beginPath()
        g.arc(cx, cy, rad, 0, Math.PI * 2)
        g.stroke()
      }
    },
    { repeat: false },
  )
}

/** the edge of a wound tape pack (a cylinder cap, UV centred): fine concentric rings */
export function packEdgeMap() {
  return tile(
    'ls-pack',
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#2a1a12'
      g.fillRect(0, 0, w, h)
      const r = rng(31)
      const cx = w / 2
      const cy = h / 2
      for (let rad = 2; rad < w / 2; rad += 0.9) {
        const v = r()
        g.strokeStyle = v > 0.7 ? `rgba(120,78,50,${0.25 + r() * 0.25})` : `rgba(10,6,4,${0.2 + r() * 0.3})`
        g.lineWidth = 0.6
        g.beginPath()
        g.arc(cx, cy, rad, 0, Math.PI * 2)
        g.stroke()
      }
      // a slightly proud layer or two (a real pack is never perfect)
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = 'rgba(170,120,80,0.35)'
        g.lineWidth = 1.2
        g.beginPath()
        g.arc(cx, cy, 40 + r() * 80, 0, Math.PI * 2)
        g.stroke()
      }
    },
    { repeat: false },
  )
}

/* ------------------------------------------------------------------ VU meter */

/** the VU scale: positions 0..1 across the arc for the classic marks */
export const VU_MARKS: [number, string][] = [
  [0, '20'],
  [0.26, '10'],
  [0.38, '7'],
  [0.48, '5'],
  [0.6, '3'],
  [0.67, '2'],
  [0.735, '1'],
  [0.8, '0'],
  [0.865, '1'],
  [0.93, '2'],
  [1, '3'],
]
/** needle sweep (radians either side of vertical) */
export const VU_SWEEP = 0.78
/** the needle pivot sits this far below the face's bottom edge (face-height units) */
export const VU_PIVOT = 0.2

/**
 * A backlit VU face: warm cream paper, the black arc with its marks, the red
 * zone from 0 to +3, "VU" under the arc. Drawn for a face of aspect 4:3
 * whose needle pivots VU_PIVOT of the height below its bottom edge.
 */
export function vuFaceMap() {
  return tile(
    'ls-vu',
    320,
    240,
    (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h * 0.95, 10, w / 2, h * 0.7, w * 0.75)
      grad.addColorStop(0, '#fff3d6')
      grad.addColorStop(0.6, '#f6dfae')
      grad.addColorStop(1, '#d9b077')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      const px = w / 2
      const py = h * (1 + VU_PIVOT)
      const R = h * 0.98
      const ang = (t: number) => -Math.PI / 2 + (t * 2 - 1) * VU_SWEEP
      // the main arc
      g.lineCap = 'butt'
      g.strokeStyle = '#1a120c'
      g.lineWidth = 2.2
      g.beginPath()
      g.arc(px, py, R, ang(0), ang(0.8))
      g.stroke()
      g.strokeStyle = '#b4432f'
      g.lineWidth = 7
      g.beginPath()
      g.arc(px, py, R + 3, ang(0.8), ang(1))
      g.stroke()
      g.strokeStyle = '#1a120c'
      g.lineWidth = 2.2
      g.beginPath()
      g.arc(px, py, R, ang(0.8), ang(1))
      g.stroke()
      // ticks + numbers
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      for (const [t, label] of VU_MARKS) {
        const a = ang(t)
        const red = t > 0.79
        g.strokeStyle = red && t > 0.8 ? '#9a2a1c' : '#1a120c'
        g.lineWidth = 2.4
        g.beginPath()
        g.moveTo(px + Math.cos(a) * (R - 1), py + Math.sin(a) * (R - 1))
        g.lineTo(px + Math.cos(a) * (R + 13), py + Math.sin(a) * (R + 13))
        g.stroke()
        g.fillStyle = t > 0.8 ? '#9a2a1c' : '#1a120c'
        g.font = FONT.sans(t === 0.8 ? 21 : 17, 600)
        g.fillText(label, px + Math.cos(a) * (R + 30), py + Math.sin(a) * (R + 30))
      }
      // minor ticks
      for (let i = 0; i <= 40; i++) {
        const t = i / 40
        const a = ang(t)
        g.strokeStyle = t > 0.8 ? '#9a2a1c' : 'rgba(26,18,12,0.7)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(px + Math.cos(a) * R, py + Math.sin(a) * R)
        g.lineTo(px + Math.cos(a) * (R + 6), py + Math.sin(a) * (R + 6))
        g.stroke()
      }
      // − and + at the ends, VU below
      g.font = FONT.sans(22, 600)
      g.fillStyle = '#1a120c'
      g.fillText('−', w * 0.1, h * 0.2)
      g.fillStyle = '#9a2a1c'
      g.fillText('+', w * 0.9, h * 0.2)
      g.fillStyle = '#1a120c'
      g.font = FONT.display(40, 700)
      g.fillText('VU', w / 2, h * 0.64)
      // a faint vignette at the edges of the window
      const v = g.createLinearGradient(0, 0, 0, h)
      v.addColorStop(0, 'rgba(60,30,10,0.18)')
      v.addColorStop(0.2, 'rgba(60,30,10,0)')
      v.addColorStop(0.85, 'rgba(60,30,10,0)')
      v.addColorStop(1, 'rgba(60,30,10,0.28)')
      g.fillStyle = v
      g.fillRect(0, 0, w, h)
    },
    { repeat: false },
  )
}

/* ------------------------------------------------------------------ counter drums */

/**
 * A counter drum: `n` digits (0..n-1) stacked down the texture from the top
 * (v runs round the drum once the geometry's UVs are swapped, so digit i
 * sits at angle -2π(i+0.5)/n and counting up rolls the next digit up into
 * the window): white numerals on black.
 */
export function drumMap(n: number) {
  const cell = 64
  return tile(
    `ls-drum-${n}`,
    64,
    cell * n,
    (g, w, h) => {
      g.fillStyle = '#0b0a09'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#efe6d4'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.mono(46, 600)
      // a drum with fewer digits spreads them round the same circumference:
      // squash each so it reads the same height as a 10-digit drum's
      const sy = n / 10
      for (let i = 0; i < n; i++) {
        g.save()
        g.translate(w / 2, (i + 0.5) * cell)
        g.scale(0.92, sy)
        g.fillText(String(i), 0, 3)
        g.restore()
      }
    },
    { repeat: true },
  )
}

/* ------------------------------------------------------------------ legends */

/** the transport legends printed on the deck plate (a strip, transparent) */
export function legendMap(words: string[], px = 20) {
  return tile(
    'ls-legend-' + words.join('-') + px,
    512,
    48,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(236,226,206,0.9)'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.mono(px, 600)
      const n = words.length
      words.forEach((word, i) => g.fillText(word.split('').join(String.fromCharCode(8202)), ((i + 0.5) / n) * w, h / 2))
    },
    { repeat: false },
  )
}

/** a single small legend (transparent) */
export function wordMap(word: string, px = 26) {
  return tile(
    'ls-word-' + word,
    256,
    48,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(236,226,206,0.88)'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.mono(px, 600)
      g.fillText(word, w / 2, h / 2)
    },
    { repeat: false },
  )
}

/* ------------------------------------------------------------------ the track sheet */

/** rows of the track sheet (0..1 of the sheet's height, top = 0) — the marker lands on these */
export const SHEET_ROWS = VOL1.tracks.map((_, i) => 0.455 + i * 0.076)
export const SHEET_ROW_X: [number, number] = [0.06, 0.94]

/**
 * The track sheet taped inside the Volume ONE tape box lid: a cream studio
 * form (printed field names in mono caps) filled in by hand in marker —
 * the artist, the title, the studio and season, then the six songs and
 * their times.
 */
export function trackSheetMap() {
  return tile(
    'ls-sheet',
    512,
    512,
    (g, w, h) => {
      const r = rng(8)
      g.fillStyle = '#efe4c9'
      g.fillRect(0, 0, w, h)
      // paper tooth + age
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${120 + r() * 60},${90 + r() * 40},${50 + r() * 30},${0.03 + r() * 0.05})`
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1)
      }
      const edge = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75)
      edge.addColorStop(0, 'rgba(120,80,40,0)')
      edge.addColorStop(1, 'rgba(120,80,40,0.22)')
      g.fillStyle = edge
      g.fillRect(0, 0, w, h)
      // printed form (a warm brown-red ink, like an old studio's stock)
      const ink = '#7a3820'
      g.strokeStyle = ink
      g.fillStyle = ink
      g.lineWidth = 2
      g.strokeRect(16, 16, w - 32, h - 32)
      g.lineWidth = 1
      g.font = FONT.mono(13, 600)
      g.textBaseline = 'alphabetic'
      g.textAlign = 'left'
      const field = (label: string, y: number, x0 = 30, x1 = w - 30) => {
        g.fillText(label, x0, y)
        g.beginPath()
        g.moveTo(x0 + g.measureText(label).width + 8, y + 3)
        g.lineTo(x1, y + 3)
        g.stroke()
      }
      field('ARTIST', 62)
      field('TITLE', 112)
      field('STUDIO', 162)
      field('DATE', 212, 30, w / 2 - 10)
      field('TAPE', 212, w / 2 + 10)
      // the song table
      const top = 232
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(30, top)
      g.lineTo(w - 30, top)
      g.stroke()
      g.font = FONT.mono(12, 600)
      g.fillText('NO.', 34, top + 22)
      g.fillText('SONG', 84, top + 22)
      g.textAlign = 'right'
      g.fillText('TIME', w - 34, top + 22)
      g.textAlign = 'left'
      g.lineWidth = 1
      for (let i = 0; i <= 6; i++) {
        const y = SHEET_ROWS[0] * h - 0.038 * h + i * 0.076 * h + 0.038 * h
        g.beginPath()
        g.moveTo(30, y + 0.038 * h)
        g.lineTo(w - 30, y + 0.038 * h)
        g.stroke()
      }
      g.beginPath()
      g.moveTo(72, top + 6)
      g.lineTo(72, SHEET_ROWS[5] * h + 0.038 * h)
      g.moveTo(w - 96, top + 6)
      g.lineTo(w - 96, SHEET_ROWS[5] * h + 0.038 * h)
      g.stroke()

      // the hand: black marker (Caveat), a little uneven
      const hand = (text: string, x: number, y: number, px: number, rot = 0, color = '#1b1410', align: CanvasTextAlign = 'left') => {
        g.save()
        g.translate(x, y)
        g.rotate(rot)
        g.font = FONT.script(px, 640)
        g.fillStyle = color
        g.textAlign = align
        g.fillText(text, 0, 0)
        g.restore()
      }
      hand('Greg Jones Project', 100, 58, 34, -0.012)
      hand(VOL1.title, 90, 110, 44, -0.02, '#1b1410')
      hand('The Audio Lab · Millville NJ', 100, 158, 30, -0.008)
      hand('Summer 2016', 76, 208, 28, -0.01)
      hand('2 inch', w / 2 + 64, 208, 28, -0.015)
      VOL1.tracks.forEach((t, i) => {
        const y = SHEET_ROWS[i] * h + 10
        hand(String(t.n), 44, y, 30, -0.01)
        hand(t.title, 86, y, 31, (r() - 0.5) * 0.03)
        hand(t.time, w - 40, y, 30, (r() - 0.5) * 0.03, '#1b1410', 'right')
      })
    },
    { repeat: false },
  )
}

/** the grease-pencil loop the engineer drew round the song that's up (red, transparent) */
export function loopMap() {
  return tile(
    'ls-loop',
    512,
    64,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.strokeStyle = 'rgba(178,52,34,0.9)'
      g.lineWidth = 5
      g.lineCap = 'round'
      g.beginPath()
      // an uneven hand-drawn ellipse that overshoots its start
      const cx = w / 2
      const cy = h / 2
      for (let i = 0; i <= 72; i++) {
        const a = (i / 64) * Math.PI * 2 - 0.4
        const wob = 1 + 0.03 * Math.sin(a * 3 + 1)
        const x = cx + Math.cos(a) * (w / 2 - 8) * wob
        const y = cy + Math.sin(a) * (h / 2 - 7) * wob + (i / 72) * 3
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    },
    { repeat: false },
  )
}

/* ------------------------------------------------------------------ Like a Movie */

/** the disc's print: a warm silver face, a cream print ring, the title in type (no artwork) */
export function discMap() {
  return tile(
    'ls-disc',
    512,
    512,
    (g, w, h) => {
      const cx = w / 2
      const cy = h / 2
      g.clearRect(0, 0, w, h)
      // the mirror rim (outside the print)
      const rim = g.createRadialGradient(cx, cy, w * 0.2, cx, cy, w / 2)
      rim.addColorStop(0, '#bdb6aa')
      rim.addColorStop(0.7, '#e6dfd2')
      rim.addColorStop(1, '#a9a295')
      g.fillStyle = rim
      g.beginPath()
      g.arc(cx, cy, w / 2, 0, Math.PI * 2)
      g.fill()
      // the printed face
      g.fillStyle = '#e9dcc1'
      g.beginPath()
      g.arc(cx, cy, w * 0.47, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#7a3820'
      g.lineWidth = 3
      g.beginPath()
      g.arc(cx, cy, w * 0.44, 0, Math.PI * 2)
      g.stroke()
      // clear hub area
      g.fillStyle = '#c9c2b5'
      g.beginPath()
      g.arc(cx, cy, w * 0.16, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(0,0,0,0.25)'
      g.lineWidth = 1
      g.beginPath()
      g.arc(cx, cy, w * 0.16, 0, Math.PI * 2)
      g.stroke()
      // type
      g.fillStyle = '#1e140e'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.displayItalic(58, 560)
      g.fillText(MOVIE.title, cx, cy - w * 0.27)
      g.font = FONT.mono(20, 600)
      g.fillStyle = '#5a2c18'
      g.fillText(MOVIE.artist.toUpperCase().split('').join(' '), cx, cy + w * 0.25)
      g.font = FONT.mono(18, 500)
      g.fillText(String(MOVIE.year), cx, cy + w * 0.32)
    },
    { repeat: false },
  )
}

/** the booklet's back seen through the open lid: plain cream stock, the title small */
export function bookletMap() {
  return tile(
    'ls-booklet',
    256,
    256,
    (g, w, h) => {
      const r = rng(19)
      g.fillStyle = '#e8dcc2'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(110,80,50,${0.03 + r() * 0.04})`
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1)
      }
      g.strokeStyle = '#7a3820'
      g.lineWidth = 2
      g.strokeRect(14, 14, w - 28, h - 28)
      g.fillStyle = '#2a1a10'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.displayItalic(34, 560)
      g.fillText(MOVIE.title, w / 2, h * 0.44)
      g.font = FONT.mono(12, 600)
      g.fillStyle = '#7a3820'
      g.fillText(`${MOVIE.artist.toUpperCase()} · ${MOVIE.year}`, w / 2, h * 0.58)
    },
    { repeat: false },
  )
}

/* ------------------------------------------------------------------ the live cassette */

/** where the cassette window's hubs sit on the face (0..1 of width/height, top = 0) */
export const CASS_HUBS: [number, number][] = [
  [0.29, 0.46],
  [0.71, 0.46],
]
export const CASS_WINDOW = { x0: 0.24, x1: 0.76, y0: 0.37, y1: 0.55 }

/**
 * The audience tape's face: a black shell with five screws, a cream label
 * with a barn-red band and the side letter, hand-written in marker, a clear
 * window cut out (transparent) over the hubs, the head opening below.
 */
export function cassetteMap() {
  return tile(
    'ls-cass',
    512,
    320,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      const r = rng(4)
      // shell
      g.fillStyle = '#151312'
      rr(g, 0, 0, w, h, 18)
      g.fill()
      for (let i = 0; i < 1200; i++) {
        g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`
        g.fillRect(r() * w, r() * h, 1, 1)
      }
      // screws
      for (const [sx, sy] of [
        [0.035, 0.06],
        [0.965, 0.06],
        [0.035, 0.94],
        [0.965, 0.94],
        [0.5, 0.93],
      ]) {
        g.fillStyle = '#5c5854'
        g.beginPath()
        g.arc(sx * w, sy * h, 7, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#252321'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(sx * w - 5, sy * h)
        g.lineTo(sx * w + 5, sy * h)
        g.stroke()
      }
      // the label
      const lx = w * 0.07
      const ly = h * 0.08
      const lw = w * 0.86
      const lh = h * 0.6
      g.fillStyle = '#efe3c8'
      rr(g, lx, ly, lw, lh, 8)
      g.fill()
      g.fillStyle = '#b4432f'
      g.fillRect(lx, ly + lh * 0.2, lw, lh * 0.075)
      g.fillRect(lx, ly + lh * 0.9, lw, lh * 0.04)
      // side letter
      g.fillStyle = '#1b1410'
      g.font = FONT.display(40, 700)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('A', lx + 34, ly + lh * 0.12)
      // the hand
      const hand = (text: string, x: number, y: number, px: number, rot = 0) => {
        g.save()
        g.translate(x, y)
        g.rotate(rot)
        g.font = FONT.script(px, 640)
        g.fillStyle = '#1b1410'
        g.textAlign = 'center'
        g.fillText(text, 0, 0)
        g.restore()
      }
      hand('World Cafe Live · 12/14/14', w / 2 + 16, ly + lh * 0.1, 38, -0.012)
      hand('Philadelphia, PA', w * 0.26, ly + lh * 0.88, 24, -0.02)
      hand('audience', w * 0.78, ly + lh * 0.88, 24, 0.01)
      // the window (cut out: the hubs show through)
      const W = CASS_WINDOW
      g.save()
      g.globalCompositeOperation = 'destination-out'
      rr(g, W.x0 * w, W.y0 * h, (W.x1 - W.x0) * w, (W.y1 - W.y0) * h, 10)
      g.fill()
      g.restore()
      g.strokeStyle = 'rgba(20,16,14,0.8)'
      g.lineWidth = 3
      rr(g, W.x0 * w, W.y0 * h, (W.x1 - W.x0) * w, (W.y1 - W.y0) * h, 10)
      g.stroke()
      // head opening: a trapezoid, darker, with the pinch holes
      g.fillStyle = '#0c0b0a'
      g.beginPath()
      g.moveTo(w * 0.2, h)
      g.lineTo(w * 0.26, h * 0.76)
      g.lineTo(w * 0.74, h * 0.76)
      g.lineTo(w * 0.8, h)
      g.closePath()
      g.fill()
      g.fillStyle = '#2c2825'
      for (const x of [0.33, 0.67]) {
        g.beginPath()
        g.arc(x * w, h * 0.87, 9, 0, Math.PI * 2)
        g.fill()
      }
      for (const x of [0.43, 0.57]) g.fillRect(x * w - 8, h * 0.83, 16, 14)
    },
    { repeat: false },
  )
}

/** a small texture for plain type on the masking-tape strip on the meter bridge */
export function tapeStripMap(text: string) {
  return tile(
    'ls-strip-' + text,
    512,
    72,
    (g, w, h) => {
      const r = rng(text.length)
      g.clearRect(0, 0, w, h)
      g.beginPath()
      g.moveTo(6, 3)
      for (let x = 6; x <= w - 6; x += w / 16) g.lineTo(x, 2 + r() * 3)
      for (let y = 0; y <= h; y += h / 5) g.lineTo(w - 3 - r() * 7, y)
      for (let x = w - 6; x >= 6; x -= w / 16) g.lineTo(x, h - 2 - r() * 3)
      for (let y = h; y >= 0; y -= h / 5) g.lineTo(3 + r() * 7, y)
      g.closePath()
      g.fillStyle = '#e8d8b0'
      g.fill()
      g.save()
      g.clip()
      for (let y = 0; y < h; y += 3) {
        g.fillStyle = `rgba(140,110,70,${0.04 + r() * 0.04})`
        g.fillRect(0, y, w, 1)
      }
      g.restore()
      g.fillStyle = '#1b1410'
      g.font = FONT.script(46, 660)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, w / 2, h / 2 + 3)
    },
    { repeat: false },
  )
}
