import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, rise, setRise } from '../../core/dom'
import { clamp, lerp, segment, smoothstep } from '../../core/math'
import { BAND, BIO, EPK, SECTIONS, youtubeUrl } from '../../content'
import { StoryClock } from '../../kit/pace'
import { Ring } from '../../kit/strings'
import { GEL } from '../../world/World'
import { buildSet, type BandSet, type Spot } from './set'
import './band.css'

/*
 * THE BAND (band) — "A sound and style that's all their own."
 *
 * The corner stage set for the trio, and nobody on it yet: Greg's acoustic
 * on its stand by the stool (front and centre), Tom Buckley's kit on a rug
 * on a low drum riser behind, David Tracey's bass and cab stage left, a mic
 * at every spot (all three sing). One lamp moves position to position as the
 * card names each player; then over to the corner for the current happenings — an ON
 * AIR box that lights (steady) for the Radio104.5 session, a clapperboard
 * for the House Not Home video, and a tabletop radio whose needle slides
 * from 104.5 down to 93.7 for the WSTW Home Town Heroes nominations — and
 * back out to the whole stage for the closing line.
 *
 *   0.00–0.13   intro: the whole stage in the lamplight, eyebrow + headline
 *               + the EPK's first line (landing / intro 0.08)
 *   0.13–0.895  six stops (anchors = slot centres, ~0.61 vh each):
 *               0–2 the three players · 3–5 the three happenings
 *   0.895–1.00  closing: back out to the whole stage, EPK.closing; a slow
 *               push for the soundhole cut (the lamp stays up: a lit frame)
 *
 * PACING (WCAG 2.3.1): the stop, the lamp, the ON AIR box, the radio's dial
 * and the camera all follow a StoryClock in slot units (≤ 1.1 changes a
 * second); the camera then glides between stops on a critically damped
 * spring (~1 s); everything snaps on teleports. The one thump (the kick,
 * on arriving at the kit) is time-limited and never plays when calm.
 */

/** stops: the players, then the happenings (the srContent anchor contract) */
const P = BAND.length
const N = P + EPK.happenings.length
const A0 = 0.13
const A1 = 0.895
const SPAN = (A1 - A0) / N
const HYST = 0.06
const INTRO_Q = 0.7
const OUT_Q = 0.5
const PACE = 1.1
const PUSH0 = 0.95
const toQ = (local: number) =>
  local < A0 ? -INTRO_Q * (1 - local / A0) : local <= A1 ? (local - A0) / SPAN : N + (OUT_Q * (local - A1)) / (1 - A1)

/** poses: 0 intro · 1–3 players (Greg, David, Tom) · 4–6 happenings · 7 closing · 8 the push for the cut */
interface View {
  yaw: number
  pitch: number
  /** the lamp's cone and level */
  cone: number
  lamp: number
}
const VIEWS: View[] = [
  { yaw: -0.42, pitch: 0.13, cone: 0.56, lamp: 1.25 },
  { yaw: -0.14, pitch: 0.1, cone: 0.24, lamp: 1.1 },
  { yaw: -0.12, pitch: 0.1, cone: 0.26, lamp: 1.1 },
  { yaw: 0.34, pitch: 0.36, cone: 0.28, lamp: 1.05 },
  { yaw: -0.32, pitch: 0.06, cone: 0.2, lamp: 0.7 },
  { yaw: -0.3, pitch: 0.28, cone: 0.15, lamp: 0.9 },
  { yaw: -0.3, pitch: 0.14, cone: 0.17, lamp: 0.85 },
  { yaw: -0.34, pitch: 0.19, cone: 0.58, lamp: 1.3 },
  { yaw: -0.34, pitch: 0.17, cone: 0.5, lamp: 1.35 },
]

/** verbatim fragments of one Bio sentence, which runs across the three players' cards */
function between(src: string, start: string, end: string) {
  const i = src.indexOf(start)
  const j = i >= 0 ? src.indexOf(end, i) : -1
  return i >= 0 && j >= 0 ? src.slice(i, j + end.length) : ''
}
const RUN = BIO[3]
const NOTE: Record<string, string> = {
  acoustic: `…${between(RUN, 'the supremely social musician', 'whether it be solo')}…`,
  bass: `…${between(RUN, 'or with his full backing band', 'on the Bass')}…`,
  drums: `…${between(RUN, 'and Tom Buckley', 'harmony vocals!).')}`,
}
/** the EPK's first line (the band's reason for being) */
const LEAD = EPK.band.slice(0, EPK.band.indexOf('crucial.') + 'crucial.'.length)

/* ---------------------------------------------------------------- helpers */

