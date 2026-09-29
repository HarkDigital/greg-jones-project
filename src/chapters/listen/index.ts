import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, rise, setRise, reveal } from '../../core/dom'
import { ALBUMS, LIVE, SECTIONS } from '../../content'
import { clamp, ease, lerp, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { fontsReady } from '../../kit/materials'
import { StoryClock } from '../../kit/pace'
import { GEL } from '../../world/World'
import { LAMP, buildSet, type ListenSet } from './machine'
import { StringLights } from './festoon'
import './listen.css'

/*
 * LISTEN · "Two-Inch Tape". A vintage 2-inch multitrack in the lamplight
 * (machine.ts): two big NAB reels, the tape over the heads, eight backlit VU
 * meters, walnut cheeks — and on the side table the Volume ONE tape box
 * lying open (the reel is on the machine; the track sheet is taped inside
 * the lid), the Like a Movie jewel case, the World Cafe Live audience tape.
 *
 * Laid out in vh (LEN = 5.6):
 *   0–0.19     under the cut: the machine and the table, wide
 *   0.19–0.72  "Listen" / Download the album! (landing/intro 0.07 = 0.39 vh)
 *   0.72–0.94  the push in to the machine; PLAY clunks in on track 1
 *   0.94–3.80  six songs, 0.5 vh each: on each, the reels wind (FF, or REW
 *              going back) while the counter rolls to the song's place on
 *              the tape, then PLAY — the reels turn, the needles move, the
 *              grease-pencil loop on the track sheet sits on the song
 *   3.80–4.66  STOP; down to the table: Like a Movie (1999), its 11 tracks
 *   4.66–5.42  along the table: the World Cafe Live audience cassette (the
 *              three live tracks, click to play — never autoplay)
 *   5.42–5.6   held, lit, into the cut
 *
 * PACING (WCAG 2.3.1): the camera, the song on the card, the counter and the
 * transport follow a StoryClock on a warped copy of `local` (a travel weighs
 * 1, a hold HOLD_W) at ≤ RATE units/s: a move between songs takes ≥ 0.55 s
 * and a new song lands at most ~1.1 times a second. After a fling the clock
 * may chase faster only BETWEEN songs (the camera barely moves there) while
 * the cards fade out and the transport stays wound (no PLAY lamp flicker);
 * the big moves (in to the machine, down to the table) keep the pace. Lamps
 * fade by time, the reels' wind is speed-capped (three windows never pass
 * faster than ~3 a second), the needles are VU-damped. Reduced motion /
 * Motion off: no idle spin, needles steady, no thump.
 *
 * SOUND (the UI's contract): hark:sfx 'click' when the wind starts, 'switch'
 * + 'tape' when PLAY clunks in, 'switch' on STOP — on real state changes
 * only, never on a teleport, ≥ 0.3 s apart. A gentle thump (glitch 0.1) only
 * when the machine first starts on song 1.
 */

const LEN = 5.6
const V = (vh: number) => vh / LEN
const VOL1 = ALBUMS[0]
const MOVIE = ALBUMS[1]
const NT = VOL1.tracks.length
const pad2 = (n: number) => String(n).padStart(2, '0')

// ---- the schedule (stations: 0 intro, 1..6 songs, 7 Like a Movie, 8 live)
const RISE = V(0.19)
const INTRO_OUT = V(0.72)
const A = V(0.94)
const TSLOT = V(0.5)
const TTRAV = V(0.14)
const TRAVEL: [number, number][] = [[INTRO_OUT, A]]
for (let i = 1; i < NT; i++) TRAVEL.push([A + i * TSLOT - TTRAV, A + i * TSLOT])
TRAVEL.push([V(3.8), V(4.04)])
TRAVEL.push([V(4.66), V(4.86)])
const OUTRO = V(5.42)
const MOVIE_K = NT + 1
const LIVE_K = NT + 2
const holdStart = (k: number) => (k === 0 ? 0 : TRAVEL[k - 1][1])
const holdEnd = (k: number) => (k < TRAVEL.length ? TRAVEL[k][0] : OUTRO)
const holdMid = (k: number) => (holdStart(k) + holdEnd(k)) / 2

// the clock's warp: a travel weighs 1 (the long moves more), a hold HOLD_W
const HOLD_W = 0.6
const RATE = 1.8
const WB: number[] = [0]
const WW: number[] = []
TRAVEL.forEach(([s, e], k) => {
  WB.push(s, e)
  const hold = k === 0 ? 0.8 : k > NT ? 0.7 : HOLD_W
  const trav = k === 0 ? 1.3 : k === NT ? 1.4 : k === NT + 1 ? 1.15 : 1
  WW.push(hold, trav)
})
WB.push(OUTRO, 1)
WW.push(0.7, 0.6)
const WU = WW.reduce((acc, w) => (acc.push(acc[acc.length - 1] + w), acc), [0])
function warp(local: number) {
  const l = clamp(local)
  let i = 0
  while (i < WW.length - 1 && l >= WB[i + 1]) i++
  return WU[i] + (WW[i] * (l - WB[i])) / Math.max(1e-6, WB[i + 1] - WB[i])
}
function unwarp(u: number) {
  const v = clamp(u, 0, WU[WU.length - 1])
  let i = 0
  while (i < WW.length - 1 && v >= WU[i + 1]) i++
  return WB[i] + ((WB[i + 1] - WB[i]) * (v - WU[i])) / WW[i]
}

/** where the story is: station k, travel t toward k+1 (0 while holding), hold progress h */
function where(q: number) {
  for (let k = 0; k < TRAVEL.length; k++) {
    const [s, e] = TRAVEL[k]
    if (q < s) {
      const hs = holdStart(k)
      return { k, t: 0, h: clamp((q - hs) / (s - hs)) }
    }
    if (q < e) return { k, t: (q - s) / (e - s), h: 1 }
  }
  const hs = holdStart(LIVE_K)
  return { k: LIVE_K, t: 0, h: clamp((q - hs) / (OUTRO - hs)) }
}

// ---- the tape: each song's place on the reel (s), and how far a hold plays into it
const STARTS: number[] = []
{
  let s = 0
  for (const t of VOL1.tracks) {
    STARTS.push(s)
    const [m, ss] = t.time.split(':').map(Number)
    s += m * 60 + ss
  }
}
const PLAY_ADV = 18
/** tempo per song for the needles (decorative motion only) */
const BPM = [92, 104, 88, 96, 100, 112]
const WALTZ = [false, false, true, false, false, false]

/** tape seconds at story position q */
function tapeAt(q: number) {
  const w = where(q)
  if (w.k === 0) return 0
  if (w.k <= NT) {
    const i = w.k - 1
    if (w.t > 0 && w.k < NT) return lerp(STARTS[i] + PLAY_ADV, STARTS[i + 1], ease.inOutCubic(w.t))
    return STARTS[i] + PLAY_ADV * (w.t > 0 ? 1 : w.h)
  }
  return STARTS[NT - 1] + PLAY_ADV
}

// ---- camera helpers
const UP = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
type Pose = { p: THREE.Vector3; t: THREE.Vector3; fov: number }
const pose = (): Pose => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 32 })

