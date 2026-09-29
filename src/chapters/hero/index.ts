import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, reveal, rise, setRise } from '../../core/dom'
import { ALBUMS, ARTIST, BRAND, GEAR, MICROCOPY } from '../../content'
import { clamp, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { whenRevealed } from '../../kit/images'
import { FONT, fontsReady } from '../../kit/materials'
import { SCALE, SOUNDHOLE, TUNING, bodyOutline, buildGuitar, type Guitar } from '../../kit/guitar'
import { Ring } from '../../kit/strings'
import { GEL } from '../../world/World'
import { buildFloor, buildFloorLamp, buildMicStand, buildRug, buildSetlist, buildStand, buildStool, type FloorLamp } from './props'
import { Festoon } from './festoon'
import './hero.css'

/*
 * HERO · "Tune Up" — the corner stage of a small room after dark, one
 * acoustic guitar on its stand in the lamplight, before the first song.
 *
 *   0.00–0.15 LANDING: the lamp's pool on the HEADSTOCK, macro — the cream
 *             GJP monogram, closed chrome tuners, the white nut, the strings
 *             running down out of frame, festoon bulbs soft behind. The banner
 *             badge, the h1 and the scroll hint. The loader match-cuts onto
 *             the monogram: --hark-mark-x/-y (centre of the GJP lettering, px),
 *             -size (the lettering's width), -font (its Fraunces italic 640
 *             font-size) and -angle (reading direction, deg clockwise).
 *             Sound: 'hark:sfx' {kind:'peg'} as each peg starts to turn,
 *             'hark:pluck' {midi} per string, 'hark:strum' once all six ring.
 *   0.15–0.55 TUNING UP — DADGBD: the camera slips down in front of the neck
 *             and looks back UP it (the frets receding to the nut, the strings
 *             converging, the pegs standing out against the dark), gliding
 *             down the neck as it goes. One string at a time, low to high:
 *             its peg turns, it's plucked (a Ring, rate-limited by TIME; a
 *             'hark:pluck' for the Sound), it rings, and its note letter
 *             settles by the nut: D · A · D · G · B · D. A little tuner card
 *             carries GEAR.guitar.tuning. At 0.52, all six ring together once.
 *   0.55–0.70 THE PULL-BACK: back and up (a crane, not a zoom) to the corner
 *             stage — the guitar on its stand, a wooden stool on a worn rug,
 *             a boom-stand mic reaching over it, a floor lamp warming up
 *             behind, a setlist taped to the boards, festoon bulbs above.
 *   0.64–0.92 PAYOFF copy: the locale, ARTIST.tagline as the lead,
 *             ARTIST.lead, CTAs Listen → land('listen'), Get in touch →
 *             land('contact').
 *   0.93–1.00 OUT: a push toward the soundhole (lit) for the soundhole cut.
 *
 * Framing is computed per layout (the Riff hero's method): each key pose is
 * (pivot, yaw, pitch, distance, screen offset, fov, roll); distances fit the
 * subject into the screen area the copy leaves free (measured from the DOM on
 * resize and once a second) and the pivot is placed at that area's centre.
 * Between keys the pose PARAMETERS are interpolated (true arcs).
 */

/** the guitar leans back on its stand (radians from vertical) */
const LEAN = 0.2
/** the stand turns the guitar a little toward the house-left */
const RIG_YAW = -0.16
/** guitar-local x of the neck yoke (between the 5th and 6th frets) */
const YOKE_X = 4.7
/** height of the cradle arms above the boards */
const CRADLE_H = 2.2
/** the stool and the mic, behind and to the right of the guitar */
const STOOL = new THREE.Vector3(3.5, 0, -2.8)
const SEAT_H = 7.3
const MIC_BASE = new THREE.Vector3(7.2, 0, -5.2)
const LAMP = new THREE.Vector3(9.8, 0, -14.2)

/** the story, by local */
const B = { hold: 0.15, arrive: 0.215, tune0: 0.21, slot: 0.047, strum: 0.52, pull: 0.55, pay: 0.7, out: 0.93 }
/** within a string's slot: the peg turns, then the pluck + the letter */
const TURN_A = 0.004
const TURN_B = 0.026
const PLUCK_AT = 0.024
/** copy windows */
const HEAD_OUT = 0.17
const TUNE_IN = 0.2
const TUNE_OUT = 0.54
const PAY_IN = 0.64
const PAY_IN_PORTRAIT = 0.68
const PAY_OUT = 0.915

/** MIDI per string, DADGBD (D2 A2 D3 G3 B3 D4) */
const MIDI = [38, 45, 50, 55, 59, 62]
/** each string's tuner post along the headstock (the kit's 3+3 layout) */
const POST_U = [0.52, 0.98, 1.44, 0.52, 0.98, 1.44]
const PLUCK_AMP = [0.012, 0.011, 0.0102, 0.0094, 0.0086, 0.008]
/** where each paddle button rests (radians about its shaft): set by hand, not in a row */
const BTN_REST = [1.15, 1.4, 1.0, 1.25, 1.05, 1.35]

const pluckAt = (i: number) => B.tune0 + i * B.slot + PLUCK_AT
const slotStart = (i: number) => B.tune0 + i * B.slot

type Pose = { p: THREE.Vector3; th: number; ph: number; d: number; nx: number; ny: number; fov: number; roll: number }
const pose = (): Pose => ({ p: new THREE.Vector3(), th: 0, ph: 0, d: 10, nx: 0, ny: 0, fov: 30, roll: 0 })
const copyPose = (o: Pose, a: Pose) => {
  o.p.copy(a.p)
  o.th = a.th
  o.ph = a.ph
  o.d = a.d
  o.nx = a.nx
  o.ny = a.ny
  o.fov = a.fov
  o.roll = a.roll
  return o
}
const easeSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t))