/** a critically damped follower (time-based; snaps on demand) */
class Spring {
  x = NaN
  v = 0
  constructor(public omega = 4.2) {}
  update(target: number, dt: number, snap = false) {
    if (snap || !Number.isFinite(this.x)) {
      this.x = target
      this.v = 0
      return this.x
    }
    const w = this.omega
    const f = 1 + 2 * dt * w
    const hoo = dt * w * w
    const hhoo = dt * hoo
    const det = 1 / (f + hhoo)
    const x = (f * this.x + dt * this.v + hhoo * target) * det
    this.v = (this.v + hoo * (target - this.x)) * det
    this.x = x
    return x
  }
  settled(target: number) {
    return Math.abs(this.x - target) < 1e-3 && Math.abs(this.v) < 1e-3
  }
}

/**
 * A point along a list of poses at parameter s (clamped). Linear between
 * neighbours: the poses differ a lot in distance, and a spline through them
 * overshoots; the spring driving s already eases every move in time.
 */
function along(pts: THREE.Vector3[], s: number, out: THREE.Vector3) {
  const n = pts.length
  const x = clamp(s, 0, n - 1)
  const i = Math.min(n - 2, Math.floor(x))
  return out.lerpVectors(pts[i], pts[i + 1], x - i)
}

const lerpAt = (arr: number[], s: number) => {
  const x = clamp(s, 0, arr.length - 1)
  const i = Math.min(arr.length - 2, Math.floor(x))
  const t = x - i
  const e = t * t * (3 - 2 * t)
  return lerp(arr[i], arr[i + 1], e)
}

type Mode = 'wide' | 'tall' | 'short'
interface Region {
  x0: number
  x1: number
  y0: number
  y1: number
}

const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)

/* ---------------------------------------------------------------- chapter */