/**
 * Frame `focus` from direction (yaw, el) so a subject sizeW × sizeH (world)
 * fits the screen region [x0, y0, x1, y1] (px, y down), centred on it.
 */
function frameIn(out: Pose, W: number, H: number, focus: THREE.Vector3, yaw: number, el: number, fov: number, sizeW: number, sizeH: number, R: number[], push = 1) {
  const aspect = W / H
  const tv = Math.tan((fov * Math.PI) / 360)
  const rw = Math.max(0.12, (R[2] - R[0]) / W)
  const rh = Math.max(0.12, (R[3] - R[1]) / H)
  const dist = Math.max(sizeW / (2 * tv * aspect * rw), sizeH / (2 * tv * rh)) * push
  const fx = (R[0] + R[2]) / 2 / W
  const fy = (R[1] + R[3]) / 2 / H
  const dir = _dir.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el))
  _right.crossVectors(UP, dir).normalize()
  _up.crossVectors(dir, _right).normalize()
  const hgt = 2 * dist * tv
  out.t
    .copy(focus)
    .addScaledVector(_right, -(fx - 0.5) * hgt * aspect)
    .addScaledVector(_up, (fy - 0.5) * hgt)
  out.p.copy(out.t).addScaledVector(dir, dist)
  out.fov = fov
}
function lerpPose(out: Pose, a: Pose, b: Pose, k: number) {
  out.p.lerpVectors(a.p, b.p, k)
  out.t.lerpVectors(a.t, b.t, k)
  out.fov = lerp(a.fov, b.fov, k)
}

const approach = (x: number, to: number, step: number) => (x < to ? Math.min(to, x + step) : Math.max(to, x - step))

