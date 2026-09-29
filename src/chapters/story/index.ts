import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, rise, setRise } from '../../core/dom'
import { INFLUENCES, SECTIONS, STORY } from '../../content'
import { clamp, lerp, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { StoryClock } from '../../kit/pace'
import { fontsReady } from '../../kit/materials'
import { scaleUv, stageFloor } from '../../kit/stage'
import { GEL } from '../../world/World'
import { buildCase } from './case'
import { buildKeepsakes, type Keepsakes } from './keepsakes'
import { buildMotes, type Motes } from './motes'
import { crisp, rugMap } from './prints'
import './story.css'

/*
 * STORY · "The Case". Greg's hard-shell guitar case lies open on a worn
 * kilim at the edge of the stage, its lid standing up behind it — crushed
 * burgundy velvet, the guitar out on its stand for the night — and the case
 * holds the story: what he keeps in it, one keepsake per beat of the Bio
 * (keepsakes.ts). The camera glides from keepsake to keepsake like a hand
 * reaching into the case, the lamp following; flat things are taped inside
 * the lid (the camera lifts to face them), things with weight lie in the
 * velvet (it looks down into them), and two sit on the floor beside it.
 *
 *   0.00–0.12  intro: the whole open case in the lamp's pool; eyebrow "Bio",
 *              "Bubbling up through the cracks for 2 decades…", the
 *              influences (the stickers inside the lid) — clear of the cut
 *              (landing / intro 0.07)
 *   0.12–0.945 nine beats (anchors = slot centres, ~0.55 vh each): the card
 *              gives when · where and the verbatim text, and names the
 *              keepsake. Beat 4, 1977, is the big one: the room falls away
 *              (bulbs and lamp dim), the little TV's warm picture becomes the
 *              light, and the dust in the air hangs still — "time stood still".
 *   0.945–1.0  out: a slow push into the tape reel's hub for the soundhole
 *              cut (the lamp stays on the reel: a lit frame)
 *
 * PACING (WCAG 2.3.1): the beat, the lamp and the camera follow a StoryClock
 * in beat units (≤ 1.1 beat changes a second); the camera glides between
 * keepsakes on a critically damped spring (~0.9 s of TIME), snapping on
 * teleports. The room's dim for 1977 follows the same spring (a slow fade,
 * never a flash). Reduced motion / Motion off: no drift, no parallax, the
 * TV's picture and the dust hold still.
 */

const N = STORY.length
const A0 = 0.12
const A1 = 0.945
const SPAN = (A1 - A0) / N
const HYST = 0.06
const INTRO_Q = 0.7
const OUT_Q = 0.5
const PACE = 1.1
const TV_I = 3
const toQ = (local: number) =>
  local < A0 ? -INTRO_Q * (1 - local / A0) : local <= A1 ? (local - A0) / SPAN : N + (OUT_Q * (local - A1)) / (1 - A1)

/** what each beat's keepsake is (the card names the thing on screen) */
const THINGS = ['A postcard', 'Sheet music', 'A VHS tape', 'The TV', 'The CD', 'A road map', 'The calendar', 'A ticket stub', 'The tape reel']
/** where the camera looks from, per keepsake: elevation above the horizon and azimuth (+ = from the right), radians */
const VIEWS: { el: number; az: number; front?: boolean; side?: boolean }[] = [
  { el: 0.2, az: -0.08, front: true },
  { el: 1.0, az: 0.1 },
  { el: 0.92, az: 0.24 },
  { el: 0.14, az: 0.34 },
  { el: 0.96, az: 0.34 },
  { el: 0.9, az: 0.2 },
  { el: 0.2, az: 0.06, front: true },
  { el: 0.24, az: 0.14, front: true },
  { el: 0.26, az: -0.2, side: true },
]
/** excerpts that start / stop mid-sentence carry an ellipsis (drawn by CSS: the DOM text stays verbatim) */
const CONT = [false, true, true, true, false, false, false, false, false]
const MORE = [true, true, false, false, false, false, false, false, false]
/** a soft D-major pentatonic climb, one note per beat (hark:pluck; the Sound is off by default) */
const NOTES = [50, 52, 54, 57, 59, 62, 64, 66, 69]
/** where the lamp hangs relative to what it lights: over the case, or out front for the lid */
const LAMP_DOWN = new THREE.Vector3(-2.2, 11, 7)
const LAMP_FRONT = new THREE.Vector3(-1.6, 6.8, 10.5)
const LAMP_SIDE = new THREE.Vector3(-7, 8.5, 6.5)

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

/** uniform Catmull-Rom through a list of vectors at parameter s (0..n-1, clamped ends) */
function catmull(pts: THREE.Vector3[], s: number, out: THREE.Vector3) {
  const n = pts.length
  const x = clamp(s, 0, n - 1)
  const i = Math.min(n - 2, Math.floor(x))
  const t = x - i
  const p0 = pts[Math.max(0, i - 1)]
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = pts[Math.min(n - 1, i + 2)]
  const t2 = t * t
  const t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z))
}