/** a 0..1 level that follows an on/off target over TIME (copy never parks half-way) */
class Fader {
  v = 0
  constructor(
    private up = 0.45,
    private down = 0.32,
  ) {}
  set(x: number) {
    this.v = x
  }
  update(on: boolean, dt: number) {
    const t = on ? 1 : 0
    const r = dt / (on ? this.up : this.down)
    this.v = t > this.v ? Math.min(t, this.v + r) : Math.max(t, this.v - r)
    return this.v * this.v * (3 - 2 * this.v)
  }
  get busy() {
    return this.v > 0.0005 && this.v < 0.9995
  }
}

export default function create(): Chapter {
  const group = new THREE.Group()
  const yawG = new THREE.Group()
  const rig = new THREE.Group()
  let g: Guitar
  let lamp: FloorLamp
  let lampLight: THREE.PointLight
  let lampLevel = 0
  let festoon: Festoon

  // world points of interest (filled in init)
  const W = {
    mark: new THREE.Vector3(),
    head: new THREE.Vector3(),
    hole: new THREE.Vector3(),
    holeN: new THREE.Vector3(),
    whole: new THREE.Vector3(),
  }
  /** guitar-local → world */
  const G = (x: number, y: number, z: number, out = new THREE.Vector3()) => out.set(x, y, z).applyMatrix4(g.group.matrixWorld)
  /** headstock-local → world */
  const HS = (u: number, v: number, w: number, out = new THREE.Vector3()) => out.set(u, v, w).applyMatrix4(g.parts.headstock.matrixWorld)
  /** the nut's two ends (low D, high D) and the headstock tip (world): the letters' row */
  const nutAt = [new THREE.Vector3(), new THREE.Vector3()]
  const tipAt = new THREE.Vector3()
  const s0 = new THREE.Vector2()
  const s1 = new THREE.Vector2()
  const s2 = new THREE.Vector2()
  const sAlong = new THREE.Vector2()
  const sPerp = new THREE.Vector2()
  const sMid = new THREE.Vector2()
  const markPts: THREE.Vector3[] = []
  let buttons: THREE.Object3D[] = []
  let posts: THREE.Object3D[] = []

  // strings: a Ring per string (time-decaying), plucks queued with a minimum gap
  const rings = Array.from({ length: 6 }, () => new Ring(2.8, 0.3))
  const queue: { i: number; level: number; at: number }[] = []
  let lastPluck = -1e9
  let strumAt = -1e9
  let pegAt = -1e9
  let lastLocal = NaN

  // copy
  let stage: HTMLElement
  let land: HTMLElement
  let headBlock: HTMLElement
  let title: HTMLElement
  let hint: HTMLElement
  let tune: HTMLElement
  let tuneCard: HTMLElement
  let needle: SVGGElement
  let noteEls: HTMLElement[] = []
  let letters: HTMLElement
  let letterEls: HTMLElement[] = []
  let pay: HTMLElement
  let payTop: HTMLElement
  let payBot: HTMLElement
  let lead: HTMLElement
  const headFade = new Fader(0.45, 0.32)
  const tuneFade = new Fader(0.4, 0.3)
  const payFade = new Fader(0.5, 0.32)
  const letterFade = Array.from({ length: 6 }, () => new Fader(0.28, 0.3))
  let snapCopy = true
  let revealed = false
  let portrait: boolean | null = null
  let short = false
  let dy = 12
  let noteState = ''
  let needleDeg = NaN
  let letterPx = 0

  /** the free screen space the copy leaves (CSS px), measured from the DOM */
  const lay = { w: 0, h: 0, at: -1, safeT: 96, safeB: 804, landR: 620, headB: 300, footT: 700, tuneR: 360, tuneT: 600, payR: 480, payTopB: 300, payBotT: 560 }
  const K = { land: pose(), land2: pose(), pay: pose(), pay2: pose(), out: pose() }
  /** the tuning glide's framing offsets (per layout) */
  const TK = { nx: 0, ny: 0, fov: 34, dk: 1 }
  let posesKey = ''
  let markKey = ''
  const cur = pose()
  const tp = pose()

  const UP = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const tv3 = new THREE.Vector3()
  const tv4 = new THREE.Vector3()
  const tv5 = new THREE.Vector3()
  const probe = new THREE.PerspectiveCamera(30, 1, 0.1, 400)
  const probeT = new THREE.Vector3()

  /** camera position / target for a pose (target shifted so the pivot lands at NDC (nx, ny)) */
  function place(o: Pose, aspect: number, outP: THREE.Vector3, outT: THREE.Vector3) {
    const cp = Math.cos(o.ph)
    dir.set(Math.sin(o.th) * cp, Math.sin(o.ph), Math.cos(o.th) * cp)
    fwd.copy(dir).negate()
    right.crossVectors(fwd, UP).normalize()
    camUp.crossVectors(right, fwd)
    const tv = Math.tan((o.fov * Math.PI) / 360)
    outT.copy(o.p)
      .addScaledVector(right, -o.nx * o.d * tv * aspect)
      .addScaledVector(camUp, -o.ny * o.d * tv)
    outP.copy(outT).addScaledVector(dir, o.d)
  }

  /** a pose looking from world point `from` at world point `at` */
  function lookPose(from: THREE.Vector3, at: THREE.Vector3, o: Pose) {
    tv5.subVectors(from, at)
    o.d = tv5.length()
    tv5.divideScalar(o.d)
    o.p.copy(at)
    o.ph = Math.asin(clamp(tv5.y, -1, 1))
    o.th = Math.atan2(tv5.x, tv5.z)
    return o
  }

  /** distance that fits a subject of world size (h × w) into a screen fraction (fh × fw) */
  function fitD(h: number, w: number, fh: number, fw: number, fov: number, aspect: number) {
    const tv = Math.tan((fov * Math.PI) / 360)
    return Math.max(h / (2 * tv * Math.max(0.05, fh)), w / (2 * tv * aspect * Math.max(0.05, fw)))
  }

  function poses(frame: Frame) {
    const w = Math.max(1, frame.width)
    const h = Math.max(1, frame.height)
    const key = `${w}x${h}:${Object.values(lay).slice(3).join(':')}:${portrait}:${short}`
    if (key === posesKey) return K
    posesKey = key
    const a = w / h
    const gut = Math.min(48, Math.max(16, w * 0.034))
    const box = (x0: number, x1: number, y0: number, y1: number) => ({
      nx: (x0 + x1) / w - 1,
      ny: 1 - (y0 + y1) / h,
      fw: Math.max(0.05, (x1 - x0) / w),
      fh: Math.max(0.05, (y1 - y0) / h),
    })
    const set = (o: Pose, p: THREE.Vector3, th: number, ph: number, fov: number, roll = 0) => {
      o.p.copy(p)
      o.th = th
      o.ph = ph
      o.fov = fov
      o.roll = roll
      return o
    }
    if (!portrait) {
      // LANDING: the headstock macro, right of the copy
      const l0 = Math.min(w * 0.62, lay.landR + (short ? 24 : 48))
      const fl = box(l0, w - gut, lay.safeT, lay.safeB)
      set(K.land, W.head, RIG_YAW + 0.3, -0.1, 30)
      K.land.d = fitD(2.45, 2.0, fl.fh * (short ? 1.12 : 1.0), fl.fw * 0.94, 30, a)
      K.land.nx = fl.nx
      K.land.ny = fl.ny - 0.02
      // TUNING: the neck view sits right of the tuner card
      const t0 = Math.min(w * 0.5, lay.tuneR + 24)
      const ft = box(t0, w - gut, lay.safeT, lay.safeB)
      TK.nx = ft.nx * 0.85
      TK.ny = ft.ny
      TK.fov = short ? 38 : 34
      TK.dk = clamp(0.62 / ft.fw, 1, 1.45)
      // PAYOFF: the corner stage right of the copy
      const p0 = Math.min(w * 0.56, lay.payR + (short ? 16 : 40))
      const fp = box(p0, w - gut, lay.safeT, lay.safeB)
      set(K.pay, W.whole, RIG_YAW + 0.2, 0.06, 30)
      K.pay.d = fitD(15.6, 15.5, fp.fh * (short ? 1.1 : 1.0), fp.fw * 0.96, 30, a)
      K.pay.nx = fp.nx
      K.pay.ny = fp.ny - 0.02
    } else {
      // portrait: the headstock between the title plate and the hint
      const fl = box(0, w, lay.headB + 8, lay.footT - 8)
      set(K.land, W.head, RIG_YAW + 0.26, -0.1, 34)
      K.land.d = fitD(2.45, 2.0, fl.fh * 1.02, 0.96, 34, a)
      K.land.nx = 0
      K.land.ny = fl.ny
      // the neck above the tuner card
      const ft = box(0, w, lay.safeT, lay.tuneT - 8)
      TK.nx = 0
      TK.ny = ft.ny
      TK.fov = 40
      TK.dk = clamp(0.75 / ft.fh, 1, 1.5)
      // the corner stage between the two payoff plates (centred on the whole set,
      // a touch tighter: the lamp may kiss the edge)
      const fp = box(0, w, lay.payTopB + 6, lay.payBotT - 6)
      set(K.pay, tv4.copy(W.whole).add(tv3.set(1.1, -0.2, 0)), RIG_YAW + 0.16, 0.06, 36)
      K.pay.d = fitD(15.2, 13.2, fp.fh * 1.02, 0.98, 36, a)
      K.pay.nx = 0
      K.pay.ny = fp.ny
    }
    copyPose(K.land2, K.land)
    K.land2.d *= 0.96
    K.land2.th += 0.035
    copyPose(K.pay2, K.pay)
    K.pay2.d *= 0.965
    K.pay2.th += 0.06
    // OUT: a push toward the soundhole, the frame full of lit spruce
    lookPose(tv3.copy(W.hole).addScaledVector(W.holeN, portrait ? 5.4 : 4.2), W.hole, K.out)
    K.out.fov = portrait ? 38 : 32
    K.out.nx = 0
    K.out.ny = 0
    K.out.roll = 0
    return K
  }

  function mixPose(a: Pose, b: Pose, k: number, out: Pose) {
    out.p.lerpVectors(a.p, b.p, k)
    out.th = lerp(a.th, b.th, k)
    out.ph = lerp(a.ph, b.ph, k)
    out.d = Math.exp(lerp(Math.log(a.d), Math.log(b.d), k))
    out.nx = lerp(a.nx, b.nx, k)
    out.ny = lerp(a.ny, b.ny, k)
    out.fov = lerp(a.fov, b.fov, k)
    out.roll = lerp(a.roll, b.roll, k)
    return out
  }

  /** where the camera's aim sits along the headstock: follows the active string's peg */
  function aimU(local: number) {
    let u = 0.2
    for (let i = 0; i < 6; i++) u = lerp(u, 0.12 + 0.5 * POST_U[i], smoothstep(slotStart(i) - 0.016, slotStart(i) + 0.012, local))
    // after the last string, settle back toward the nut for the strum
    return lerp(u, 0.3, smoothstep(B.strum - 0.02, B.pull, local))
  }

  /** the tuning glide: from in front of the neck, looking back up it (q 0..1 down the neck) */
  function tunePose(q: number, local: number, out: Pose) {
    const e = easeSine(q)
    // on the treble side of the neck the whole way (the lamp comes from this side
    // too, so the glossy board and headstock never mirror it into the lens)
    const side = -1
    const cx = lerp(4.55, 3.45, e)
    const cz = lerp(1.22, 1.45, e)
    const cy = side * lerp(0.86, 0.6, e)
    G(cx, cy, cz, tv4)
    HS(aimU(local), side * 0.08, 0.05, tv3)
    lookPose(tv4, tv3, out)
    out.d *= TK.dk
    out.fov = TK.fov
    out.nx = TK.nx
    out.ny = TK.ny
    out.roll = side * 0.1
    return out
  }

  /** the camera's pose along the story (no allocation) */
  function poseAt(local: number, P: typeof K, out: Pose) {
    if (local < B.hold) return mixPose(P.land, P.land2, segment(local, 0, B.hold), out)
    if (local < B.arrive) {
      // off the headstock and down in front of the neck, turning to look back up it
      const e = easeSine(segment(local, B.hold, B.arrive))
      tunePose(0, local, tp)
      mixPose(P.land2, tp, e, out)
      out.d *= 1 + 0.25 * Math.sin(Math.PI * e)
      return out
    }
    if (local < B.pull) return tunePose(segment(local, B.arrive, B.pull), local, out)
    tunePose(1, local, tp)
    if (local < B.pay) {
      // back and up: a crane off the neck to the corner stage
      const e = easeSine(segment(local, B.pull, B.pay))
      mixPose(tp, P.pay, e, out)
      out.ph += 0.14 * Math.sin(Math.PI * e)
      return out
    }
    if (local < B.out) return mixPose(P.pay, P.pay2, segment(local, B.pay, B.out), out)
    // the push: aim onto the soundhole first, then the dolly
    const e = segment(local, B.out, 1)
    mixPose(P.pay2, P.out, e * e * (3 - 2 * e), out)
    out.p.lerpVectors(P.pay2.p, P.out.p, 1 - (1 - e) * (1 - e) * (1 - e))
    // the dolly leads: the real soundhole is already big when the cut's rosette closes in
    out.d = Math.exp(lerp(Math.log(P.pay2.d), Math.log(P.out.d), 1 - (1 - e) * (1 - e)))
    return out
  }

  function offsetBox(n: HTMLElement) {
    let x = 0
    let y = 0
    for (let e: HTMLElement | null = n; e && e !== stage && e !== document.body; e = e.offsetParent as HTMLElement | null) {
      x += e.offsetLeft
      y += e.offsetTop
    }
    return { l: x, t: y, r: x + n.offsetWidth, b: y + n.offsetHeight }
  }

  function measure(frame: Frame) {
    lay.w = frame.width
    lay.h = frame.height
    lay.at = performance.now()
    if (!land || !land.offsetParent) return
    const lb = offsetBox(land)
    if (lb.b - lb.t > 40) {
      lay.safeT = lb.t
      lay.safeB = lb.b
    }
    // the right edge of what's written (words, not column boxes)
    let r = 0
    for (const wd of title.querySelectorAll<HTMLElement>('.rise-w')) r = Math.max(r, offsetBox(wd).r)
    for (const c of Array.from(headBlock.children) as HTMLElement[]) if (c !== title) r = Math.max(r, offsetBox(c).r)
    r = Math.max(r, offsetBox((hint.firstElementChild as HTMLElement) ?? hint).r)
    if (r > 0) lay.landR = r
    lay.headB = offsetBox(headBlock).b
    lay.footT = offsetBox(hint).t
    const tb = offsetBox(tuneCard)
    lay.tuneR = tb.r
    lay.tuneT = tb.t
    let pr = 0
    for (const c of [...Array.from(payTop.children), ...Array.from(payBot.children)] as HTMLElement[]) pr = Math.max(pr, offsetBox(c).r)
    if (pr > 0) lay.payR = pr
    lay.payTopB = offsetBox(payTop).b
    lay.payBotT = offsetBox(payBot).t
  }

  /** the monogram's landing-frame screen rect → CSS vars for the loader's match cut */
  function publishMark(frame: Frame) {
    const P = poses(frame)
    if (markKey === posesKey || !markPts.length) return
    markKey = posesKey
    const w = frame.width
    const h = frame.height
    const aspect = w / Math.max(1, h)
    poseAt(0, P, cur)
    probe.fov = cur.fov
    probe.aspect = aspect
    probe.updateProjectionMatrix()
    place(cur, aspect, probe.position, probeT)
    probe.up.set(0, 1, 0)
    probe.lookAt(probeT)
    probe.updateMatrixWorld()
    const px = (v: THREE.Vector3) => {
      tv3.copy(v).project(probe)
      return [(tv3.x * 0.5 + 0.5) * w, (0.5 - tv3.y * 0.5) * h]
    }
    // markPts: centre, the lettering's left/right ends, a font-size's top/bottom
    const [cx, cy] = px(markPts[0])
    const [lx, ly] = px(markPts[1])
    const [rx, ry] = px(markPts[2])
    const [tx, ty] = px(markPts[3])
    const [bx, by] = px(markPts[4])
    const size = Math.hypot(rx - lx, ry - ly)
    const font = Math.hypot(bx - tx, by - ty)
    // the reading direction's on-screen angle (degrees, clockwise, 0 = level)
    const angle = (Math.atan2(ry - ly, rx - lx) * 180) / Math.PI
    if (!Number.isFinite(cx + cy + size + font + angle)) return
    const st = document.documentElement.style
    st.setProperty('--hark-mark-x', `${cx.toFixed(1)}px`)
    st.setProperty('--hark-mark-y', `${cy.toFixed(1)}px`)
    st.setProperty('--hark-mark-size', `${size.toFixed(1)}px`)
    st.setProperty('--hark-mark-font', `${font.toFixed(1)}px`)
    st.setProperty('--hark-mark-angle', `${angle.toFixed(2)}`)
  }

  /* ------------------------------------------------------------------ build */

  function buildScene(ctx: ChapterContext) {
    g = buildGuitar({ mobile: ctx.mobile })
    g.group.rotation.z = Math.PI / 2
    rig.rotation.x = -LEAN
    rig.add(g.group)
    yawG.rotation.y = RIG_YAW
    yawG.add(rig)
    group.add(yawG)
    // the cradle arms meet the lower bout where the outline crosses y = ±0.78
    const outline = bodyOutline()
    let cradleX = -1.96
    for (const p of outline) if (p.x < 0 && Math.abs(Math.abs(p.y) - 0.78) < 0.06) cradleX = Math.min(cradleX, p.x)
    cradleX -= 0.1
    rig.updateMatrixWorld(true)
    const Mrig = new THREE.Matrix4().multiplyMatrices(rig.matrix, g.group.matrix)
    const c0 = new THREE.Vector3(cradleX, 0, -0.5).applyMatrix4(Mrig)
    rig.position.set(-c0.x, CRADLE_H - c0.y, -c0.z)
    rig.updateMatrix()
    group.updateMatrixWorld(true)
    const M = new THREE.Matrix4().multiplyMatrices(rig.matrix, g.group.matrix)
    yawG.add(buildStand(M, { yokeX: YOKE_X, cradleX }))

    // the paddle buttons: turn about the shaft, so a turning peg reads (the
    // kit's buttons are thin discs across the shaft; see coreChangeRequests)
    const paddle = new THREE.SphereGeometry(0.12, 20, 14)
    paddle.scale(1, 0.8, 0.36)
    for (const t of g.parts.tuners.children) {
      const kids = t.children as THREE.Mesh[]
      const btn = kids[4]
      btn.geometry = paddle
      buttons.push(btn)
      posts.push(kids[0])
    }
    // a satin Richlite board (the lamp is a sheen on it, not a mirror)
    {
      const board = (g.parts.neck.children[1] as THREE.Mesh).material as THREE.MeshPhysicalMaterial
      board.roughness = 0.6
      board.clearcoat = 0.15
    }
    // a satin chrome on this instance's tuners: the lamp glints, never blooms into a bulb
    ;((buttons[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).roughness = 0.3

    // points of interest
    g.parts.headstock.updateMatrixWorld(true)
    HS(0.72, 0, 0.02, W.head)
    g.parts.logo.updateMatrixWorld(true)
    g.parts.logo.getWorldPosition(W.mark)
    G(SOUNDHOLE.x, SOUNDHOLE.y, 0.02, W.hole)
    W.holeN.set(0, 0, 1).transformDirection(g.group.matrixWorld)
    // the lettering's box in the logo mesh's own space (the tile is 512 × 256 → 0.62 × 0.31)
    {
      const c = document.createElement('canvas').getContext('2d')!
      c.font = FONT.displayItalic(150, 640)
      const tw = c.measureText('GJP').width || 300
      const markW = (tw / 512) * 0.62
      const markFont = (150 / 512) * 0.62
      for (const [x, y] of [
        [0, 0],
        [-markW / 2, 0],
        [markW / 2, 0],
        [0, markFont / 2],
        [0, -markFont / 2],
      ])
        markPts.push(g.parts.logo.localToWorld(new THREE.Vector3(x, y, 0)))
    }
    // the letters' row: along the nut, toward the headstock
    G(SCALE + 0.03, g.stringY(0, SCALE), 0.1, nutAt[0])
    G(SCALE + 0.03, g.stringY(5, SCALE), 0.1, nutAt[1])
    HS(1.2, 0, 0.02, tipAt)
  }

  function buildRoom() {
    // the setup's centre (for the payoff framing): guitar, stool, mic, lamp
    W.whole.set(2.2, 7.4, -3.4)
    group.add(buildFloor(new THREE.Vector3(2, 0, -3)))
    const rug = buildRug(12, 16)
    rug.position.set(2.6, 0, -3.6)
    rug.rotation.y = Math.PI / 2 + 0.07
    group.add(rug)
    const stool = buildStool(SEAT_H)
    stool.position.copy(STOOL)
    stool.rotation.y = 0.3
    group.add(stool)
    // the mic: at the mouth of someone sat on the stool, a little in front
    const mouth = STOOL.clone().add(new THREE.Vector3(-0.1, SEAT_H + 6.8, 0.4))
    const grille = mouth.clone().add(new THREE.Vector3(0.25, -0.3, 1.35))
    const mic = buildMicStand(MIC_BASE, grille, mouth)
    group.add(mic.group)
    lamp = buildFloorLamp(13.8)
    lamp.group.position.copy(LAMP)
    group.add(lamp.group)
    // the lamp's own warm light (intensity only; never toggled)
    lampLight = new THREE.PointLight(GEL.bulb, 0, 26, 2)
    lampLight.position.copy(LAMP).add(lamp.bulb).add(new THREE.Vector3(0, -1.1, 0))
    group.add(lampLight)
    // festoon strands: one low along the back of the room, two overhead
    festoon = new Festoon(
      [
        { a: new THREE.Vector3(-22, 19.8, -15.5), b: new THREE.Vector3(0.5, 20.6, -14.6), sag: 2.2, spacing: 2.25 },
        { a: new THREE.Vector3(0.5, 20.6, -14.6), b: new THREE.Vector3(24, 19.6, -12.8), sag: 2.6, spacing: 2.35 },
        { a: new THREE.Vector3(-14, 24.5, 3), b: new THREE.Vector3(16, 24, -9), sag: 2.8, spacing: 2.9 },
      ],
      { color: GEL.bulb, bulbR: 0.22, aperture: 0.7 },
    )
    group.add(festoon.mesh)
    // the setlist, taped down in front of the stool, reading toward the stool
    const set = buildSetlist(
      ALBUMS[0].tracks.map(t => t.title),
      TUNING.join(''),
    )
    set.position.set(STOOL.x - 1.2, 0, STOOL.z + 3.3)
    set.rotation.y = Math.PI + 0.22
    group.add(set)
  }

  /* ------------------------------------------------------------------ DOM */

  function buildCopy(ctx: ChapterContext) {
    stage = ctx.stage
    // LANDING: the banner badge + the h1, the scroll hint at the foot of the column
    land = el('div', 'hero-land', undefined, stage)
    headBlock = el('div', 'hero-head', undefined, land)
    const badge = el('p', 'hero-badge', undefined, headBlock)
    el('span', 'hero-badge-dot', undefined, badge)
    el('span', 'hero-badge-text', ARTIST.banner, badge)
    title = rise(el('h1', 'hud-title hero-title', undefined, headBlock), 'Greg Jones <em>Project</em>')
    hint = el('p', 'hud-label hero-hint', undefined, land)
    const hintInner = el('span', 'hero-hint-inner', undefined, hint)
    el('span', 'hero-hint-string', undefined, hintInner)
    el('span', 'hero-hint-text', `${MICROCOPY.scrollHint} ↓`, hintInner)

    // TUNING: a little tuner card — the note, a needle, the six strings
    tune = el('div', 'hero-tune', undefined, stage)
    tuneCard = el('div', 'hud-panel hero-tune-card', undefined, tune)
    el('p', 'hud-label hero-tune-label', GEAR.guitar.tuning, tuneCard)
    const meter = el('div', 'hero-tune-meter', undefined, tuneCard)
    meter.innerHTML = `<svg viewBox="-60 -54 120 62" aria-hidden="true">
      <path class="hero-tune-arc" d="M-46,-4 A48,48 0 0 1 46,-4" />
      ${Array.from({ length: 11 }, (_, k) => {
        const a = ((k - 5) / 5) * 0.9
        const r0 = k === 5 ? 36 : 40
        return `<line class="hero-tune-tick${k === 5 ? ' is-mid' : ''}" x1="${(Math.sin(a) * r0).toFixed(2)}" y1="${(-Math.cos(a) * r0).toFixed(2)}" x2="${(Math.sin(a) * 46).toFixed(2)}" y2="${(-Math.cos(a) * 46).toFixed(2)}" />`
      }).join('')}
      <g class="hero-tune-needle"><line x1="0" y1="2" x2="0" y2="-43" /><circle r="3.4" /></g>
    </svg>`
    needle = meter.querySelector('.hero-tune-needle') as SVGGElement
    const notes = el('ol', 'hero-tune-notes', undefined, tuneCard)
    noteEls = TUNING.map(n => el('li', 'hero-tune-note', n, notes))
    // the note letters by the nut (3D-anchored)
    letters = el('div', 'hero-letters', undefined, stage)
    letterEls = TUNING.map(n => el('span', 'hero-letter', n, letters))

    // PAYOFF: the locale, the EPK line as the lead, the bio lead, two CTAs
    pay = el('div', 'hero-pay', undefined, stage)
    payTop = el('div', 'hero-pay-top', undefined, pay)
    const loc = el('span', undefined, undefined, el('p', 'hud-eyebrow hero-locale', undefined, payTop))
    BRAND.locale.split(' · ').forEach((part, i) => {
      if (i) loc.append(' · ')
      el('span', 'hero-nowrap', part, loc)
    })
    lead = rise(el('p', 'hero-lead', undefined, payTop), ARTIST.tagline.replace(/(\S+)$/, '<em>$1</em>'))
    payBot = el('div', 'hero-pay-bot', undefined, pay)
    el('p', 'hero-lede', ARTIST.lead, payBot)
    const ctas = el('div', 'hero-ctas', undefined, payBot)
    const listen = el('button', 'hud-btn', 'Listen', ctas)
    listen.type = 'button'
    listen.addEventListener('click', () => window.__hark?.land('listen'))
    const touch = el('a', 'hud-btn hud-btn--ghost', 'Get in touch', ctas)
    touch.href = '#contact'
    touch.addEventListener('click', e => {
      if (!window.__hark) return
      e.preventDefault()
      window.__hark.land('contact')
    })
  }

  /* ------------------------------------------------------------------ strings */

  function pluck(i: number, level: number, frame: Frame) {
    if (!frame.still) rings[i].strike(frame.time, level)
    lastPluck = performance.now() / 1000
    window.dispatchEvent(new CustomEvent('hark:pluck', { detail: { i, midi: MIDI[i], level } }))
  }

  /* ------------------------------------------------------------------ chapter */

  return {
    id: 'hero',
    group,
    // the CTAs (copy-layer item 0): the settled payoff
    anchors: [0.8],
    busy: () => headFade.busy || tuneFade.busy || payFade.busy || queue.length > 0 || letterFade.some(f => f.busy) || !revealed,

    async init(ctx) {
      whenRevealed().then(() => (revealed = true))
      // the headstock monogram is a canvas tile drawn once, in Fraunces: wait for the face
      await fontsReady()
      buildScene(ctx)
      await nextFrame()
      buildRoom()
      await nextFrame()
      buildCopy(ctx)
    },

    onEnter() {
      snapCopy = true
      lastLocal = NaN
      queue.length = 0
    },

    update(local, frame, ctx) {
      const lc = clamp(local)
      // layout: the same test as the CSS (max-aspect-ratio: 1/1 → portrait)
      const p = frame.height >= frame.width
      const s = !p && frame.height <= 500
      if (p !== portrait || s !== short) {
        portrait = p
        short = s
        posesKey = ''
        // portrait plates sit against the chrome bands: fade in place, never slide into them
        dy = p ? 0 : 12
      }
      if (frame.width !== lay.w || frame.height !== lay.h || performance.now() - lay.at > 1000) measure(frame)
      publishMark(frame)
      poseAt(lc, poses(frame), cur)

      const now = frame.time
      const wall = performance.now() / 1000
      const teleport = !Number.isFinite(lastLocal) || Math.abs(lc - lastLocal) > 0.12

      /* ---- tuning: plucks on crossing each string's beat going forward; queued, ≥ 0.16 s apart ---- */
      if (revealed) {
        if (teleport) {
          queue.length = 0
          // landing inside a string's beat: that string rings (softer)
          for (let i = 0; i < 6; i++) if (lc >= pluckAt(i) && lc < pluckAt(i) + 0.03) queue.push({ i, level: 0.6, at: wall })
        } else if (lc > lastLocal) {
          for (let i = 0; i < 6; i++) {
            // the peg starts to turn: a little foley click-and-creak (rate-limited by TIME)
            const turnAt = slotStart(i) + TURN_A
            if (lastLocal < turnAt && lc >= turnAt && wall - pegAt > 0.3) {
              pegAt = wall
              window.dispatchEvent(new CustomEvent('hark:sfx', { detail: { kind: 'peg', level: 0.55 } }))
            }
            if (lastLocal < pluckAt(i) && lc >= pluckAt(i)) queue.push({ i, level: 1, at: wall })
          }
          // all six together once they're in tune (rate-limited by TIME)
          if (lastLocal < B.strum && lc >= B.strum && wall - strumAt > 1.6) {
            strumAt = wall
            queue.length = 0
            if (!frame.still) for (let i = 0; i < 6; i++) rings[i].strike(now + i * 0.045, 0.85 - i * 0.04)
            window.dispatchEvent(new CustomEvent('hark:strum', { detail: { level: 0.7 } }))
          }
        }
        // a fling never leaves a backlog: drop anything that waited too long
        while (queue.length && wall - queue[0].at > 0.9) queue.shift()
        if (queue.length && wall - lastPluck >= 0.16) {
          const q = queue.shift()!
          pluck(q.i, q.level, frame)
        }
      }

      /* ---- the strings + the pegs ---- */
      const st = g.strings
      for (let i = 0; i < 6; i++) {
        let a = rings[i].value(now) * PLUCK_AMP[i]
        // Motion off: a still, readable ring on the string just tuned
        if (frame.still) a = Math.max(a, 0.004 * (smoothstep(pluckAt(i), pluckAt(i) + 0.004, lc) * (1 - smoothstep(pluckAt(i) + 0.03, pluckAt(i) + 0.05, lc))))
        st.amp[i] = a
        // the peg turns while its string comes up to pitch (by scroll; screenshot-safe)
        const turn = easeSine(segment(lc, slotStart(i) + TURN_A, slotStart(i) + TURN_B))
        const ang = turn * Math.PI * 1.25
        buttons[i].rotation.y = BTN_REST[i] + ang
        posts[i].rotation.z = -ang * 0.12
      }
      st.wobble = 0
      st.tint.set('#ece4d6')
      st.light.set(GEL.tungsten).multiplyScalar(1.02)
      st.lightDir.set(0.35, 1, 0.75)
      g.update(frame, ctx.camera, ctx.renderer)

      /* ---- light ---- */
      const w = ctx.world.params
      const payK = smoothstep(B.pull, B.pay, lc)
      const outK = smoothstep(B.out, 1, lc)
      const tuneK = smoothstep(B.hold, B.arrive, lc) * (1 - payK)
      // the lamp rides the camera's point of interest, hung high and in front
      const focus = cur.p
      w.spotAt.copy(focus).add(tv3.set(0.6 * payK * (1 - outK), -2.6 * payK * (1 - outK), 0.4 * payK * (1 - outK)))
      // (while the camera looks up the neck the lamp swings off to the side, so the
      // board doesn't mirror it straight back into the lens)
      // from the camera's own side of the neck (the treble side, world +x)
      w.spotPos.set(focus.x + lerp(5.5, 10.5, tuneK), focus.y + lerp(17, 15, tuneK), focus.z + lerp(11, 5, tuneK))
      const radius = lerp(lerp(lerp(2.1, 2.6, tuneK), 10.5, payK), 5.2, outK)
      w.spotAngle = Math.atan(radius / 21)
      w.spotPenumbra = lerp(0.62, 0.5, payK)
      w.spot = lerp(lerp(1.15, 1.2, tuneK), 1.25, payK)
      w.spotColor = GEL.tungsten
      w.rimA = lerp(0.55, 0.8, payK)
      w.rimAColor = GEL.amber
      w.rimADir.set(-0.85, 0.55, -1)
      w.rimB = lerp(0.22, 0.3, payK)
      w.rimBColor = GEL.dusk
      w.rimBDir.set(0.95, 0.35, -1)
      w.haze = lerp(0.36, 0.55, payK)
      w.hazeColor = '#a0582a'
      w.hazeY = lerp(-0.08, -0.2, payK)
      w.bulbs = lerp(lerp(0.5, 0.8, tuneK), 1.1, payK)
      w.bulbColor = GEL.bulb
      w.bokeh = lerp(0.12, 0.3, payK)
      w.bokehA = GEL.amber
      w.bokehB = GEL.candle
      w.beams = 0
      w.fill = lerp(0.07, 0.1, payK)
      w.env = lerp(0.8, 1, smoothstep(0.08, 0.3, lc))
      // the bulbs sweep across the lacquer as the camera travels
      w.envTurn = lerp(-0.4, 0.6, easeSine(segment(lc, 0.05, B.pay))) + 0.2 * outK
      // the floor lamp warms up as the room comes into view (smoothed by TIME: no flicker on a scrub)
      const lampT = smoothstep(B.pull - 0.02, B.pay - 0.04, lc)
      lampLevel = snapCopy || teleport ? lampT : lampLevel + (lampT - lampLevel) * (1 - Math.exp(-frame.dt / 0.35))
      lamp.setGlow(lampLevel)
      lampLight.intensity = 26 * lampLevel
      // the festoon: soft discs close up, small hot bulbs once the room is in view
      // (the aperture scales with the focus distance: far lights blur by the same angle at any focus)
      festoon.update(ctx.camera, ctx.renderer, cur.d, lerp(lerp(0.95, 0.58, tuneK), 1.1, payK), cur.d * lerp(lerp(0.12, 0.085, tuneK), 0.09, payK))

      /* ---- post ---- */
      const pp = ctx.post.params
      pp.bloomThreshold = lerp(0.95, 0.9, payK)
      pp.bloomRadius = 0.55
      pp.bloomStrength = lerp(lerp(0.22, 0.14, tuneK), 0.42, payK)
      pp.lift = 0.014
      pp.vignette = lerp(0.62, 0.56, payK)
      pp.warmth = 1
      // no thump in the hero: a quiet room, the first sound is a string
      pp.glitch = 0

      /* ---- copy: each block fades by TIME once the scroll crosses its threshold ---- */
      const snap = snapCopy || teleport
      snapCopy = false
      lastLocal = lc
      const onHead = lc < HEAD_OUT
      const onTune = lc > TUNE_IN && lc < TUNE_OUT
      const onPay = lc > (portrait ? PAY_IN_PORTRAIT : PAY_IN) && lc < PAY_OUT
      if (snap) {
        headFade.set(onHead ? 1 : 0)
        tuneFade.set(onTune ? 1 : 0)
        payFade.set(onPay ? 1 : 0)
      }
      const hl = headFade.update(onHead, frame.dt)
      const tl = tuneFade.update(onTune, frame.dt)
      // a hard stop inside the cut window: a fling never carries the CTAs into the push
      const pl = payFade.update(onPay, frame.dt) * (1 - smoothstep(0.93, 0.95, lc))
      reveal(land, hl, dy)
      setRise(title, revealed && onHead)
      reveal(tune, tl, dy)
      reveal(pay, pl, dy)
      setRise(lead, revealed && onPay)

      // the tuner card: which string, the needle coming up to pitch
      let active = -1
      for (let i = 0; i < 6; i++) if (lc >= slotStart(i)) active = i
      if (lc >= B.strum - 0.01) active = 6
      let state = ''
      for (let i = 0; i < 6; i++) state += lc >= pluckAt(i) ? 'd' : i === active ? 'a' : '-'
      if (state !== noteState) {
        noteState = state
        noteEls.forEach((n, i) => {
          n.classList.toggle('is-done', state[i] === 'd')
          n.classList.toggle('is-on', i === active || (active === 6 && state[i] === 'd'))
        })
        tuneCard.classList.toggle('is-tuned', active === 6)
      }
      let cents = -1
      if (active >= 0 && active < 6) cents = -1 + easeSine(segment(lc, slotStart(active) + TURN_A, slotStart(active) + PLUCK_AT + 0.006))
      else if (active === 6) cents = 0
      const deg = Math.round(cents * 46 * 10) / 10
      if (deg !== needleDeg) {
        needleDeg = deg
        needle.style.transform = `rotate(${deg}deg)`
      }

      // the letters by the nut: a neat row along the nut as the camera sees it, just
      // past it toward the headstock (never overlapping), each over its own string
      const vw = frame.width
      const vh = frame.height
      const cam = ctx.camera
      const scr = (v: THREE.Vector3, o: THREE.Vector2) => {
        tv3.copy(v).project(cam)
        o.set((tv3.x * 0.5 + 0.5) * vw, (0.5 - tv3.y * 0.5) * vh)
        return tv3.z < 1
      }
      const okA = scr(nutAt[0], s0)
      const okB = scr(nutAt[1], s1)
      const okC = scr(tipAt, s2)
      const vis = okA && okB && okC && Number.isFinite(s0.x + s0.y + s1.x + s1.y + s2.x + s2.y)
      sAlong.subVectors(s1, s0)
      const nutLen = sAlong.length()
      sAlong.divideScalar(Math.max(1e-3, nutLen))
      sMid.addVectors(s0, s1).multiplyScalar(0.5)
      // toward the headstock, square to the nut line
      sPerp.subVectors(s2, sMid)
      sPerp.addScaledVector(sAlong, -sPerp.dot(sAlong)).normalize()
      const fontPx = clamp((nutLen / 5) * 0.95, 17, 32)
      const step = Math.max(nutLen / 5, fontPx * 1.2)
      for (let i = 0; i < 6; i++) {
        const on = vis && lc >= pluckAt(i) && lc < 0.57
        if (snap) letterFade[i].set(on ? 1 : 0)
        const v = letterFade[i].update(on, frame.dt)
        const le = letterEls[i]
        reveal(le, v, 0)
        if (v > 0) {
          const x = sMid.x + sAlong.x * (i - 2.5) * step + sPerp.x * fontPx * 0.95
          const y = sMid.y + sAlong.y * (i - 2.5) * step + sPerp.y * fontPx * 0.95
          if (Number.isFinite(x + y)) le.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
        }
        const fresh = on && lc < pluckAt(i) + 0.03
        if (le.classList.contains('is-fresh') !== fresh) le.classList.toggle('is-fresh', fresh)
      }
      const px = Math.round(fontPx)
      if (Number.isFinite(px) && px !== letterPx) {
        letterPx = px
        letters.style.setProperty('--letter', `${px}px`)
      }
    },

    camera(local: number, frame: Frame, out: CameraPose) {
      const P = poses(frame)
      poseAt(clamp(local), P, cur)
      const aspect = frame.width / Math.max(1, frame.height)
      place(cur, aspect, out.position, out.target)
      out.fov = cur.fov
      out.roll = cur.roll
      out.parallax = lerp(0.05, 0.22, smoothstep(B.pull, B.pay, local)) * (1 - smoothstep(B.out, 1, local))
    },
  }
}