export default function create(): Chapter {
  const group = new THREE.Group()
  let set: ListenSet | null = null
  let lights: StringLights | null = null

  // DOM
  let stage: HTMLElement
  let intro: HTMLElement, introTitle: HTMLElement
  let album: HTMLElement
  let nows: HTMLElement[] = []
  let rows: HTMLElement[] = []
  let countNum: HTMLElement
  let movie: HTMLElement
  let live: HTMLElement
  const box = { introW: 520, introH: 200, introB: 300, cardW: 420, cardH: 520, cardTop: 300, movieW: 420, movieH: 420, movieTop: 300, liveW: 420, liveH: 320, liveTop: 400 }

  // story state
  const clock = new StoryClock({ rate: RATE, snap: 1.5 })
  let q = NaN
  let snapNext = true
  let now = 0
  let shownTrack = -1
  const trackK = new Array<number>(NT).fill(0)
  let prevTape = NaN
  let windDir = 1
  let reelA = 0
  let reelB = 0
  const lamps = [0, 0, 1, 0, 0]
  const needle = new Array<number>(8).fill(0)
  let transportPrev = -1
  let thumpAt = -10
  let sfxAt = -10
  let busyFx = false
  let behindU = 0
  let prevU = NaN
  let hideK = 1

  // audio (click-to-play live tracks; never autoplay)
  let audio: HTMLAudioElement | null = null
  let audioIdx = -1
  let audioOn = false
  let cassAngle = 0
  const liveRows: { row: HTMLElement; btn: HTMLButtonElement; bar: HTMLElement }[] = []

  const poses = { key: '', stations: [] as Pose[], outro: pose() }
  const tmp = pose()
  const tmpB = pose()

  function regions(W: number, H: number) {
    const portrait = H > W * 1.05
    const short = !portrait && H <= 500
    const gutter = clamp(W * 0.034, 16, 48)
    const safeTop = short ? 52 : clamp(H * 0.105, 80, 112)
    const safeBot = short ? 52 : portrait && W <= 560 ? 96 : clamp(H * 0.105, 82, 110)
    const gap = short ? 18 : 40
    /** the free region beside (landscape) or above (portrait) a card */
    const beside = (cardW: number, cardTop: number) =>
      portrait
        ? [gutter, safeTop + 6, W - gutter, Math.max(safeTop + 140, cardTop - 14)]
        : [gutter + cardW + gap, safeTop + (short ? 2 : 8), W - gutter - (short ? 4 : 14), H - safeBot - (short ? 2 : 10)]
    return { portrait, short, gutter, safeTop, safeBot, beside }
  }

  function buildPoses(frame: Frame) {
    if (!set) return
    const W = frame.width || 1440
    const H = frame.height || 900
    const key = `${W}x${H}:${Object.values(box).map(v => Math.round(v)).join(',')}`
    if (key === poses.key) return
    poses.key = key
    const R = regions(W, H)
    const at = set.at
    const st: Pose[] = []
    // 0 · the intro: the machine and the side table, the headline over the dark room
    {
      const P = pose()
      const reg = R.portrait
        ? [R.gutter, box.introB + 10, W - R.gutter, H - R.safeBot - 6]
        : [R.gutter + Math.min(box.introW, W * 0.46) + (R.short ? 10 : 24), R.safeTop + 6, W - R.gutter, H - R.safeBot - 6]
      const f = R.portrait ? new THREE.Vector3(1.9, 11.4, 0) : new THREE.Vector3(2.9, 11.2, 0)
      frameIn(P, W, H, f, R.portrait ? 0.3 : 0.34, 0.1, 34, R.portrait ? 13.4 : 16.2, R.portrait ? 9.5 : 10.8, reg)
      st.push(P)
    }
    // 1..6 · the songs: the machine front, the box's lid at its right shoulder
    for (let i = 0; i < NT; i++) {
      const P = pose()
      const reg = R.beside(box.cardW, box.cardTop)
      const u = i / (NT - 1)
      const f = new THREE.Vector3(lerp(1.2, 1.7, u), 12.1, 0.3)
      const yaw = lerp(0.3, 0.44, u)
      frameIn(P, W, H, f, yaw, 0.09, 32, R.portrait ? 10.4 : 13.4, R.portrait ? 9.0 : 9.2, reg)
      st.push(P)
    }
    // 7 · Like a Movie: looking down at the open jewel case
    {
      const P = pose()
      const reg = R.beside(box.movieW, box.movieTop)
      frameIn(P, W, H, at.jewel, 0.26, 0.78, 30, R.portrait ? 3.2 : 3.55, R.portrait ? 2.1 : 2.4, reg)
      st.push(P)
    }
    // 8 · the live tape: the cassette close, the box and the case at the edges
    {
      const P = pose()
      const reg = R.beside(box.liveW, box.liveTop)
      frameIn(P, W, H, at.cassette, -0.2, 0.7, 30, R.portrait ? 1.75 : 2.0, R.portrait ? 1.3 : 1.4, reg)
      st.push(P)
    }
    poses.stations = st
    // out: a gentle push toward the cassette's window (the soundhole cut takes it)
    const O = poses.outro
    O.p.copy(st[LIVE_K].p).lerp(at.cassette, 0.22)
    O.t.copy(st[LIVE_K].t)
    O.fov = st[LIVE_K].fov
  }

  /** the pose held at station k, hold progress h (a slow push) */
  function holdPose(out: Pose, k: number, h: number) {
    const P = poses.stations[k]
    out.p.copy(P.p)
    out.t.copy(P.t)
    out.fov = P.fov
    const push = k === 0 ? 0.07 : k <= NT ? 0.035 : 0.05
    out.p.lerp(out.t, push * h)
  }

  /** the transport's sounds (UI sound contract: hark:sfx {kind, level}) */
  const sfx = (kind: string, level = 0.7) => {
    try {
      window.dispatchEvent(new CustomEvent('hark:sfx', { detail: { kind, level } }))
    } catch {
      /* old browsers */
    }
  }

  /** the needles' music: a beat envelope + two slow partials per channel (decorative) */
  const vuTarget = (i: number, t: number, song: number) => {
    const bpm = BPM[song] ?? 96
    const beat = (t * bpm) / 60 + i * 0.07
    const ph = beat - Math.floor(beat)
    const bar = Math.floor(beat) % (WALTZ[song] ? 3 : 4)
    const accent = bar === 0 ? 1 : WALTZ[song] ? 0.45 : bar === 2 ? 0.7 : 0.5
    const kick = Math.exp(-ph * 5) * accent
    const drums = i < 3 ? 1 : 0.35
    const base = [0.5, 0.46, 0.52, 0.6, 0.58, 0.62, 0.55, 0.64][i]
    const swell = 0.07 * Math.sin(t * (0.9 + i * 0.13) + i * 1.7) + 0.05 * Math.sin(t * (2.3 + i * 0.21) + i)
    return clamp(base + kick * 0.24 * drums + swell, 0, 0.97)
  }

  const stopAudio = () => {
    if (audio) {
      try {
        audio.pause()
      } catch {
        /* ignore */
      }
    }
    audioOn = false
    liveRows.forEach(r => {
      r.row.classList.remove('is-playing')
      r.btn.setAttribute('aria-label', `Play ${LIVE.tracks[liveRows.indexOf(r)].title}`)
    })
  }
  const toggleAudio = (i: number) => {
    const t = LIVE.tracks[i]
    if (!audio) {
      audio = new Audio()
      audio.preload = 'none'
      audio.addEventListener('ended', () => stopAudio())
      audio.addEventListener('pause', () => {
        audioOn = false
        liveRows.forEach(r => r.row.classList.remove('is-playing'))
      })
      audio.addEventListener('playing', () => {
        audioOn = true
        liveRows.forEach((r, j) => r.row.classList.toggle('is-playing', j === audioIdx))
      })
      audio.addEventListener('timeupdate', () => {
        if (!audio || audioIdx < 0) return
        const k = audio.duration > 0 ? audio.currentTime / audio.duration : 0
        liveRows[audioIdx]?.bar.style.setProperty('--k', k.toFixed(4))
      })
      audio.addEventListener('error', () => {
        if (audioIdx >= 0) liveRows[audioIdx]?.row.classList.add('is-error')
        stopAudio()
      })
    }
    if (audioIdx === i && !audio.paused) {
      audio.pause()
      return
    }
    if (audioIdx !== i) {
      liveRows.forEach(r => r.bar.style.setProperty('--k', '0'))
      audioIdx = i
      audio.src = t.url
    }
    liveRows.forEach((r, j) => r.row.classList.toggle('is-loading', j === i))
    audio.play().then(
      () => liveRows.forEach(r => r.row.classList.remove('is-loading')),
      () => {
        liveRows.forEach(r => r.row.classList.remove('is-loading'))
        liveRows[i]?.row.classList.add('is-error')
      },
    )
    liveRows[i].btn.setAttribute('aria-label', `Pause ${t.title}`)
  }

  function buildDom(ctx: ChapterContext) {
    stage = ctx.stage
    // ---- intro
    intro = el('div', 'ls-intro', undefined, stage)
    el('p', 'hud-eyebrow', SECTIONS.listen.eyebrow, intro)
    introTitle = rise(el('h2', 'hud-h2 ls-head', undefined, intro), 'Download the <em>album!</em>')
    el('p', 'hud-label ls-sub', `${VOL1.title} · ${VOL1.kind} · ${VOL1.year}`, intro)

    // ---- Volume ONE: the song that's up + the album block
    album = el('div', 'hud-panel ls-card ls-album', undefined, stage)
    const top = el('div', 'ls-top', undefined, album)
    el('p', 'hud-label ls-kicker', `${VOL1.title} · ${VOL1.kind} · ${VOL1.year}`, top)
    const count = el('p', 'hud-label ls-count', undefined, top)
    count.append('Track ')
    countNum = el('b', '', '01', count)
    count.append(` / ${pad2(NT)}`)
    const stack = el('div', 'ls-now-stack', undefined, album)
    nows = VOL1.tracks.map(t => {
      const n = el('div', 'ls-now', undefined, stack)
      el('span', 'ls-num hud-lit', pad2(t.n), n)
      el('h3', 'ls-title', t.title, n)
      el('span', 'ls-time', t.time, n)
      reveal(n, 0, 0)
      return n
    })
    const list = el('ol', 'ls-list', undefined, album)
    rows = VOL1.tracks.map((t, i) => {
      const li = el('li', '', undefined, list)
      const b = el('button', 'ls-row', undefined, li)
      b.type = 'button'
      el('span', 'ls-row-n', String(t.n), b)
      el('span', 'ls-row-t', t.title, b)
      el('span', 'ls-row-d', t.time, b)
      b.addEventListener('click', () => {
        const hark = window.__hark
        if (hark) hark.land('listen', true, holdMid(i + 1))
      })
      return li
    })
    el('p', 'hud-body ls-notes', `${VOL1.notes[0]} ${VOL1.notes[1]}`, album)
    el('p', 'hud-body ls-avail', VOL1.notes[2], album)
    const links = el('div', 'ls-links', undefined, album)
    for (const l of VOL1.links) {
      const a = el('a', 'ls-link', undefined, links)
      a.href = l.url
      a.target = '_blank'
      a.rel = 'noopener'
      el('span', '', l.name, a)
      el('span', 'ls-arrow', '↗', a).setAttribute('aria-hidden', 'true')
    }
    el('p', 'ls-cd', VOL1.notes[3], album)

    // ---- Like a Movie
    movie = el('div', 'hud-panel ls-card ls-movie', undefined, stage)
    el('p', 'hud-label ls-kicker', `${MOVIE.artist} · ${MOVIE.kind} · ${MOVIE.year}`, movie)
    el('h3', 'ls-title ls-title--big', MOVIE.title, movie)
    el('p', 'hud-body ls-lede', MOVIE.notes[0], movie)
    const ml = el('ol', 'ls-list ls-list--two', undefined, movie)
    for (const t of MOVIE.tracks) {
      const li = el('li', '', undefined, ml)
      const s = el('span', 'ls-row', undefined, li)
      el('span', 'ls-row-n', String(t.n), s)
      el('span', 'ls-row-t', t.title, s)
      el('span', 'ls-row-d', t.time, s)
    }
    const mlinks = el('div', 'ls-links', undefined, movie)
    for (const l of MOVIE.links) {
      const a = el('a', 'ls-link', undefined, mlinks)
      a.href = l.url
      a.target = '_blank'
      a.rel = 'noopener'
      el('span', '', l.name, a)
      el('span', 'ls-arrow', '↗', a).setAttribute('aria-hidden', 'true')
    }

    // ---- the live tape
    live = el('div', 'hud-panel ls-card ls-live', undefined, stage)
    el('p', 'hud-label ls-kicker', 'Live · 12/14/14', live)
    el('h3', 'ls-title ls-title--long', LIVE.title, live)
    const ul = el('ul', 'ls-tracks', undefined, live)
    LIVE.tracks.forEach((t, i) => {
      const li = el('li', 'ls-track', undefined, ul)
      const btn = el('button', 'ls-play', undefined, li)
      btn.type = 'button'
      btn.setAttribute('aria-label', `Play ${t.title}`)
      el('span', 'ls-play-i', undefined, btn).setAttribute('aria-hidden', 'true')
      const body = el('div', 'ls-track-b', undefined, li)
      const a = el('a', 'ls-track-a', undefined, body)
      a.href = t.url
      a.target = '_blank'
      a.rel = 'noopener'
      el('span', '', t.title, a)
      el('span', 'ls-arrow', ' ↗', a).setAttribute('aria-hidden', 'true')
      const bar = el('span', 'ls-bar', undefined, body)
      el('i', '', undefined, bar)
      btn.addEventListener('click', () => toggleAudio(i))
      liveRows.push({ row: li, btn, bar })
    })

    for (const n of [intro, album, movie, live]) reveal(n, 0, 0)

    const measure = () => {
      const sr = stage.getBoundingClientRect()
      const r = (n: HTMLElement) => n.getBoundingClientRect()
      const ri = r(intro)
      box.introW = ri.width || box.introW
      box.introH = ri.height || box.introH
      box.introB = ri.bottom - sr.top || box.introB
      const ra = r(album)
      box.cardW = ra.width || box.cardW
      box.cardH = ra.height || box.cardH
      box.cardTop = ra.top - sr.top || box.cardTop
      const rm = r(movie)
      box.movieW = rm.width || box.movieW
      box.movieH = rm.height || box.movieH
      box.movieTop = rm.top - sr.top || box.movieTop
      const rl = r(live)
      box.liveW = rl.width || box.liveW
      box.liveH = rl.height || box.liveH
      box.liveTop = rl.top - sr.top || box.liveTop
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure())
      for (const n of [stage, intro, album, movie, live]) ro.observe(n)
    }
    document.fonts?.ready.then(measure, () => {})
  }

  return {
    id: 'listen',
    group,
    anchors: [...VOL1.tracks.map((_, i) => holdMid(i + 1)), holdMid(MOVIE_K), holdMid(LIVE_K)],
    busy: () => clock.busy || busyFx,

    async init(ctx) {
      await fontsReady()
      set = await buildSet({ mobile: ctx.mobile, yieldFn: nextFrame })
      group.add(set.root)
      // string lights over the corner: one strand behind the machine, one over it, one out over the room
      lights = new StringLights([
        { a: new THREE.Vector3(-11, 21.2, -8), b: new THREE.Vector3(15, 20.6, -6.5), sag: 1.6, spacing: 1.3 },
        { a: new THREE.Vector3(-9, 20.2, -2.5), b: new THREE.Vector3(16, 19.8, -1.2), sag: 1.3, spacing: 1.25 },
        { a: new THREE.Vector3(-5, 19.4, 8), b: new THREE.Vector3(17, 19.2, 4.5), sag: 1.1, spacing: 1.2 },
      ])
      group.add(lights.mesh)
      await nextFrame()
      buildDom(ctx)
    },

    onEnter() {
      clock.reset()
      snapNext = true
      prevU = NaN
      behindU = 0
    },
    onLeave() {
      stopAudio()
    },

    update(local, frame, ctx) {
      if (!set) return
      const dt = frame.dt
      now += dt
      const calm = frame.reducedMotion || !!frame.still
      const s = set

      // ---- pacing: q is the clock's view of local (warped: travels ≥ 0.55 s)
      const uT = warp(local)
      // a jump inside the chapter (a nav stop, a screenshot) snaps the clock: treat it as a teleport
      const jumped = Number.isFinite(prevU) && Math.abs(uT - prevU) > 1.5
      prevU = uT
      behindU = Number.isFinite(clock.value) && !snapNext && !jumped ? Math.abs(uT - clock.value) : 0
      // far behind after a fling, between two songs (where the camera barely moves):
      // chase faster while the copy hides. The big moves (in to the machine, down to
      // the table, along it) always keep the reading pace.
      const atK = Number.isFinite(clock.value) ? where(unwarp(clock.value)).k : 0
      const betweenSongs = atK >= 1 && atK < NT
      clock.rate = betweenSongs ? RATE * clamp(behindU / 2.4, 1, 3) : RATE
      const uC = clock.update(uT, dt)
      q = unwarp(uC)
      const teleport = snapNext || jumped || !Number.isFinite(prevTape)
      snapNext = false
      const w = where(q)
      const traveling = behindU > 2.2

      // ---- the tape: counter, packs, the reels
      const tape = tapeAt(q)
      s.setTape(tape)
      const dTape = teleport ? 0 : tape - prevTape
      prevTape = tape
      if (Math.abs(dTape) > 0.02) windDir = dTape > 0 ? 1 : -1
      const onSong = w.k >= 1 && w.k <= NT && w.t === 0 && !traveling
      // surface travel this frame: the wind (speed-capped) + the play (idle, time)
      const [rs, rt] = s.packs
      const MAXW = Math.PI * 2 * 0.85
      let travel = clamp(dTape * 0.014, -MAXW * dt * Math.min(rs, rt), MAXW * dt * Math.min(rs, rt))
      if (onSong && !calm) travel += 0.3 * dt
      reelA -= travel / rs
      reelB -= travel / rt
      s.setReels(reelA, reelB)

      // ---- the transport lamps (fade by time)
      // while the clock chases a fling through the songs the transport stays wound (no PLAY flicker)
      const inWind = w.k >= 1 && w.k <= NT && (w.t > 0 || traveling) && !(w.k === NT && w.t > 0)
      const target = [0, 0, 0, 0, 0]
      if (w.k === 0) target[w.t > 0.72 ? LAMP.play : LAMP.stop] = 1
      else if (inWind) target[windDir > 0 ? LAMP.ff : LAMP.rew] = 1
      else if (w.k <= NT && !(w.k === NT && w.t > 0.2)) target[LAMP.play] = 1
      else target[LAMP.stop] = 1
      busyFx = false
      for (let i = 0; i < 5; i++) {
        lamps[i] = teleport ? target[i] : approach(lamps[i], target[i], dt / 0.14)
        if (lamps[i] !== target[i]) busyFx = true
      }
      s.setLamps(lamps)

      // the transport's sounds, on a change of state (never on a teleport, rate-limited by
      // time): PLAY clunks in and the tape starts; FF/REW click; STOP. On the first song
      // only, PLAY also gives a gentle thump.
      const transport = target.indexOf(1)
      if (!teleport && transportPrev >= 0 && transport !== transportPrev && !traveling && now - sfxAt > 0.3) {
        sfxAt = now
        if (transport === LAMP.play) {
          sfx('switch', 0.75)
          sfx('tape', 0.55)
          if (w.k <= 1 && !calm && now - thumpAt > 1.2) thumpAt = now
        } else if (transport === LAMP.ff || transport === LAMP.rew) sfx('click', 0.5)
        else sfx('switch', 0.6)
      }
      transportPrev = transport
      const th = now - thumpAt
      if (!calm && th >= 0 && th < 0.24) ctx.post.params.glitch = 0.1 * (1 - th / 0.24) * (1 - th / 0.24)

      // ---- the needles: music while playing, at rest otherwise (VU ballistics)
      const song = clamp(w.k - 1, 0, NT - 1)
      for (let i = 0; i < 8; i++) {
        let tgt = 0
        if (onSong) tgt = calm ? [0.58, 0.54, 0.6, 0.64, 0.62, 0.66, 0.6, 0.68][i] : vuTarget(i, frame.time, song)
        needle[i] = teleport ? tgt : needle[i] + (tgt - needle[i]) * (1 - Math.exp(-dt * 7))
        if (Math.abs(needle[i] - tgt) > 0.004) busyFx = true
      }
      s.setVu(needle)
      s.setBacklight(1)

      // ---- the grease-pencil loop on the track sheet
      let row = 0
      if (w.k >= 1 && w.k <= NT) row = w.k - 1 + (w.t > 0 && w.k < NT ? ease.inOutCubic(w.t) : 0)
      else if (w.k > NT) row = NT - 1
      const loopVis = w.k === 0 ? smoothstep(0.35, 0.9, w.t) : w.k === NT ? 1 - smoothstep(0.1, 0.5, w.t) : w.k > NT ? 0 : 1
      s.setMarker(row, loopVis)

      // ---- the live tape: its hubs turn while a track plays
      if (audioOn && !calm) cassAngle -= dt * 2.4
      s.setCassette(cassAngle)
      if (audioOn) busyFx = true

      // ---- light
      const p = ctx.world.params
      // blend the lamp's aim between stations (as the camera travels)
      const aimFor = (k: number, out: THREE.Vector3) => {
        if (k === 0) return out.set(1.8, 10.8, 0.2)
        if (k <= NT) return out.set(0.2, 11.9, 0.5)
        return out.copy(k === MOVIE_K ? s.at.jewel : s.at.cassette)
      }
      aimFor(w.k, _a)
      if (w.t > 0) {
        aimFor(w.k + 1, _b)
        _a.lerp(_b, ease.inOutCubic(w.t))
      }
      const onTable = w.k > NT ? 1 : w.k === NT ? ease.inOutCubic(w.t) : 0
      p.spotAt.copy(_a)
      lights?.update(ctx.camera, ctx.renderer, ctx.camera.position.distanceTo(_a), lerp(0.95, 0.6, onTable))
      p.spotPos.set(_a.x + lerp(4.5, 2.5, onTable), _a.y + lerp(15, 13, onTable), _a.z + lerp(12, 8, onTable))
      const introK = w.k === 0 ? 1 - ease.inOutCubic(w.t) : 0
      p.spotAngle = lerp(lerp(0.3, 0.215, 1 - introK), 0.11, onTable)
      p.spotPenumbra = 0.75
      p.spot = lerp(1.5, 1.1, onTable)
      p.spotColor = GEL.tungsten
      p.haze = lerp(0.42, 0.3, onTable)
      p.hazeColor = '#9a5a2e'
      p.hazeY = lerp(0.05, -0.2, onTable)
      p.bulbs = 0.95
      p.bokeh = 0.2
      p.rimA = 0.75
      p.rimAColor = GEL.amber
      p.rimADir.set(-0.8, 0.6, -0.9)
      p.rimB = 0.22
      p.rimBColor = GEL.dusk
      p.rimBDir.set(0.9, 0.4, -0.8)
      p.fill = 0.07
      p.env = 0.85
      p.envTurn = 0.4 + (calm ? 0 : Math.sin(frame.time * 0.12) * 0.08)
      const pp = ctx.post.params
      pp.bloomThreshold = 0.92
      pp.bloomStrength = 0.32
      pp.bloomRadius = 0.5
      pp.vignette = 0.58
      pp.warmth = 1

      // ---- copy (from q, so the words and the camera agree)
      // the eyebrow + sub arrive with the headline, as the cut clears
      const introVis = smoothstep(RISE - V(0.005), RISE + V(0.03), q) * (1 - smoothstep(INTRO_OUT + V(0.01), INTRO_OUT + V(0.08), q))
      reveal(intro, introVis, 0)
      setRise(introTitle, q > RISE && q < INTRO_OUT + V(0.08))
      hideK = teleport ? (traveling ? 0 : 1) : approach(hideK, traveling ? 0 : 1, dt / 0.25)
      const hide = hideK
      if (hideK !== (traveling ? 0 : 1)) busyFx = true
      // the album card: up as the camera arrives at the machine, gone early in the move to the table
      const albumVis =
        smoothstep(TRAVEL[0][0] + (TRAVEL[0][1] - TRAVEL[0][0]) * 0.55, TRAVEL[0][1], q) *
        (1 - smoothstep(TRAVEL[NT][0], TRAVEL[NT][0] + (TRAVEL[NT][1] - TRAVEL[NT][0]) * 0.35, q))
      reveal(album, albumVis * hide, 0)
      // the song on the card: switches at mid-travel, cross-faded (a fade, not motion)
      const cur = clamp(w.k <= 1 ? 0 : w.k > NT ? NT - 1 : w.k - 1 + (w.t >= 0.5 && w.k < NT ? 1 : 0), 0, NT - 1)
      for (let i = 0; i < NT; i++) {
        const tg = i === cur ? 1 : 0
        trackK[i] = teleport || albumVis < 0.02 ? tg : approach(trackK[i], tg, dt / 0.22)
        if (trackK[i] !== tg) busyFx = true
        reveal(nows[i], trackK[i], 0)
      }
      if (cur !== shownTrack) {
        shownTrack = cur
        countNum.textContent = pad2(cur + 1)
        rows.forEach((r, i) => r.classList.toggle('is-on', i === cur))
      }
      const hv = (k: number) => {
        const [s0, e0] = TRAVEL[k - 1]
        const tin = clamp((q - s0) / (e0 - s0))
        const out = k < TRAVEL.length ? clamp((q - TRAVEL[k][0]) / (TRAVEL[k][1] - TRAVEL[k][0])) : 0
        return smoothstep(0.55, 1, tin) * (1 - smoothstep(0.0, 0.35, out))
      }
      reveal(movie, hv(MOVIE_K) * hide, 0)
      reveal(live, hv(LIVE_K) * hide, 0)
      if (hv(LIVE_K) < 0.01 && audioOn) stopAudio()
    },

    camera(local, frame, out: CameraPose) {
      buildPoses(frame)
      if (!poses.stations.length) {
        out.position.set(6, 13, 20)
        out.target.set(2, 11, 0)
        out.fov = 34
        return
      }
      const at = Number.isFinite(q) ? q : local
      const w = where(at)
      const P = tmp
      if (w.t > 0) {
        holdPose(P, w.k, 1)
        holdPose(tmpB, w.k + 1, 0)
        const e = ease.inOutCubic(w.t)
        if (w.k === NT) {
          // off the machine and down to the table: the eye leads, the camera
          // follows in an arc that stands back from the deck
          const et = ease.inOutCubic(clamp(w.t * 1.3))
          P.p.lerp(tmpB.p, e)
          P.t.lerp(tmpB.t, et)
          P.fov = lerp(P.fov, tmpB.fov, e)
          _a.subVectors(P.p, P.t).normalize()
          const arc = Math.sin(Math.PI * w.t)
          P.p.addScaledVector(_a, arc * 2.6)
          P.p.y += arc * 1.2
        } else {
          lerpPose(P, P, tmpB, e)
          P.p.y += Math.sin(Math.PI * w.t) * (w.k === 0 ? 0.5 : 0.15)
        }
      } else holdPose(P, w.k, w.h)
      if (at > OUTRO) {
        const o = ease.inOutCubic(clamp((at - OUTRO) / (1 - OUTRO)))
        lerpPose(P, P, poses.outro, o)
      }
      out.position.copy(P.p)
      out.target.copy(P.t)
      out.fov = P.fov
      out.parallax = w.k > NT ? 0.04 : 0.14
    },
  }
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