export default function create(): Chapter {
  const group = new THREE.Group()
  let set: BandSet | null = null
  const clock = new StoryClock({ rate: PACE, snap: 1 })
  const cam = new Spring(4.0)
  // one ring per player (the drummer's is the kick's thump below)
  const strum = Array.from({ length: P }, () => new Ring(2.2, 0.6))
  const kick = new Ring(0.14, 0.9)
  let state = -1
  let lastQ = NaN
  // a sound on arrival, never closer than 0.4 s to the last (time, not scroll)
  let sfxAt = -1e9
  const sfx = (kind: string, level: number, t: number) => {
    if (t - sfxAt < 0.4) return
    sfxAt = t
    window.dispatchEvent(new CustomEvent('hark:sfx', { detail: { kind, level } }))
  }
  let entering = true
  let settled = true

  // DOM
  let probe: HTMLElement
  let copy: HTMLElement
  let intro: HTMLElement
  let introTitle: HTMLElement
  let members: HTMLElement
  let haps: HTMLElement
  let closing: HTMLElement
  const memberItems: HTMLElement[] = []
  const hapItems: HTMLElement[] = []
  let shown = -99

  // layout + the solved poses
  const lay = { W: 0, H: 0, mode: 'wide' as Mode, fov: 32, gutter: 24 }
  const regions: Region[] = []
  let dirty = true
  const camPos: THREE.Vector3[] = []
  const camTgt: THREE.Vector3[] = []
  const lampAt: THREE.Vector3[] = []
  const pos = new THREE.Vector3()
  const tgt = new THREE.Vector3()
  const aim = new THREE.Vector3()
  let fov = 32

  const cSpot = new THREE.Color()
  const C_TUNG = new THREE.Color(GEL.tungsten)
  const C_BULB = new THREE.Color(GEL.bulb)

  /* ---------------------------------------------------------------- DOM */

  function buildDom(stage: HTMLElement) {
    probe = el('div', 'bd-probe', undefined, stage)
    copy = el('div', 'bd-copy', undefined, stage)

    intro = el('div', 'bd-block bd-intro', undefined, copy)
    el('p', 'hud-eyebrow bd-eyebrow', SECTIONS.band.eyebrow, intro)
    introTitle = rise(el('h2', 'hud-h2 bd-title', undefined, intro), 'A sound and style that’s <em>all their own.</em>')
    const lead = el('div', 'hud-panel bd-lead', undefined, intro)
    el('p', 'hud-body', LEAD, lead)

    members = el('div', 'bd-block hud-panel bd-card bd-members', undefined, copy)
    const mstack = el('div', 'bd-stack', undefined, members)
    BAND.forEach((m, i) => {
      const it = el('div', 'bd-item', undefined, mstack)
      const idx = el('p', 'hud-label bd-idx', undefined, it)
      el('span', 'bd-n', String(i + 1).padStart(2, '0'), idx)
      idx.append(` / ${String(BAND.length).padStart(2, '0')}`)
      el('h3', 'bd-name', m.name, it)
      const inst = el('p', 'bd-inst', undefined, it)
      if (m.role !== m.instruments) el('span', 'hud-tag bd-role', m.role, inst)
      el('span', 'bd-inst-t', m.instruments, inst)
      const note = NOTE[m.gear] ?? ''
      if (note.length > 2) el('p', 'bd-note', note, it)
      memberItems.push(it)
    })

    haps = el('div', 'bd-block hud-panel bd-card bd-haps', undefined, copy)
    const hh = el('div', 'bd-haps-head', undefined, haps)
    el('p', 'hud-eyebrow bd-haps-t', EPK.happeningsTitle, hh)
    el('p', 'bd-haps-lead', EPK.happeningsLead, hh)
    const hstack = el('div', 'bd-stack', undefined, haps)
    EPK.happenings.forEach((h, i) => {
      const it = el('div', 'bd-item', undefined, hstack)
      const idx = el('p', 'hud-label bd-idx', undefined, it)
      el('span', 'bd-n', String(i + 1).padStart(2, '0'), idx)
      idx.append(` / ${String(EPK.happenings.length).padStart(2, '0')}`)
      el('h3', 'bd-hap-title', h.title, it)
      el('p', 'hud-body bd-hap-text', h.text, it)
      const a = el('a', 'hud-btn hud-btn--ghost bd-link', 'Watch on YouTube ↗', it)
      a.href = youtubeUrl(h.video)
      a.target = '_blank'
      a.rel = 'noopener'
      hapItems.push(it)
    })

    closing = el('div', 'bd-block bd-closing', undefined, copy)
    el('p', 'hud-eyebrow bd-eyebrow', 'GJP', closing)
    el('p', 'hud-quote bd-close-q', EPK.closing, closing)

    const mark = () => (dirty = true)
    window.addEventListener('resize', mark)
    document.fonts?.ready.then(mark)
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(mark).observe(copy)
  }

  /** 0 intro · 1..P players · P+1..N happenings · N+1 closing */
  function show(next: number, local: number) {
    setRise(introTitle, next === 0 && local > 0.012)
    if (next === shown) return
    shown = next
    intro.classList.toggle('is-on', next === 0)
    members.classList.toggle('is-on', next >= 1 && next <= P)
    haps.classList.toggle('is-on', next > P && next <= N)
    closing.classList.toggle('is-on', next === N + 1)
    memberItems.forEach((f, i) => f.classList.toggle('is-on', i === next - 1))
    hapItems.forEach((f, i) => f.classList.toggle('is-on', i === next - P - 1))
  }

  function stateFor(x: number, prev: number, snap: boolean) {
    const raw = x < 0 ? 0 : x >= N ? N + 1 : Math.floor(x) + 1
    if (snap || prev < 0 || raw === prev) return raw
    const lo = prev === 0 ? -Infinity : prev - 1
    const hi = prev === 0 ? 0 : prev >= N + 1 ? Infinity : prev
    return x > lo - HYST && x < hi + HYST ? prev : raw
  }

  /* ---------------------------------------------------------------- layout */

  function measure(W0: number, H0: number) {
    const W = W0 > 1 ? W0 : window.innerWidth || 1280
    const H = H0 > 1 ? H0 : window.innerHeight || 720
    lay.W = W
    lay.H = H
    const portrait = W / Math.max(1, H) <= 1
    const short = !portrait && H <= 500
    lay.mode = portrait ? 'tall' : short ? 'short' : 'wide'
    lay.fov = portrait ? 38 : short ? 30 : 32
    const band = probe.getBoundingClientRect()
    const top = band.height > 0 ? band.top : H * 0.11
    const bottom = band.height > 0 ? band.bottom : H * 0.89
    lay.gutter = band.left > 0 ? band.left : 24
    const c = copy.getBoundingClientRect()
    const blocks = [intro, members, haps, closing].map(b => b.getBoundingClientRect())
    const blockFor = (i: number) => (i === 0 ? 0 : i <= P ? 1 : i <= N ? 2 : 3)
    regions.length = 0
    for (let i = 0; i < VIEWS.length; i++) {
      const b = blocks[blockFor(i)]
      if (lay.mode === 'tall') {
        const y1 = b.height > 0 ? b.top - 14 : H * 0.56
        regions.push({ x0: 10, x1: W - 10, y0: top + 4, y1: Math.max(top + H * 0.16, y1) })
      } else {
        const x0 = c.width > 0 ? c.right + Math.max(16, W * 0.02) : W * 0.46
        const x1 = W - Math.max(16, W * 0.025)
        regions.push({ x0: Math.min(x0, x1 - W * 0.3), x1, y0: top + 6, y1: bottom - 6 })
      }
    }
    buildPath()
    dirty = false
  }

  function solve(s: Spot, v: View, R: Region, scale: number, outP: THREE.Vector3, outT: THREE.Vector3) {
    const W = lay.W
    const H = lay.H
    const aspect = W / Math.max(1, H)
    const tanV = Math.tan(THREE.MathUtils.degToRad(lay.fov / 2))
    const tanX = tanV * aspect
    const fw = (R.x1 - R.x0) / W
    const fh = (R.y1 - R.y0) / H
    const fill = 0.92
    const D = Math.max((s.w * scale) / (2 * tanX * fw * fill), (s.h * scale) / (2 * tanV * fh * fill))
    const nx = ((R.x0 + (s.ax ?? 0.5) * (R.x1 - R.x0)) / W) * 2 - 1
    const ny = 1 - ((R.y0 + (s.ay ?? 0.5) * (R.y1 - R.y0)) / H) * 2
    _dir.set(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch))
    _fwd.copy(_dir).negate()
    _right.crossVectors(_fwd, _Y).normalize()
    _up.crossVectors(_right, _fwd)
    outP.copy(s.at)
      .addScaledVector(_dir, D)
      .addScaledVector(_right, -nx * D * tanX)
      .addScaledVector(_up, -ny * D * tanV)
    outT.copy(outP).addScaledVector(_fwd, D)
  }

  function buildPath() {
    if (!set) return
    camPos.length = camTgt.length = lampAt.length = 0
    for (let i = 0; i < VIEWS.length; i++) {
      const s0 = set.spots[Math.min(i, set.spots.length - 1)]
      const s = lay.mode === 'tall' && s0.tall ? s0.tall : s0
      const cp = new THREE.Vector3()
      const ct = new THREE.Vector3()
      // the last pose is the push for the cut: the closing framing, 20% tighter
      solve(s, VIEWS[i], regions[i], i === VIEWS.length - 1 ? 0.8 : 1, cp, ct)
      camPos.push(cp)
      camTgt.push(ct)
      lampAt.push(s.at.clone().setY(Math.max(1.5, s.at.y * 0.7)))
    }
  }

  /* ---------------------------------------------------------------- chapter */

  return {
    id: 'band',
    group,
    anchors: Array.from({ length: N }, (_, i) => A0 + SPAN * (i + 0.5)),

    async init(ctx: ChapterContext) {
      buildDom(ctx.stage)
      set = await buildSet(group, ctx.mobile)
      dirty = true
    },

    onEnter() {
      clock.reset()
      entering = true
      shown = -99
    },

    onLeave() {
      entering = true
    },

    busy() {
      return !settled
    },

    update(local: number, frame: Frame, ctx: ChapterContext) {
      if (!set) return
      if (dirty || (frame.width > 1 && (lay.W !== frame.width || lay.H !== frame.height))) measure(frame.width, frame.height)
      const dt = frame.dt
      const t = frame.time
      const calm = frame.reducedMotion || !!frame.still
      const q0 = toQ(local)
      const snap = entering || !Number.isFinite(lastQ) || Math.abs(q0 - lastQ) > clock.snap
      lastQ = q0
      const x = clock.update(q0, dt)
      const prev = state
      state = stateFor(x, state, snap)
      entering = false

      /* ---- the camera index ---- */
      let camT: number
      if (state === 0) camT = 0.1 * smoothstep(-INTRO_Q, 0, x)
      else if (state === N + 1) camT = N + 1
      else camT = state + (calm ? 0 : 0.05 * (clamp(x - (state - 1), 0, 1) - 0.5))
      const c = cam.update(camT, dt, snap)
      // the push for the cut is scroll-driven (it's the chapter's last few % of scroll)
      const push = state === N + 1 ? segment(local, PUSH0, 1) : 0
      const s = c + push
      along(camPos, s, pos)
      along(camTgt, s, tgt)
      along(lampAt, c, aim)
      fov = lay.fov
      if (!calm) {
        pos.x += Math.sin(t * 0.21) * 0.02
        pos.y += Math.sin(t * 0.17 + 1.1) * 0.015
      }

      /* ---- arrivals: the strings ring, the kick thumps (time-paced, never calm) ---- */
      if (state !== prev && !snap && !calm) {
        const gear = state >= 1 && state <= P ? BAND[state - 1].gear : ''
        // Greg's open DADGBD, the bass's low D, the kick
        if (gear === 'acoustic' && strum[state - 1].strike(t, 1)) window.dispatchEvent(new CustomEvent('hark:strum', { detail: { level: 0.4 } }))
        if (gear === 'bass' && strum[state - 1].strike(t, 1)) window.dispatchEvent(new CustomEvent('hark:pluck', { detail: { midi: 38, level: 0.5 } }))
        if (gear === 'drums' && kick.strike(t, 1)) sfx('knock', 0.7, t)
        // the happenings: the ON AIR switch, the clapper, the tuning dial
        if (state === P + 1) sfx('switch', 0.6, t)
        if (state === P + 2) sfx('click', 0.5, t)
        if (state === P + 3) sfx('detent', 0.5, t)
      }
      const S = set
      const rv = (gear: string) => {
        const i = BAND.findIndex(m => m.gear === gear)
        return calm || i < 0 ? 0 : strum[i].value(t)
      }
      const gv = rv('acoustic')
      for (let i = 0; i < 6; i++) S.guitar.strings.amp[i] = 0.008 * gv * (1 - i * 0.08)
      S.guitar.strings.lightDir.set(0.2, 1, 0.7)
      S.guitar.update(frame, ctx.camera, ctx.renderer)
      S.bass.ring(0.012 * rv('bass'))
      S.bass.update(frame, ctx.camera, ctx.renderer)
      const kv = calm ? 0 : kick.value(t)
      S.kit.kickHead.position.z = 0
      S.kit.kickHead.scale.set(1, 1, 1)
      S.kit.kickHead.position.y = -0.03 * kv
      if (!calm) {
        S.kit.cymbals.forEach((cy, i) => {
          cy.rotation.y = 0.04 * Math.sin(t * (0.5 + i * 0.13) + i)
        })
      }

      /* ---- the happenings: ON AIR lights, the dial warms, the needle slides (from the clock) ---- */
      const onAir = smoothstep(P - 0.05, P + 0.35, x)
      S.onAir.setLevel(onAir)
      S.onAirLight.intensity = 5 * onAir
      const dial = smoothstep(P + 1.95, P + 2.3, x)
      S.radio.setGlow(0.35 + 0.65 * dial)
      S.radio.tune(lerp(104.5, 93.7, smoothstep(P + 1.98, P + 2.5, x)))
      S.dialLight.intensity = 0.6 + 2.2 * dial
      for (const j of S.ampJewels) j.color.set('#ff9a3c').multiplyScalar(1.3)

      /* ---- light: one lamp moving spot to spot, the room round it ---- */
      const w = ctx.world.params
      const cone = lerpAt(
        VIEWS.map(v => v.cone),
        c,
      )
      const lamp = lerpAt(
        VIEWS.map(v => v.lamp),
        c,
      )
      w.spot = lamp
      w.spotColor = cSpot.copy(C_TUNG).lerp(C_BULB, 0.2)
      w.spotPos.set(aim.x - 2, aim.y + 30, aim.z + 9)
      w.spotAt.copy(aim)
      w.spotAngle = cone
      w.spotPenumbra = 0.7
      w.rimA = 0.3
      w.rimAColor = GEL.amber
      w.rimADir.set(-0.5, 0.6, -1)
      // the cool rim goes quiet in the corner (the kit's chrome behind the radio)
      w.rimB = 0.22 * (1 - 0.75 * smoothstep(P + 0.2, P + 1, c) * (1 - smoothstep(N + 0.2, N + 1, c)))
      w.rimBColor = GEL.dusk
      w.rimBDir.set(0.9, 0.35, -1)
      w.fill = 0.09
      w.haze = 0.55
      w.hazeColor = '#8a4a24'
      w.hazeY = 0.05
      w.bulbs = 0.35
      w.bokeh = 0.12
      w.env = 0.7
      w.envTurn = 0.9 + c * 0.12
      S.festoon.update(t, calm, 1, (frame.height * Math.max(1, ctx.renderer.getPixelRatio())) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))))

      const post = ctx.post.params
      post.bloomStrength = 0.34
      post.bloomThreshold = 0.9
      post.bloomRadius = 0.5
      post.vignette = 0.6
      post.warmth = 1
      post.glitch = calm ? 0 : 0.16 * kv

      /* ---- copy ---- */
      show(state, local)
      settled = !clock.busy && cam.settled(camT)
    },

    camera(_local: number, frame: Frame, out: CameraPose) {
      out.position.copy(pos)
      out.target.copy(tgt)
      out.fov = fov
      out.roll = 0
      out.parallax = frame.reducedMotion || frame.still ? 0 : 0.06
    },
  }
}
