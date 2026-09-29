import * as THREE from 'three'
import type { Chapter, ChapterContext, Frame } from '../../core/types'
import { Callout, el, reveal, rise, setRise } from '../../core/dom'
import { ALBUMS, GEAR, SECTIONS } from '../../content'
import { clamp, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { StoryClock } from '../../kit/pace'
import { buildGuitar, fretX, NECK_JOINT, SCALE, TUNING, type Guitar } from '../../kit/guitar'
import { Ring } from '../../kit/strings'
import { buildPedal, gaffer, stageFloor, type Pedal } from '../../kit/stage'
import { fontsReady } from '../../kit/materials'
import { GEL } from '../../world/World'
import { cableCoil, capo, floorLamp, mergeStatic, guitarStand, harmonica, jackPlug, mats, micStand, paColumn, pedalboard, picks, rug, setlist, sideTable, stool, stringPack, tube, type Capo } from './props'
import './gear.css'

/*
 * GEAR · "THE RIG" — a rig rundown of Greg's solo-show setup, on the corner
 * stage after dark: his acoustic on its stand, a little tavern table behind
 * it with the small stuff (picks, strings, harmonica, a coiled cable), the
 * boom-stand vocal mic, the column PA behind the stool spot and a small
 * pedalboard at the singer's feet, all on a faded kilim under the festoon
 * bulbs. The camera tours it the way a rig-rundown video does — slowly,
 * item by item, the lamp's pool following along.
 *
 * Laid out in local progress (LEN = 6.4 vh):
 *   0 – 0.03     the soundhole cut opens on the whole rig (lit)
 *   0.03 – A     "Gear" / I use the following gear (almost exclusively) on
 *                solo shows: — held ~0.5 vh (landing / intro 0.07)
 *   A – B        ten items, weighted slots (~0.5–0.7 vh each), the card
 *                names the item on screen:
 *                0 the guitar (callouts on the 3D guitar + the full spec list)
 *                1 the tuning: close on the nut, D A D G B D plucked low→high
 *                2 picks · 3 strings · 4 capo (it squeezes off the headstock,
 *                  slides down and clamps at the 2nd fret) · 5 harmonica ·
 *                  6 cables · 7 microphone · 8 the PA · 9 the pedals (the
 *                  looper is stomped: its LED lights)
 *   B – 1        the view from the stool out into the room, lit, into the cut
 *
 * PACING (WCAG 2.3.1): the camera and the card follow a StoryClock (≤ ~1.05
 * item changes a second; every move between items takes ≥ 0.5 s of time);
 * the plucks, the stomp and the thump are rate-limited by TIME.
 */

const LEN = 6.4
const N = 10
/** slot weights: the guitar and the tuning read longer */
const WEIGHT = [1.4, 1.15, 1, 1, 1, 1, 1, 1, 1.05, 1.15]
const A = 0.112
const B = 0.952
const UNIT = (B - A) / WEIGHT.reduce((a, b) => a + b, 0)
const S: number[] = [A]
for (const w of WEIGHT) S.push(S[S.length - 1] + w * UNIT)
/** each move between items straddles the slot boundary */
const GLIDE = 0.56 * UNIT
/** the clock: local units per second (a glide takes GLIDE / RATE ≈ 0.53 s) */
const RATE = 1.05 * UNIT
const ANCHORS = WEIGHT.map((_, i) => S[i] + (S[i + 1] - S[i]) * 0.56)
const HEAD: [number, number] = [0.028, A + 0.004]
const CARD: [number, number] = [A - 0.002, B + 0.006]
/** the capo leaves the headstock and clamps at the 2nd fret over this range */
const CAPO: [number, number] = [S[4] - 0.12 * UNIT, S[4] + 0.44 * UNIT]
const TILT = -0.13
const YAW = 0.16
const CRADLE = 1.06
const TAIL = NECK_JOINT - 4.93
/** MIDI notes of DADGBD, low to high */
const MIDI = [38, 45, 50, 55, 59, 62]

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const approach = (x: number, to: number, step: number) => (x < to ? Math.min(to, x + step) : Math.max(to, x - step))

/* ---------------------------------------------------------------- camera keys */

type Mode = 'head' | 'card' | 'free'
interface Shot {
  yaw: number
  pitch: number
  w: number
  h: number
  fov: number
  /**
   * how the subject is moved off-centre into the free area: 1 = slide the
   * camera sideways (a shifted lens, the default), 0 = turn it instead (the
   * camera stays put — for shots where a slide would walk it into a prop)
   */
  shift: number
}
interface Key extends Shot {
  at: THREE.Vector3
  mode: Mode
  /** where the lamp hangs, as a direction from the subject */
  lamp: THREE.Vector3
  /** what the lamp's pool falls on (default: the focus) */
  lit?: THREE.Vector3
  /** a fixed eye instead of a fitted framing: the camera rises from [0] to [1] over the hold, looking at `at` */
  eye?: [THREE.Vector3, THREE.Vector3]
  /** drift over the hold: yaw (deg), pitch (deg), zoom (fraction) */
  drift: [number, number, number]
  /** portrait overrides */
  p?: Partial<Shot> & { at?: THREE.Vector3 }
  /** short-landscape (phone sideways) overrides */
  sl?: Partial<Shot>
}
interface Resolved extends Shot {
  t: THREE.Vector3
  cx: number
  cy: number
  fx: number
  fy: number
}
const resolved = (): Resolved => ({ t: V(), yaw: 0, pitch: 0, w: 1, h: 1, fov: 32, shift: 1, cx: 0, cy: 0, fx: 1, fy: 1 })

export default function create(): Chapter {
  const group = new THREE.Group()
  const clock = new StoryClock({ rate: RATE })

  // scene
  let g: Guitar
  let theCapo: Capo
  const capoPark = { p: V(), q: new THREE.Quaternion() }
  const capoClamp = { p: V(), q: new THREE.Quaternion() }
  let pedals: Pedal[] = []
  let lampLight: THREE.PointLight
  const rings = TUNING.map(() => new Ring(2.2, 0.3))
  /** when each string was last plucked (its tag glows for ~half a second) */
  const struckAt = TUNING.map(() => -1e9)
  const hotShown = TUNING.map(() => -1)
  const pts = {
    rig: V(),
    guitar: V(),
    body: V(),
    nut: V(),
    fret2: V(),
    picks: V(),
    pack: V(),
    harp: V(),
    coil: V(),
    mic: V(),
    pa: V(),
    board: V(),
    room: V(),
    lamp: V(),
  }
  const calloutAt: THREE.Vector3[] = []
  const postAt: THREE.Vector3[] = []
  const tagAt: THREE.Vector3[] = []
  let keys: Key[] = []
  let introKey: Key
  let outKey: Key

  // DOM
  let stage: HTMLElement
  let head: HTMLElement
  let title: HTMLElement
  let card: HTMLElement
  let clip: HTMLElement
  let idxEl: HTMLElement
  let bulbs: HTMLElement[] = []
  const pages: HTMLElement[] = []
  const pageTitles: HTMLElement[] = []
  const noteChips: HTMLElement[] = []
  const callouts: Callout[] = []
  let tuneWrap: HTMLElement
  let tuneSvg: SVGSVGElement
  const tuneLines: SVGPathElement[] = []
  const tuneTags: HTMLElement[] = []
  let shown = -1
  let bodyK = 1
  let pending = -1

  // layout measured from the DOM (never read per frame)
  const regions = { key: '', headR: 0, headB: 0, cardR: 0, cardB: 0, base: 0, pageH: [] as number[] }

  // time
  let now = 0
  let prevLocal = -1
  let arpAt = -1
  let arpLast = -1e9
  let arpFired = 0
  let arpArmed = true
  let stompAt = -1e9
  let lastStomp = -1e9
  let thumpAt = -1e9
  let prevQ = -1
  let ledK = 0
  let capoRang = false
  let capoAt = -1e9
  let settling = false

  // camera
  const pose = { position: V(0, 8, 20), target: V(0, 6, 0), fov: 32, parallax: 0.1 }
  const rA = resolved()
  const rB = resolved()
  const dir = V()
  const fwd = V()
  const vR = V()
  const vU = V()
  const tmp = V()
  const tmp2 = V()
  const tmpQ = new THREE.Quaternion()
  const tmpS = V(1, 1, 1)
  const UP = V(0, 1, 0)
  const focusNow = V()
  const eyeA = V()
  const eyeB = V()
  const eyeD = V()
  const eyeF = V()
  const eyeR = V()
  const eyeU = V()
  const eyeS = V()
  const lampNow = V(0.3, 0.85, 0.45)
  const litNow = V()
  let moveK = 0
  let shotSize = 10

  const gw = (x: number, y: number, z: number, out = V()) => g.group.localToWorld(out.set(x, y, z))

  const bands = (W: number, H: number) =>
    W > H && H <= 500 ? { top: 52, bot: 52 } : { top: clamp(H * 0.105, 80, 112), bot: W <= 560 && H > W ? 96 : clamp(H * 0.105, 82, 110) }
  const gutter = (W: number) => clamp(W * 0.034, 16, 48)

  function measure(frame: Frame) {
    const key = `${frame.width}x${frame.height}`
    if (regions.key === key || !card) return
    regions.key = key
    const hb = head.getBoundingClientRect()
    regions.headR = hb.right
    regions.headB = hb.bottom
    // every page's height (they share one grid cell); the card's frame around the clip
    regions.pageH = pages.map(p => p.offsetHeight)
    const cb = card.getBoundingClientRect()
    regions.cardR = cb.right
    regions.cardB = cb.bottom
    regions.base = card.offsetHeight - clip.offsetHeight
    fitClip(true)
  }

  function fitClip(instant = false) {
    const h = regions.pageH[Math.max(0, shown)]
    if (!(h > 0)) return
    if (instant) clip.style.transition = 'none'
    clip.style.height = `${h}px`
    if (instant) {
      void clip.offsetHeight
      clip.style.transition = ''
    }
  }

  function resolve(k: Key, item: number, frame: Frame, out: Resolved) {
    const W = Math.max(1, frame.width)
    const H = Math.max(1, frame.height)
    const portrait = H > W
    const p: Partial<Shot> & { at?: THREE.Vector3 } = portrait && k.p ? k.p : !portrait && H <= 500 && k.sl ? k.sl : {}
    out.t.copy(p.at ?? k.at)
    out.yaw = p.yaw ?? k.yaw
    out.pitch = p.pitch ?? k.pitch
    out.w = p.w ?? k.w
    out.h = p.h ?? k.h
    out.fov = p.fov ?? (portrait ? Math.max(k.fov, 36) : k.fov)
    out.shift = p.shift ?? k.shift
    const gt = gutter(W)
    const b = bands(W, H)
    let x0 = gt * 0.5
    let x1 = W - gt * 0.5
    // (a phone sideways: the thin chrome bands are full height — keep clear of them)
    const bk = !portrait && H <= 500 ? 1 : 0.8
    let y0 = b.top * bk
    let y1 = H - b.bot * bk
    const cardTop = regions.cardB - regions.base - (regions.pageH[clamp(item, 0, N - 1)] ?? 0)
    if (!portrait) {
      if (k.mode === 'head') x0 = Math.min(regions.headR + 24, W * 0.36)
      else if (k.mode === 'card') x0 = regions.cardR + 28
    } else {
      if (k.mode === 'head') y0 = regions.headB + 10
      else if (k.mode === 'card') y1 = cardTop - 10
    }
    if (x1 - x0 < W * 0.3) x0 = x1 - W * 0.3
    if (y1 - y0 < H * 0.2) y0 = y1 - H * 0.2
    out.cx = (x0 + x1) / W - 1
    out.cy = 1 - (y0 + y1) / H
    out.fx = (x1 - x0) / W
    out.fy = (y1 - y0) / H
  }

  /** hold drift: the key nudged by its drift over the hold (h = -0.5 … 0.5) */
  function drifted(r: Resolved, k: Key, h: number) {
    r.yaw += k.drift[0] * h
    r.pitch += k.drift[1] * h
    const z = 1 - k.drift[2] * h
    r.w *= z
    r.h *= z
  }

  function computePose(q: number, frame: Frame) {
    // which segment of the track: intro hold, a move, an item hold, the outro
    const G = GLIDE / 2
    let ka: Key
    let kb: Key
    let ia: number
    let ib: number
    let f: number
    let hA = 0.5
    let hB = -0.5
    let hold = false
    if (q < A - G) {
      ka = kb = introKey
      ia = ib = 0
      f = 0
      hA = hB = segment(q, 0, A - G) - 0.5
      hold = true
    } else if (q >= B + G) {
      ka = kb = outKey
      ia = ib = N - 1
      f = 0
      hA = hB = segment(q, B + G, 1) - 0.5
      hold = true
    } else {
      // the boundary nearest q
      let j = 0
      let best = Infinity
      for (let i = 0; i <= N; i++) {
        const d = Math.abs(q - S[i])
        if (d < best) {
          best = d
          j = i
        }
      }
      if (best <= G) {
        // a move across boundary j
        ka = j === 0 ? introKey : keys[j - 1]
        kb = j === N ? outKey : keys[j]
        ia = Math.max(0, j - 1)
        ib = Math.min(N - 1, j)
        f = smoother(clamp((q - (S[j] - G)) / (2 * G)))
        hA = 0.5
        hB = -0.5
      } else {
        // holding item i
        let i = 0
        while (i < N - 1 && q >= S[i + 1]) i++
        ka = kb = keys[i]
        ia = ib = i
        f = 0
        hA = hB = segment(q, S[i] + G, S[i + 1] - G) - 0.5
        hold = true
      }
    }
    resolve(ka, ia, frame, rA)
    drifted(rA, ka, hA)
    if (!hold) {
      resolve(kb, ib, frame, rB)
      drifted(rB, kb, hB)
    }
    const L = (a: number, b: number) => (hold ? a : a + (b - a) * f)
    const yaw = THREE.MathUtils.degToRad(L(rA.yaw, rB.yaw))
    const pitch = THREE.MathUtils.degToRad(L(rA.pitch, rB.pitch))
    const w = L(rA.w, rB.w)
    const h = L(rA.h, rB.h)
    const cx = L(rA.cx, rB.cx)
    const cy = L(rA.cy, rB.cy)
    const fx = L(rA.fx, rB.fx)
    const fy = L(rA.fy, rB.fy)
    const fov = L(rA.fov, rB.fov)
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const tanH = tanV * Math.max(0.2, frame.width / Math.max(1, frame.height))
    const dist = Math.max(w / 2 / (tanH * fx), h / 2 / (tanV * fy))
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    fwd.copy(dir).negate()
    vR.crossVectors(fwd, UP).normalize()
    vU.crossVectors(vR, fwd)
    const hw = dist * tanH
    const hh = dist * tanV
    if (hold) {
      focusNow.copy(rA.t)
      lampNow.copy(ka.lamp)
      litNow.copy(ka.lit ?? rA.t)
      moveK = 0
    } else {
      focusNow.lerpVectors(rA.t, rB.t, f)
      lampNow.lerpVectors(ka.lamp, kb.lamp, f)
      // the pool stays on one subject, then swings to the next (never on empty air)
      litNow.lerpVectors(ka.lit ?? rA.t, kb.lit ?? rB.t, smoother(smoothstep(0.25, 0.75, f)))
      moveK = Math.sin(Math.PI * f)
    }
    // the focus lands at the free area's centre: part slide, part turn
    const sh = L(rA.shift, rB.shift)
    pose.target.copy(focusNow).addScaledVector(vR, -cx * hw).addScaledVector(vU, -cy * hh)
    pose.position.copy(focusNow).addScaledVector(dir, dist).addScaledVector(tmp2.subVectors(pose.target, focusNow), sh)
    pose.fov = fov
    shotSize = Math.max(w, h)
    pose.parallax = clamp(shotSize * 0.012, 0.015, 0.2)
    // a fixed-eye key (the outro): blend the fitted pose of the other key into it
    if (ka.eye || kb.eye) {
      const e = (k: Key, h: number, pos: THREE.Vector3, tgt: THREE.Vector3) => {
        pos.lerpVectors(k.eye![0], k.eye![1], h + 0.5)
        tgt.copy(k.at)
      }
      if (hold) {
        e(ka, hA, pose.position, pose.target)
        pose.fov = ka.fov
      } else {
        // the fitted side of the move is the other key alone (its hold pose)
        const aPos = eyeA
        const aTgt = eyeB
        if (kb.eye) {
          fitPose(rA, frame, aPos, aTgt)
          e(kb, hB, pose.position, pose.target)
          pose.position.lerpVectors(aPos, pose.position, f)
          pose.target.lerpVectors(aTgt, pose.target, f)
          pose.fov = lerp(rA.fov, kb.fov, f)
        } else {
          fitPose(rB, frame, aPos, aTgt)
          e(ka, hA, pose.position, pose.target)
          pose.position.lerp(aPos, f)
          pose.target.lerp(aTgt, f)
          pose.fov = lerp(ka.fov, rB.fov, f)
        }
      }
      shotSize = 12
      pose.parallax = 0.06
    }
  }

  /** the fitted pose of one resolved key */
  function fitPose(r: Resolved, frame: Frame, pos: THREE.Vector3, tgt: THREE.Vector3) {
    const yaw = THREE.MathUtils.degToRad(r.yaw)
    const pitch = THREE.MathUtils.degToRad(r.pitch)
    const tanV = Math.tan(THREE.MathUtils.degToRad(r.fov / 2))
    const tanH = tanV * Math.max(0.2, frame.width / Math.max(1, frame.height))
    const dist = Math.max(r.w / 2 / (tanH * r.fx), r.h / 2 / (tanV * r.fy))
    const d = eyeD.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    const fw = eyeF.copy(d).negate()
    const rr = eyeR.crossVectors(fw, UP).normalize()
    const uu = eyeU.crossVectors(rr, fw)
    tgt.copy(r.t).addScaledVector(rr, -r.cx * dist * tanH).addScaledVector(uu, -r.cy * dist * tanV)
    pos.copy(r.t).addScaledVector(d, dist).addScaledVector(eyeS.subVectors(tgt, r.t), r.shift)
  }

  /* ---------------------------------------------------------------- the capo's move */

  function placeCapo(c: number) {
    // squeeze (open) → slide off the headstock, down past the nut → release (clamp)
    const squeeze = smoothstep(0, 0.22, c)
    const release = smoothstep(0.74, 1, c)
    const slide = smoother(segment(c, 0.16, 0.8))
    // parked on the (thinner) headstock the jaws sit closer: +0.25 rad
    const closed = lerp(0.25, 0, slide)
    theCapo.setAngle(lerp(closed, -0.5, squeeze * (1 - release)))
    tmp.lerpVectors(capoPark.p, capoClamp.p, slide)
    tmp.z += 0.12 * Math.sin(Math.PI * slide)
    tmpQ.slerpQuaternions(capoPark.q, capoClamp.q, slide)
    theCapo.group.position.copy(tmp)
    theCapo.group.quaternion.copy(tmpQ)
  }

  /* ---------------------------------------------------------------- events */

  const emit = (name: string, detail: Record<string, unknown>) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }))
    } catch {
      /* old browsers */
    }
  }

  return {
    id: 'gear',
    group,
    anchors: ANCHORS,
    busy: () => settling,

    onEnter() {
      clock.reset()
      prevLocal = -1
      prevQ = -1
      arpAt = -1
      arpArmed = true
      thumpAt = -1e9
    },

    async init(ctx: ChapterContext) {
      stage = ctx.stage
      const mobile = ctx.mobile
      await fontsReady()

      /* ---------------- floor + rug */
      const floor = stageFloor(240, 240)
      group.add(floor)
      const kilim = rug(15)
      kilim.position.set(2.6, 0.006, -0.9)
      kilim.rotation.y = 0.05
      group.add(kilim)

      /* ---------------- the guitar on its stand */
      g = buildGuitar({ mobile })
      const gg = g.group
      gg.rotation.set(TILT, YAW, Math.PI / 2)
      gg.updateMatrixWorld(true)
      {
        // rest the lowest point of the tail on the cradle
        let low = V(0, Infinity, 0)
        for (const y of [-0.9, -0.5, 0, 0.5, 0.9])
          for (const z of [0, -0.5, -1.0]) {
            const p = gg.localToWorld(V(TAIL + 0.04 + Math.abs(y) * Math.abs(y) * 0.12, y, z))
            if (p.y < low.y) low = p
          }
        const mid = gg.localToWorld(V(TAIL, 0, -0.5))
        gg.position.set(-mid.x, CRADLE - low.y, -0.45 - mid.z)
        gg.updateMatrixWorld(true)
      }
      group.add(gg)
      // the black gloss headstock face and board mirror the room's overhead softbox
      // under the lamp: keep their reflections low (chrome keeps its sparkle)
      for (const part of [g.parts.headstock, g.parts.neck])
        part.traverse(o => {
          const mm = (o as THREE.Mesh).material
          if (!mm) return
          for (const x of Array.isArray(mm) ? mm : [mm]) {
            const sm = x as THREE.MeshStandardMaterial
            if (sm.isMeshStandardMaterial && sm.metalness < 0.9) sm.envMapIntensity = 0.3
            else if (sm.isMeshStandardMaterial && o === g.parts.frets) sm.envMapIntensity = 0.45
            // the headstock's black face: satin enough that the lamp can't glare off the whole face
            const pm = x as THREE.MeshPhysicalMaterial
            if (pm.isMeshPhysicalMaterial && part === g.parts.headstock && pm.color.getHex() === 0x141211) {
              pm.roughness = 0.42
              pm.clearcoat = 0.18
              pm.clearcoatRoughness = 0.3
            }
          }
        })
      // (the tuners never turn here: one mesh instead of thirty)
      mergeStatic(g.parts.tuners)
      {
        // the yoke against the back of the upper bout
        const back = gw(1.7, 0, -0.97)
        const stand = guitarStand({ cradle: CRADLE - 0.04, yokeY: back.y, yokeZ: back.z - 0.02 })
        group.add(mergeStatic(stand))
      }
      await nextFrame()

      /* ---------------- the capo: parked on the headstock, clamps at the 2nd fret */
      theCapo = capo({ padZ: 0.08, backZ: -0.255, halfW: 0.26 })
      g.group.add(theCapo.group)
      {
        const hs = g.parts.headstock
        hs.updateMatrix()
        // at the tip, past the last tuners, nudged to the bass side so the pivot clears the edge
        const park = new THREE.Matrix4().multiplyMatrices(hs.matrix, new THREE.Matrix4().makeTranslation(1.62, 0.1, 0.028))
        park.decompose(capoPark.p, capoPark.q, tmpS)
        capoClamp.p.set(fretX(2) + 0.09, 0, 0)
        capoClamp.q.identity()
      }

      /* ---------------- the endpin plug and the cable to the pedals */
      const endpin = gw(TAIL - 0.02, 0, -0.52)
      const endDir = gw(TAIL - 1, 0, -0.52).sub(endpin).normalize()
      {
        // the plug's +y runs from the tip to the boot: the tip goes into the endpin jack
        const plug = jackPlug()
        plug.quaternion.setFromUnitVectors(V(0, 1, 0), endDir)
        plug.position.copy(endpin).addScaledVector(endDir, -0.26)
        group.add(plug)
      }

      /* ---------------- the table and its small stuff */
      const TABLE = V(0.15, 0, -3.95)
      const TOP = 7.4
      const table = sideTable({ radius: 2.35, height: TOP })
      table.position.copy(TABLE)
      group.add(mergeStatic(table))
      const pk = picks()
      pk.position.set(-1.5, TOP, -2.45)
      pk.rotation.y = -0.35
      group.add(pk)
      const pack = mergeStatic(stringPack())
      pack.position.set(-1.05, TOP, -3.75)
      pack.rotation.y = -0.2
      group.add(pack)
      const harp = harmonica()
      harp.position.set(1.15, TOP, -2.55)
      harp.rotation.y = 0.42
      group.add(harp)
      const coil = mergeStatic(cableCoil({ radius: 0.7, loops: 6 }))
      coil.position.set(1.25, TOP, -4.3)
      coil.rotation.y = 2.2
      group.add(coil)
      await nextFrame()

      /* ---------------- the mic on its boom stand */
      const MIC = V(6.7, 0, -1.3)
      const mic = micStand({ poleH: 9.6, micAt: V(-2.7, 14.0, 1.0), aim: V(-0.1, 0.28, -0.95), legTurn: 1.25 })
      mic.group.position.copy(MIC)
      group.add(mergeStatic(mic.group))
      // the mic's middle (the grille is at the far end of the handle)
      pts.mic.copy(mic.grille).addScaledVector(mic.axis, -0.55).add(MIC)
      // the singer's stool behind the mic, an X of gaffer tape where it goes
      const STOOL = V(2.9, 0, -3.3)
      const st = stool({ seat: 7.4 })
      st.position.copy(STOOL)
      st.rotation.y = 0.3
      group.add(mergeStatic(st))
      for (const a of [0.7, -0.7]) {
        const t = gaffer(0.9, 0.22)
        t.position.set(STOOL.x + 2.0, 0.009, STOOL.z + 1.9)
        t.rotation.z = a
        group.add(t)
      }
      // the floor lamp behind the table (a warm practical: the shade glows, one point light)
      const LAMP = V(4.9, 0, -9.0)
      const lamp = floorLamp({ height: 15.5 })
      lamp.group.position.copy(LAMP)
      group.add(mergeStatic(lamp.group))
      lampLight = new THREE.PointLight(0xffb46a, 0, 26, 2)
      lampLight.position.copy(lamp.bulbAt).add(LAMP)
      group.add(lampLight)

      /* ---------------- the PA column behind the singer's spot */
      const PA = V(6.9, 0, -5.9)
      const pa = paColumn()
      pa.position.copy(PA)
      pa.rotation.y = -0.22
      group.add(mergeStatic(pa))
      await nextFrame()

      /* ---------------- the pedalboard at the singer's feet (facing the singer) */
      const BOARD = V(4.2, 0, 1.55)
      const board = pedalboard()
      const bg = new THREE.Group()
      bg.add(board.group)
      const defs = [
        { name: 'Looper', sub: 'rec · play', color: '#e6d6b4', ink: '#231509', led: '#ff5a2a', knobs: 2 },
        { name: 'Harmony', sub: 'vocal', color: '#7c2f1c', ink: '#f2e2c4', led: '#ffb04a', knobs: 3 },
        { name: 'Octave', sub: 'polyphonic', color: '#b0712e', ink: '#1c1008', led: '#ff3a1a', knobs: 3 },
      ]
      pedals = defs.map((d, i) => {
        const p = buildPedal({ color: d.color, name: d.name, sub: d.sub, ink: d.ink, led: d.led, knobs: d.knobs })
        const x = (i - 1) * 1.85
        p.group.position.set(x, board.deckAt(x, 0.15), 0.15)
        p.group.rotation.x = board.slope
        p.setOn(i === 0 ? 0 : 1)
        bg.add(p.group)
        return p
      })
      // patch cables between the pedals, looping behind them
      {
        const m = mats()
        for (let i = 0; i < 2; i++) {
          const x0 = (i - 1) * 1.85 + 0.42
          const x1 = i * 1.85 - 0.42
          const y = board.deckAt(0, -0.1) + 0.2
          bg.add(tube([V(x0, y, -0.1), V(x0 + 0.12, y + 0.1, -0.55), V((x0 + x1) / 2, y + 0.05, -0.85), V(x1 - 0.12, y + 0.1, -0.55), V(x1, y, -0.1)], 0.028, m.rubber, 30, 8))
        }
      }
      bg.position.copy(BOARD)
      bg.rotation.y = Math.PI + 0.12
      group.add(bg)
      // the setlist taped to the floor beside the board (Volume ONE, hand-written; decorative)
      const sl = setlist(ALBUMS[0].tracks.map(t => t.title))
      sl.position.set(BOARD.x - 1.0, 0, BOARD.z + 3.3)
      sl.rotation.y = Math.PI + 0.1
      group.add(mergeStatic(sl))
      group.updateMatrixWorld(true)
      pts.board.copy(BOARD).add(V(-0.3, 0.5, 1.1))
      {
        // the guitar's cable: from the endpin plug's boot down to the floor and across to the board
        const m = mats()
        const boot = endpin.clone().addScaledVector(endDir, 0.5)
        const inJack = bg.localToWorld(V(1.85 + 0.44, board.deckAt(1.85, -0.1) + 0.2, -0.1))
        group.add(
          tube(
            [boot, boot.clone().add(V(0.05, -0.35, 0.05)), V(boot.x + 0.3, 0.04, boot.z + 0.6), V(1.4, 0.035, 1.3), V(inJack.x + 0.9, 0.04, inJack.z + 0.2), V(inJack.x + 0.35, inJack.y, inJack.z)],
            0.032,
            m.rubber,
            60,
            8,
          ),
        )
        // out of the looper to the PA's power stand
        const outJack = bg.localToWorld(V(-1.85 - 0.44, board.deckAt(-1.85, -0.1) + 0.2, -0.1))
        group.add(tube([V(outJack.x - 0.3, outJack.y, outJack.z), V(outJack.x - 0.8, 0.04, outJack.z - 0.3), V(6.2, 0.035, -2.4), V(6.7, 0.04, -4.2), V(6.9, 1.1, -4.55)], 0.032, m.rubber, 50, 8))
      }
      await nextFrame()

      /* ---------------- points of interest */
      pts.guitar.copy(gw(3.05, 0, -0.35))
      pts.body.copy(gw(0.4, 0, 0))
      pts.fret2.copy(gw(fretX(2) + 0.1, 0.18, 0.0))
      pts.picks.copy(pk.position).add(V(0, 0.02, 0))
      pts.pack.copy(pack.position).add(V(0.12, 0.04, 0.12))
      pts.harp.copy(harp.position).add(V(0, 0.12, 0))
      pts.coil.copy(coil.position).add(V(0.1, 0.1, 0.15))
      pts.pa.copy(PA).add(V(0.7, 10.6, 0.5))
      pts.rig.set(2.7, 7.4, -2.4)
      pts.room.set(BOARD.x - 0.8, 10.5, BOARD.z + 11)
      // callouts on the guitar (guitar-local points): text is verbatim from GEAR.guitar.specs
      calloutAt.push(
        gw(SCALE + 1.44, -0.62, -0.2), // tuners (treble side)
        gw(2.2, -0.95, 0.02), // cutaway
        gw(-0.9, -0.95, 0.02), // top
        gw(1.05, -0.78, 0.03), // pickguard
        gw(-0.15, -0.55, 0.1), // bridge
      )
      {
        // each string's tuner (3 + 3: low D, A, D up the bass side; G, B, D up the treble side)
        const hs = g.parts.headstock
        hs.updateMatrixWorld(true)
        for (let i = 0; i < 6; i++) {
          const u = [0.52, 0.98, 1.44][i % 3]
          const side = i < 3 ? 1 : -1
          postAt.push(hs.localToWorld(V(u, side * 0.29, 0.1)))
          tagAt.push(hs.localToWorld(V(u, side * 0.98, -0.18)))
        }
        pts.nut.copy(hs.localToWorld(V(0.72, 0, 0)))
      }

      /* ---------------- camera keys (world focus, yaw/pitch in degrees, the subject box) */
      const K = (at: THREE.Vector3, yaw: number, pitch: number, w: number, h: number, mode: Mode, fov = 32, drift: [number, number, number] = [3, 0, 0.04], p?: Key['p'], lamp = [0.3, 0.85, 0.45], shift = 1): Key => ({
        shift,
        at,
        yaw,
        pitch,
        w,
        h,
        mode,
        fov,
        drift,
        p,
        lamp: V(lamp[0], lamp[1], lamp[2]).normalize(),
      })
      introKey = K(pts.rig, -16, 6, 11.5, 14, 'head', 34, [5, 1, 0.06], { at: pts.rig.clone().add(V(0.4, -0.4, 0)), w: 11, h: 14.5 }, [-0.4, 0.8, 0.45])
      keys = [
        K(pts.guitar, 10, 4, 4.4, 11.2, 'card', 32, [4, 0, 0.03], { w: 4.2, h: 10.8 }, [0.45, 0.72, 0.5]),
        K(pts.nut, 9, 20, 2.9, 2.25, 'card', 28, [3, 1, 0.04], { w: 2.6, h: 2.5 }, [0.75, 0.62, -0.2]),
        K(pts.picks, -34, 48, 0.95, 0.8, 'card', 26, [4, 2, 0.04], { w: 0.8, h: 0.8 }, [-0.5, 0.82, 0.3]),
        K(pts.pack, -26, 50, 1.9, 1.7, 'card', 28, [4, 2, 0.04], { w: 1.7, h: 1.6 }, [0.5, 0.8, -0.3]),
        K(pts.fret2, -42, 30, 1.6, 1.5, 'card', 28, [3, 1, 0.04], { w: 1.4, h: 1.5 }, [0.45, 0.8, 0.35]),
        K(pts.harp, 30, 38, 1.5, 1.0, 'card', 28, [4, 2, 0.04], { w: 1.25, h: 1.1 }, [0.4, 0.85, 0.35]),
        K(pts.coil, 38, 50, 2.2, 1.9, 'card', 28, [4, 2, 0.04], { w: 2.0, h: 2.0 }, [0.2, 0.9, 0.35]),
        K(pts.mic, 58, -14, 2.6, 2.4, 'card', 30, [4, 1, 0.04], { w: 2.2, h: 2.6 }, [0.2, 0.8, 0.55]),
        K(pts.pa, 34, -14, 5.2, 17, 'card', 36, [4, 1, 0.03], { w: 5, h: 16.5 }, [0.35, 0.72, 0.6]),
        K(pts.board, 172, 58, 5.6, 4.6, 'card', 32, [4, 1, 0.04], { w: 5.4, h: 4.6, pitch: 72 }, [-0.1, 0.85, 0.5], 0.3),
      ]
      // the singer's-eye view from the stool: out over the board into the room
      // a phone sideways: the copy takes half the width — look straight down on the board
      keys[9].sl = { pitch: 74, shift: 1, w: 5.2, h: 5.6 }
      outKey = K(V(4.4, 14.2, 18), 180, 10, 13, 9, 'free', 44, [0, 0, 0], undefined, [0.0, 0.9, 0.45])
      outKey.eye = [V(3.2, 11.3, -3.0), V(3.3, 11.9, -3.4)]
      outKey.lit = pts.board.clone().add(V(0, 0, 1.5))
      pts.lamp.copy(pts.rig).add(V(2, 12, 9))

      /* ---------------- DOM: the intro */
      head = el('div', 'gr-head', undefined, stage)
      el('p', 'hud-eyebrow', SECTIONS.gear.eyebrow, head)
      title = rise(el('h2', 'hud-h2 gr-h2', undefined, head), 'I use the following <em>gear</em> (almost exclusively) on solo shows:')
      reveal(head, 0, 0)

      /* ---------------- DOM: the rig card */
      card = el('div', 'hud-panel gr-card', undefined, stage)
      const top = el('div', 'gr-top', undefined, card)
      el('span', 'gr-k', 'The Rig', top)
      idxEl = el('span', 'gr-idx', '01 / 10', top)
      const strand = el('span', 'gr-bulbs', undefined, top)
      bulbs = Array.from({ length: N }, (_, i) => {
        const b = el('i', '', undefined, strand)
        b.style.setProperty('--k', String(i))
        return b
      })
      clip = el('div', 'gr-clip', undefined, card)
      const book = el('div', 'gr-pages', undefined, clip)
      const page = (i: number, name: string, cls = '') => {
        const pg = el('div', `gr-page ${cls}`, undefined, book)
        const t = rise(el('h3', 'gr-title', undefined, pg), name)
        pages[i] = pg
        pageTitles[i] = t
        return pg
      }
      {
        // 0 the guitar: the whole spec list, verbatim
        const pg = page(0, GEAR.guitar.name, 'gr-page--guitar')
        const ul = el('ul', 'gr-specs', undefined, pg)
        for (const s of GEAR.guitar.specs) el('li', '', s, ul)
      }
      {
        // 1 the tuning
        const pg = page(1, GEAR.guitar.tuning.replace(/\s+DADGBD$/, ''), 'gr-page--tuning')
        const row = el('div', 'gr-notes', undefined, pg)
        GEAR.guitar.notes.forEach(n => noteChips.push(el('span', 'gr-note', n, row)))
      }
      GEAR.items.forEach((it, k) => {
        const pg = page(2 + k, it.name)
        el('p', 'hud-body gr-text', it.text, pg)
        if (it.detail) {
          const tg = el('ul', 'hud-tags gr-tags', undefined, pg)
          el('li', 'hud-tag', it.detail, tg)
        }
      })
      {
        const pg = page(8, GEAR.pa.name, 'gr-page--pa')
        el('p', 'gr-sub', GEAR.pa.title, pg)
        const ul = el('ul', 'gr-list', undefined, pg)
        for (const s of GEAR.pa.specs) el('li', '', s, ul)
      }
      {
        const pg = page(9, 'Effects', 'gr-page--fx')
        const ul = el('ul', 'gr-list gr-list--fx', undefined, pg)
        for (const s of GEAR.effects) el('li', '', s, ul)
      }
      reveal(card, 0, 0)

      /* ---------------- DOM: callouts on the guitar, the tuning tags at the nut */
      const labels = [GEAR.guitar.specs[14], GEAR.guitar.specs[1], GEAR.guitar.specs[2], GEAR.guitar.specs[15], GEAR.guitar.specs[11]]
      labels.forEach((t, i) => {
        const c = new Callout(stage, { side: 'right', offset: { x: 64 + (i % 2) * 18, y: i === 0 ? 26 : -34 } })
        c.root.classList.add('gr-callout')
        c.label.textContent = t
        callouts.push(c)
      })
      tuneWrap = el('div', 'gr-tune', undefined, stage)
      tuneSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      tuneSvg.setAttribute('class', 'gr-tune-svg')
      tuneWrap.appendChild(tuneSvg)
      for (let i = 0; i < 6; i++) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        tuneSvg.appendChild(p)
        tuneLines.push(p)
        tuneTags.push(el('span', 'gr-tune-tag', TUNING[i], tuneWrap))
      }
      reveal(tuneWrap, 0, 0)

      document.fonts?.ready.then(() => (regions.key = ''), () => {})
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => (regions.key = '')).observe(stage)
    },

    update(local, frame, ctx) {
      const dt = frame.dt
      now += dt
      const calm = ctx.reducedMotion || frame.reducedMotion || !!frame.still
      measure(frame)

      // ---- pacing
      const teleport = prevLocal < 0 || Math.abs(local - prevLocal) > 0.12
      prevLocal = local
      const q = clock.update(local, dt)

      // ---- which item the card names (switches at the slot boundary)
      let item = 0
      while (item < N - 1 && q >= S[item + 1]) item++
      const cardVis = smoothstep(CARD[0], CARD[0] + 0.01, q) * (1 - smoothstep(CARD[1] - 0.01, CARD[1], q))
      if (item !== shown) {
        if (shown < 0 || teleport || calm || cardVis < 0.02) {
          if (shown >= 0) reveal(pages[shown], 0, 0)
          shown = item
          pending = -1
          bodyK = 1
          onShow(item, true)
        } else {
          pending = item
          bodyK = Math.max(0, bodyK - dt / 0.12)
          if (bodyK <= 0) {
            reveal(pages[shown], 0, 0)
            shown = item
            pending = -1
            onShow(item, false)
          }
        }
      } else bodyK = Math.min(1, bodyK + dt / 0.22)
      pages.forEach((p, i) => i !== shown && p.style.visibility !== 'hidden' && reveal(p, 0, 0))
      reveal(pages[shown], bodyK, 0)
      reveal(card, cardVis, 0)
      const cardOn = cardVis > 0.02
      pageTitles.forEach((t, i) => setRise(t, cardOn && i === shown))

      // ---- intro headline
      const hv = smoothstep(HEAD[0], HEAD[0] + 0.012, q) * (1 - smoothstep(HEAD[1] - 0.014, HEAD[1], q))
      reveal(head, hv, 0)
      setRise(title, q > HEAD[0] + 0.004 && q < HEAD[1] - 0.004)

      // ---- the capo
      placeCapo(segment(q, CAPO[0], CAPO[1]))
      const clamped = q >= CAPO[1]
      if (!teleport && prevQ >= 0 && prevQ < CAPO[1] && clamped && !capoRang) {
        capoRang = true
        if (now - capoAt > 0.8) emit('hark:sfx', { kind: 'capo' })
        capoAt = now
      }
      if (q < CAPO[0]) capoRang = false

      // ---- the tuning: once the camera has settled on the nut, D A D G B D, low to high
      const G = GLIDE / 2
      const onTune = q > S[1] + G * 0.9 && q < S[2] - G
      // once per arrival (re-armed on leaving the item, at most every 3 s)
      if (onTune && arpArmed && !clock.busy && now - arpLast > 3) {
        arpArmed = false
        arpAt = now
        arpLast = now
        arpFired = 0
      }
      if (!onTune) {
        arpAt = -1
        arpArmed = true
      }
      if (arpAt >= 0) {
        while (arpFired < 6 && now >= arpAt + arpFired * 0.44) {
          const i = arpFired
          rings[i].strike(now, 1)
          struckAt[i] = now
          emit('hark:pluck', { midi: MIDI[i], level: 0.8 })
          arpFired++
        }
        if (arpFired >= 6 && now - arpAt > 6 * 0.44 + 2.5) arpAt = -1
      }
      // ---- strings: the arpeggio rings (time-based, never under reduced motion)
      for (let i = 0; i < 6; i++) {
        const r = rings[i].value(now)
        // (only the few inches by the nut are in frame: pluck firmly enough to see them shimmer)
        g.strings.amp[i] = calm ? 0 : r * (0.02 - i * 0.0014)
      }
      g.strings.wobble = 0
      g.strings.light.set(GEL.tungsten)
      g.strings.lightDir.copy(pts.lamp).sub(pts.guitar).normalize()
      g.update(frame, ctx.camera, ctx.renderer)

      // ---- the pedals: arriving on the board, the looper is stomped (its LED lights)
      const onFx = q > S[9] + G
      if (!teleport && prevQ >= 0 && prevQ <= S[9] + G && onFx && now - lastStomp > 1.6) {
        lastStomp = now
        stompAt = now
        if (!calm && now - thumpAt > 1.6) thumpAt = now
        emit('hark:sfx', { kind: 'switch' })
      }
      const ledT = onFx ? 1 : 0
      ledK = teleport ? ledT : approach(ledK, ledT, dt / 0.3)
      pedals[0].setOn(ledK)
      const st = now - stompAt
      pedals[0].setStomp(st >= 0 && st < 0.5 ? (st < 0.07 ? st / 0.07 : Math.exp(-(st - 0.07) / 0.1)) : 0)
      prevQ = q

      // ---- camera (camera() copies it)
      computePose(q, frame)

      // ---- light: the lamp's pool follows the item
      const w = ctx.world.params
      const wide = clamp((shotSize - 3) / 12)
      w.top = '#0e0a07'
      w.bottom = '#030201'
      // the same light on the subject near or far (intensity × d^-1.2)
      const reach = lerp(9.5, 17, wide)
      const off = tmp.copy(lampNow).multiplyScalar(reach)
      w.spot = (lerp(2.7, 5.2, wide) * Math.pow(reach, 1.2)) / 120
      w.spotColor = GEL.tungsten
      w.spotAt.copy(litNow)
      w.spotPos.copy(litNow).add(off)
      w.spotAngle = clamp(Math.atan((shotSize * 0.62 + 0.6) / reach) * (1 + 0.9 * moveK), 0.1, 0.66)
      w.spotPenumbra = 0.75
      const paK = clamp(1 - Math.abs(q - (S[8] + S[9]) / 2) / (S[9] - S[8]))
      w.rimA = 0.75 + 0.5 * paK
      w.rimAColor = GEL.amber
      w.rimADir.set(-0.8, 0.6, -0.9)
      w.rimB = 0.32 + 0.25 * paK
      w.rimBColor = GEL.dusk
      w.rimBDir.set(0.9, 0.4, -1)
      w.fill = 0.12
      w.haze = 0.4
      w.hazeColor = '#9a5a2e'
      w.hazeY = 0.1
      w.bulbs = 0.95
      w.bulbColor = GEL.bulb
      w.bokeh = 0.18 + 0.2 * smoothstep(B - GLIDE / 2, B + GLIDE, q)
      w.env = lerp(0.55, 0.85, wide)
      w.envTurn = 0.2
      lampLight.intensity = 26
      const pp = ctx.post.params
      pp.bloomStrength = lerp(0.22, 0.32, wide)
      pp.bloomThreshold = lerp(0.98, 0.9, wide)
      pp.bloomRadius = 0.5
      pp.vignette = 0.6
      pp.warmth = 1
      pp.grain = 0.035
      pp.lift = 0.014
      const th = now - thumpAt
      pp.glitch = calm || th < 0 || th > 0.5 ? 0 : 0.14 * (th < 0.04 ? th / 0.04 : Math.exp(-(th - 0.04) / 0.1))

      // ---- the index strand on the card
      // ---- callouts (the guitar) and the tuning tags (the nut): only while their item holds
      const W = frame.width
      const H = frame.height
      const holdVis = (i: number) => smoothstep(S[i] + G * 0.7, S[i] + G * 1.15, q) * (1 - smoothstep(S[i + 1] - G * 1.1, S[i + 1] - G * 0.6, q))
      const cv = holdVis(0) * cardVis
      const portrait = H > W
      const maxCallouts = portrait ? (W < 520 ? (H < 740 ? 2 : 3) : 5) : H <= 500 ? 3 : 5
      const reachX = W < 1200 ? 40 : 64
      callouts.forEach((c, i) => {
        c.offset.x = reachX + (i % 2) * (reachX * 0.28)
        const on = i < maxCallouts ? cv : 0
        c.update(calloutAt[i], ctx.camera, W, H, on)
      })
      const tv = holdVis(1)
      reveal(tuneWrap, tv, 0)
      if (tv > 0.002) placeTuneTags(frame, ctx.camera)
      for (let i = 0; i < 6; i++) {
        const t = now - struckAt[i]
        const hot = t < 0 ? 0 : Math.min(1, t / 0.04) * Math.exp(-t / 0.5)
        const hv = Math.round(hot * 50) / 50
        if (hv !== hotShown[i]) {
          hotShown[i] = hv
          tuneTags[i].style.setProperty('--hot', hv.toFixed(2))
          noteChips[i].style.setProperty('--hot', hv.toFixed(2))
          tuneLines[i].style.opacity = (0.55 + 0.45 * hv).toFixed(2)
        }
      }

      const busyArp = arpAt >= 0
      settling = clock.busy || bodyK < 1 || pending >= 0 || busyArp || Math.abs(ledK - ledT) > 1e-3 || now - stompAt < 0.6 || now - thumpAt < 0.6
    },

    camera(_local, _frame, out) {
      out.position.copy(pose.position)
      out.target.copy(pose.target)
      out.fov = pose.fov
      out.parallax = pose.parallax
    },
  }

  function onShow(i: number, instant: boolean) {
    idxEl.textContent = `${String(i + 1).padStart(2, '0')} / ${N}`
    bulbs.forEach((b, k) => {
      b.classList.toggle('is-on', k <= i)
      b.classList.toggle('is-now', k === i)
    })
    card.dataset.item = String(i)
    fitClip(instant)
  }

  /** each note tag just outside its tuner button, a hairline back to the string's post */
  function placeTuneTags(frame: Frame, camera: THREE.PerspectiveCamera) {
    const W = frame.width
    const H = frame.height
    const push = W < 520 ? 16 : 22
    for (let i = 0; i < 6; i++) {
      tmp2.copy(postAt[i]).project(camera)
      const px = (tmp2.x * 0.5 + 0.5) * W
      const py = (0.5 - tmp2.y * 0.5) * H
      tmp2.copy(tagAt[i]).project(camera)
      let tx = (tmp2.x * 0.5 + 0.5) * W
      const ty = (0.5 - tmp2.y * 0.5) * H
      const dx = tx - px
      const sx = dx >= 0 ? 1 : -1
      tx += sx * push
      tx = clamp(tx, 24, W - 24)
      tuneTags[i].style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translate(-50%, -50%)`
      const r = W < 520 ? 14 : 16
      tuneLines[i].setAttribute('d', `M${px.toFixed(1)},${py.toFixed(1)} L${(tx - sx * r).toFixed(1)},${ty.toFixed(1)}`)
    }
  }
}