/** linear interpolation through a list of numbers at parameter s */
function along(v: number[], s: number) {
  const x = clamp(s, 0, v.length - 1)
  const i = Math.min(v.length - 2, Math.floor(x))
  const t = x - i
  const k = t * t * (3 - 2 * t)
  return v[i] + (v[i + 1] - v[i]) * k
}

/** the planks melt into the dark with distance: no hard horizon behind the lid */
function fadeFloor(floor: THREE.Mesh) {
  const m = floor.material as THREE.MeshStandardMaterial
  m.transparent = true
  m.depthWrite = true
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFloorW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorW;')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(14.0, 36.0, distance(vFloorW, cameraPosition));',
      )
  }
  m.customProgramCacheKey = () => 'gjp-story-floor'
}

type Mode = 'wide' | 'tall' | 'short'

/* ---------------------------------------------------------------- chapter */

export default function create(): Chapter {
  const group = new THREE.Group()
  let ks: Keepsakes
  let motes: Motes
  const clock = new StoryClock({ rate: PACE, snap: 1 })
  const cam = new Spring(4.2)
  let state = -1
  let lastQ = NaN
  let entering = true
  let settled = true
  let camT = -1
  let lastPluck = -1e9
  let lastLatch = -1e9
  let lastLocal = NaN
  let pianoAt = -1e9

  // world anchors (after init)
  const centre: THREE.Vector3[] = []
  const radius: number[] = []
  const caseMid = new THREE.Vector3()
  const fitPts: THREE.Vector3[] = []

  // DOM
  let probe: HTMLElement
  let copy: HTMLElement
  let intro: HTMLElement
  let introTitle: HTMLElement
  let card: HTMLElement
  let stack: HTMLElement
  const figs: HTMLElement[] = []
  const dots: HTMLElement[] = []
  let shown = -99

  const lay = { W: 0, H: 0, mode: 'wide' as Mode, cx: 0, cy: 0, diam: 300, fov: 28, left: 0, right: 0, top: 0, bottom: 0, bandTop: 0, bandBottom: 0 }
  // portrait: the copy block's height per pose (the intro, each beat's card)
  let introH = 0
  let chromeH = 0
  const figH: number[] = []
  const probeCam = new THREE.PerspectiveCamera()
  let dirty = true
  // the camera path: pose 0 = intro, 1..N = keepsakes, N + 1 = the out push
  const camPos: THREE.Vector3[] = []
  const camTgt: THREE.Vector3[] = []
  const lampAt: THREE.Vector3[] = []
  const lampOff: THREE.Vector3[] = []
  const lampAngle: number[] = []
  const pos = new THREE.Vector3()
  const tgt = new THREE.Vector3()
  const spot = new THREE.Vector3()
  const off = new THREE.Vector3()
  const spotPos = new THREE.Vector3()
  const buf = new THREE.Vector2()
  const press = [0, 0, 0, 0, 0, 0, 0, 0]
  let fov = 28

  /* ---------------------------------------------------------------- layout */

  function measure(W0: number, H0: number) {
    const W = W0 > 1 ? W0 : window.innerWidth || 1280
    const H = H0 > 1 ? H0 : window.innerHeight || 720
    lay.W = W
    lay.H = H
    const portrait = W / Math.max(1, H) <= 1
    const short = !portrait && H <= 500
    lay.mode = portrait ? 'tall' : short ? 'short' : 'wide'
    const band = probe.getBoundingClientRect()
    const top = band.height > 0 ? band.top : H * 0.105
    const bottom = band.height > 0 ? band.bottom : H * 0.895
    lay.bandTop = top
    lay.bandBottom = bottom
    // portrait frames each keepsake above ITS card (the card eases to each beat's height)
    figH.length = 0
    for (const f of figs) figH.push(f.offsetHeight)
    chromeH = card.offsetHeight - stack.offsetHeight
    introH = intro.offsetHeight
    syncHeight()
    lay.fov = lay.mode === 'tall' ? 34 : short ? 30 : 28
    if (lay.mode !== 'tall') {
      const c = copy.getBoundingClientRect()
      const left = c.width > 0 ? c.right + W * 0.025 : W * 0.44
      const right = W - Math.max(20, W * 0.03)
      const rw = Math.max(160, right - left)
      const rh = Math.max(120, bottom - top)
      lay.left = left
      lay.right = right
      lay.top = top
      lay.bottom = bottom
      lay.cx = (left + right) / 2
      lay.cy = top + rh * 0.5
      lay.diam = Math.min(rh * (short ? 0.84 : 0.72), rw * 0.8)
    }
    buildPath()
    dirty = false
  }

  /** portrait: the free area above a copy block `h` px tall (landscape: the column's side, unchanged) */
  function region(h: number) {
    if (lay.mode !== 'tall') return
    const W = lay.W
    const top = lay.bandTop
    const regionB = h > 0 ? lay.bandBottom - h - 14 : lay.H * 0.55
    const rh = Math.max(110, regionB - top)
    lay.left = 10
    lay.right = W - 10
    lay.top = top
    lay.bottom = top + rh
    lay.cx = W / 2
    lay.cy = top + rh * 0.52
    lay.diam = Math.min(rh * 0.86, (W - 20) * 0.8)
  }

  /** camera at distance D along `from` from `at`, aimed so `at` lands on the free area's centre */
  function place(at: THREE.Vector3, from: THREE.Vector3, D: number, outP: THREE.Vector3, outT: THREE.Vector3, sx = lay.cx, sy = lay.cy) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(lay.fov / 2))
    outP.copy(at).addScaledVector(from, D)
    const f = new THREE.Vector3().subVectors(at, outP).normalize()
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, f)
    const nx = (sx / lay.W) * 2 - 1
    const ny = 1 - (sy / lay.H) * 2
    outT.copy(at)
      .addScaledVector(right, -nx * D * tanV * (lay.W / lay.H))
      .addScaledVector(up, -ny * D * tanV)
  }

  /** framing by radius: `r` world units fill `diam` px of the free area */
  function framing(at: THREE.Vector3, from: THREE.Vector3, r: number, outP: THREE.Vector3, outT: THREE.Vector3) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(lay.fov / 2))
    const D = (r * lay.H) / (tanV * Math.max(60, lay.diam))
    place(at, from, D, outP, outT)
  }

  /** are all points inside the free area (with a margin in px) seen from P → T? */
  function allInside(points: THREE.Vector3[], P: THREE.Vector3, T: THREE.Vector3, m: number) {
    const c = probeCam
    c.fov = lay.fov
    c.aspect = lay.W / Math.max(1, lay.H)
    c.updateProjectionMatrix()
    c.position.copy(P)
    c.up.set(0, 1, 0)
    c.lookAt(T)
    c.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    for (const p of points) {
      v.copy(p).project(c)
      if (v.z > 1) return false
      const x = (v.x * 0.5 + 0.5) * lay.W
      const y = (0.5 - v.y * 0.5) * lay.H
      if (x < lay.left + m || x > lay.right - m || y < lay.top + m || y > lay.bottom - m) return false
    }
    return true
  }

  function dirFrom(el: number, az: number) {
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize()
  }

  function buildPath() {
    if (!centre.length) return
    camPos.length = camTgt.length = lampAt.length = lampOff.length = lampAngle.length = 0
    // intro: the whole open case (lid, TV and reel too), fitted into the free area
    {
      region(introH)
      const corners = fitPts
      const dir = dirFrom(0.44, 0.3)
      const P = new THREE.Vector3()
      const T = new THREE.Vector3()
      let lo = 4
      let hi = 160
      const m = lay.mode === 'tall' ? 4 : 10
      for (let k = 0; k < 22; k++) {
        const D = (lo + hi) / 2
        place(caseMid, dir, D, P, T)
        if (allInside(corners, P, T, m)) hi = D
        else lo = D
      }
      place(caseMid, dir, hi, P, T)
      camPos.push(P)
      camTgt.push(T)
      lampAt.push(caseMid.clone().setY(0.6))
      lampOff.push(LAMP_DOWN.clone().multiplyScalar(1.15))
      lampAngle.push(0.46)
    }
    for (let i = 0; i < N; i++) {
      const P = new THREE.Vector3()
      const T = new THREE.Vector3()
      const v = VIEWS[i]
      region(chromeH + (figH[i] ?? 0))
      framing(centre[i], dirFrom(v.el, v.az), radius[i], P, T)
      camPos.push(P)
      camTgt.push(T)
      lampAt.push(centre[i].clone())
      const o = (v.front ? LAMP_FRONT : v.side ? LAMP_SIDE : LAMP_DOWN).clone()
      lampOff.push(o)
      lampAngle.push(Math.atan((radius[i] * 1.35) / o.length()))
    }
    // out: into the reel's hub, drawn to the middle of the frame (where the soundhole cut closes)
    {
      const P = new THREE.Vector3()
      const T = new THREE.Vector3()
      const v = VIEWS[N - 1]
      const tanV = Math.tan(THREE.MathUtils.degToRad(lay.fov / 2))
      const D = (0.62 * lay.H) / (tanV * Math.max(60, lay.diam))
      place(ks.hub, dirFrom(v.el * 0.7, v.az * 0.6), D, P, T, lay.W / 2 + (lay.cx - lay.W / 2) * 0.3, lay.H / 2 + (lay.cy - lay.H / 2) * 0.3)
      camPos.push(P)
      camTgt.push(T)
      lampAt.push(ks.hub.clone())
      lampOff.push(LAMP_SIDE.clone())
      lampAngle.push(0.1)
    }
  }

  /* ---------------------------------------------------------------- DOM */

  function buildDom(stage: HTMLElement) {
    probe = el('div', 'st-probe', undefined, stage)
    copy = el('div', 'st-copy', undefined, stage)
    intro = el('div', 'st-intro', undefined, copy)
    el('p', 'hud-eyebrow st-eyebrow', SECTIONS.story.eyebrow, intro)
    introTitle = rise(el('h2', 'hud-h2 st-title', undefined, intro), 'Bubbling up through the <em>cracks</em> for 2 decades…')
    const inf = el('div', 'st-infl', undefined, intro)
    el('p', 'hud-label', 'Influences', inf)
    const tags = el('ul', 'hud-tags', undefined, inf)
    for (const n of INFLUENCES) el('li', 'hud-tag', n, tags)

    card = el('div', 'st-card hud-panel', undefined, copy)
    stack = el('div', 'st-stack', undefined, card)
    STORY.forEach((b, i) => {
      const f = el('figure', 'st-fig', undefined, stack)
      const idx = el('p', 'hud-label st-idx', undefined, f)
      el('span', 'st-n', String(i + 1).padStart(2, '0'), idx)
      idx.append(` / ${String(N).padStart(2, '0')}`)
      el('span', 'st-thing', THINGS[i], idx)
      el('p', 'st-when hud-lit', b.when, f)
      el('p', 'st-where', b.where, f)
      const q = b.text.indexOf('“')
      if (q > 0) {
        // the 1977 beat: the moment itself, then what he knew — set large
        const t = el('p', 'hud-body st-text', b.text.slice(0, q).trimEnd(), f)
        if (CONT[i]) t.classList.add('st-cont')
        el('blockquote', 'hud-quote st-quote', b.text.slice(q), f)
      } else {
        const t = el('p', 'hud-body st-text', b.text, f)
        if (CONT[i]) t.classList.add('st-cont')
        if (MORE[i]) t.classList.add('st-more')
      }
      figs.push(f)
    })
    const line = el('div', 'st-dots', undefined, card)
    for (let i = 0; i < N; i++) dots.push(el('span', 'st-dot', undefined, line))
    const mark = () => (dirty = true)
    window.addEventListener('resize', mark)
    document.fonts?.ready.then(mark)
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(mark).observe(intro)
  }

  /** the stack takes the height of the beat on show (animated in CSS) */
  function syncHeight() {
    const f = figs[Math.max(0, shown - 1)]
    if (f) stack.style.height = `${f.offsetHeight}px`
  }

  function show(next: number, local: number) {
    setRise(introTitle, next === 0 && local > 0.012)
    if (next === shown) return
    shown = next
    intro.classList.toggle('is-on', next === 0)
    card.classList.toggle('is-on', next >= 1)
    figs.forEach((f, i) => f.classList.toggle('is-on', i === next - 1))
    dots.forEach((d, i) => {
      d.classList.toggle('is-on', i === next - 1)
      d.classList.toggle('is-past', i < next - 1)
    })
    if (next >= 1) syncHeight()
  }

  /** 0 = intro, 1..N = beat i - 1, from the clock (beat units); hysteresis round the previous state */
  function stateFor(x: number, prev: number, snap: boolean) {
    const raw = x < 0 ? 0 : Math.min(N, Math.floor(x) + 1)
    if (snap || prev < 0 || raw === prev) return raw
    const lo = prev === 0 ? -Infinity : prev - 1
    const hi = prev === 0 ? 0 : prev >= N ? Infinity : prev
    return x > lo - HYST && x < hi + HYST ? prev : raw
  }

  /* ---------------------------------------------------------------- chapter */

  return {
    id: 'story',
    group,
    anchors: STORY.map((_, i) => A0 + SPAN * (i + 0.5)),

    async init(ctx: ChapterContext) {
      buildDom(ctx.stage)
      const mobile = ctx.mobile
      // the room: stage planks fading into the dark, a worn kilim under the case
      const floor = stageFloor(200, 140)
      fadeFloor(floor)
      group.add(floor)
      const rugGeo = new THREE.PlaneGeometry(17.5, 11)
      scaleUv(rugGeo, 1, 1)
      const rug = new THREE.Mesh(rugGeo, new THREE.MeshStandardMaterial({ color: '#a89484', map: crisp(rugMap(mobile ? 0.5 : 1)), roughness: 0.96 }))
      rug.rotation.set(-Math.PI / 2, 0, 0.035)
      rug.position.set(-0.4, 0.004, 0.9)
      rug.receiveShadow = true
      group.add(rug)
      await nextFrame()
      await fontsReady()
      const c = buildCase(mobile)
      group.add(c.group)
      await nextFrame()
      ks = buildKeepsakes(c, mobile)
      await nextFrame()
      motes = buildMotes(mobile)
      group.add(motes.points)
      group.updateMatrixWorld(true)
      // each keepsake's focus
      const box = new THREE.Box3()
      for (const k of ks.items) {
        box.setFromObject(k.obj)
        const p = box.getCenter(new THREE.Vector3())
        if (k.nudge) p.add(k.nudge)
        centre.push(p)
        radius.push(k.r)
      }
      // the intro frames the case, its open lid, the TV and the reel
      fitPts.push(...c.silhouette)
      const bb = new THREE.Box3()
      for (const o of [ks.tv.group, ks.items[N - 1].obj]) {
        bb.setFromObject(o)
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) fitPts.push(new THREE.Vector3(x, y, z))
      }
      bb.setFromPoints(fitPts).getCenter(caseMid)
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
      if (!ks) return
      if (dirty || (frame.width > 1 && (lay.W !== frame.width || lay.H !== frame.height))) measure(frame.width, frame.height)
      const dt = frame.dt
      const calm = frame.reducedMotion || !!frame.still
      const q0 = toQ(local)
      const snap = entering || !Number.isFinite(lastQ) || Math.abs(q0 - lastQ) > clock.snap
      lastQ = q0
      const x = clock.update(q0, dt)
      const prev = state
      state = stateFor(x, state, snap)
      entering = false

      /* ---- the camera index: intro -1 … keepsakes 0..N-1 … out N ---- */
      if (state === 0) camT = -1 + 0.14 * smoothstep(-INTRO_Q, 0, x)
      else if (x > N) camT = N - 1 + clamp((x - N) / OUT_Q)
      else camT = state - 1 + (calm ? 0 : 0.04 * (clamp(x - (state - 1), 0, 1) - 0.5))
      const c = cam.update(camT, dt, snap)
      const s = c + 1
      catmull(camPos, s, pos)
      catmull(camTgt, s, tgt)
      catmull(lampAt, s, spot)
      catmull(lampOff, s, off)
      fov = lay.fov
      if (!calm) {
        // a breath of handheld life (idle, tiny)
        pos.x += Math.sin(frame.time * 0.19) * 0.012
        pos.y += Math.sin(frame.time * 0.15 + 1.1) * 0.008
      }

      /* ---- 1977: the room falls away and the little TV becomes the light ---- */
      const tvK = 1 - smoothstep(0.25, 1.05, Math.abs(c - TV_I))

      // sound (the Sound decides whether it plays; never on a teleport, rate-limited by TIME):
      // the case's latch as it comes into view, a soft note as each keepsake arrives,
      // the TV's knob for 1977, the tape for Volume ONE
      const sfx = (kind: string, level = 0.6) => window.dispatchEvent(new CustomEvent('hark:sfx', { detail: { kind, level } }))
      if (!snap && lastLocal < 0.035 && local >= 0.035 && frame.time - lastLatch > 1.5) {
        lastLatch = frame.time
        sfx('latch', 0.55)
      }
      lastLocal = local
      if (state !== prev && state >= 1 && !snap && frame.time - lastPluck > 0.35) {
        lastPluck = frame.time
        window.dispatchEvent(new CustomEvent('hark:pluck', { detail: { midi: NOTES[state - 1], level: 0.45 } }))
        if (state - 1 === TV_I) sfx('switch', 0.5)
        else if (state === N) sfx('tape', 0.5)
      }

      // arriving at the piano, three keys go down in turn (a little arpeggio, by TIME)
      if (state !== prev && state === 2 && !snap && !calm) pianoAt = frame.time
      {
        const t = calm ? 1e9 : frame.time - pianoAt
        const env = (u: number) => (u < 0 ? 0 : u < 0.07 ? u / 0.07 : u < 0.2 ? 1 : Math.max(0, 1 - (u - 0.2) / 0.3))
        press.fill(0)
        press[1] = env(t - 0.35)
        press[3] = env(t - 0.6)
        press[5] = env(t - 0.85)
        ks.pressKeys(press)
      }

      /* ---- light ---- */
      const w = ctx.world.params
      spotPos.copy(spot).add(off)
      const introK = clamp(-c)
      w.spot = lerp(0.62 + 0.22 * introK, 0.3, tvK)
      w.spotColor = '#ffd6a6'
      w.spotPos.copy(spotPos)
      w.spotAt.copy(spot)
      w.spotAngle = along(lampAngle, s)
      w.spotPenumbra = 0.7
      w.rimA = lerp(0.42, 0.18, tvK)
      w.rimAColor = GEL.amber
      w.rimADir.set(-0.75, 0.6, -1)
      w.rimB = lerp(0.16, 0, tvK)
      w.rimBColor = GEL.dusk
      w.rimBDir.set(0.9, 0.3, -1)
      w.fill = lerp(0.07, 0.03, tvK)
      w.env = lerp(0.7, 0.35, tvK)
      w.envTurn = c * 0.16
      w.bulbs = lerp(0.85, 0.22, tvK)
      w.bulbColor = GEL.bulb
      w.bokeh = lerp(0.14, 0.05, tvK)
      const pitch = Math.atan2(tgt.y - pos.y, Math.hypot(tgt.x - pos.x, tgt.z - pos.z))
      const horizon = -Math.tan(pitch) / Math.tan(THREE.MathUtils.degToRad(fov / 2))
      w.haze = lerp(0.42, 0.62, tvK)
      w.hazeY = clamp(horizon + 0.2, -0.9, 0.9)
      w.hazeColor = '#8e4a24'
      w.beams = 0

      const tv = ks.tv
      tv.light.intensity = lerp(0.35, 5, tvK)
      tv.screen.uniforms.uPower.value = lerp(0.52, 1.32, tvK)
      tv.screen.uniforms.uTime.value = calm ? 0 : frame.time
      tv.screen.uniforms.uLive.value = calm ? 0 : 1

      /* ---- dust in the lamp: still when time stands still ---- */
      const mu = motes.uniforms
      mu.uT.value += calm ? 0 : dt * (1 - tvK * 0.98)
      mu.uSpotPos.value.copy(spotPos)
      mu.uSpotDir.value.subVectors(spot, spotPos).normalize()
      mu.uCos.value = Math.cos(w.spotAngle * 1.05)
      mu.uAmt.value = lerp(0.55, 0.42, tvK)
      ctx.renderer.getDrawingBufferSize(buf)
      mu.uPx.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)))

      const post = ctx.post.params
      post.bloomStrength = lerp(0.22, 0.5, tvK)
      post.bloomRadius = 0.6
      post.bloomThreshold = 0.9
      post.vignette = lerp(0.6, 0.78, tvK)
      post.warmth = 1

      /* ---- copy ---- */
      show(state, local)
      settled = !clock.busy && cam.settled(camT)
    },

    camera(_local: number, frame: Frame, out: CameraPose) {
      out.position.copy(pos)
      out.target.copy(tgt)
      out.fov = fov
      out.roll = 0
      out.parallax = frame.reducedMotion || frame.still ? 0 : 0.025
    },
  }
}
