import * as THREE from 'three'
import type { CameraPose, Chapter, Frame } from '../../core/types'
import { el, rise, setRise, reveal } from '../../core/dom'
import { SECTIONS, SOCIALS, VIDEOS, youtubeUrl } from '../../content'
import { clamp, ease, lerp, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { fontsReady } from '../../kit/materials'
import { whenRevealed } from '../../kit/images'
import { StoryClock } from '../../kit/pace'
import { buildGuitar } from '../../kit/guitar'
import { cable } from '../../kit/stage'
import { GEL } from '../../world/World'
import { buildProjector, buildTable } from './projector'
import { Beam } from './beam'
import { IMG_C, IMG_H, IMG_W, Sheet, loadThumb, titleCard } from './screen'
import { buildFloor, buildStrand, buildWall, bulbUniforms, chairGeometry, chairMaterial } from './room'
import { closePlayer, isPlayerOpen, openPlayer } from './player'
import './watch.css'

/*
 * WATCH · FRONT ROW. Movie night at the back of a small bar: an old brick
 * wall with a festoon strand of warm bulbs hung across it, a cotton sheet
 * pegged to a wire under the bulbs, and a vintage 16 mm projector on a tall
 * café table throwing a warm beam through the haze onto the sheet. Between
 * them, the front row: three bentwood café chairs — and in one of them,
 * Greg's acoustic, sitting in for the show.
 *
 *  - intro (landing 0.07): the wide shot — the headline on the left, the
 *    sheet already showing "House Not Home" (the headline's video)
 *  - the videos (anchors 0–8): the camera settles behind the projector and
 *    dollies slowly along the back of the front row, one step per video; the
 *    sheet holds its place in the frame while the room slides by. Each video
 *    cross-fades in (never through black) and racks into focus; the card
 *    names what's on the sheet: kind (+ "by" for covers), title, the note if
 *    there is one, Watch on YouTube ↗ and a click-to-play facade.
 *  - out: a crane up to the string lights, the sheet still lit, for the cut
 *
 * PACING (WCAG 2.3.1): the camera, the picture and the card follow a
 * StoryClock on a warped copy of `local` (a travel = 1 unit, a hold HOLD_W)
 * at ≤ RATE units/s: a travel takes ≥ 0.55 s of time and a new video lands
 * at most ~1.15 times a second, cross-faded over 0.42 s.
 */

const N = VIDEOS.length
const pad2 = (n: number) => String(n).padStart(2, '0')
const YOUTUBE = SOCIALS.find(s => s.name === 'YouTube')?.url

// ---- the story schedule (local 0..1; the chapter is 6.0 vh)
const LEN = 6.0
const V = (vh: number) => vh / LEN
/** the headline rises as the cut clears */
const RISE = 0.026
/** …and holds, settled, to here */
const INTRO_OUT = 0.12
/** video 1 settled */
const A = 0.142
/** the last video's hold ends; the crane up begins */
const OUTRO = 0.936
/** one video-to-video travel, in scroll */
const TR = V(0.075)
const HOLD = (OUTRO - A - (N - 1) * TR) / N
/** travel k takes station k to k+1 (station 0 = the intro, station i + 1 = video i) */
const TRAVEL: [number, number][] = [[INTRO_OUT, A]]
for (let i = 1; i < N; i++) {
  const s = A + i * HOLD + (i - 1) * TR
  TRAVEL.push([s, s + TR])
}
const holdStart = (st: number) => (st === 0 ? 0 : TRAVEL[st - 1][1])
const holdEnd = (st: number) => (st < TRAVEL.length ? TRAVEL[st][0] : OUTRO)
const ANCHORS = VIDEOS.map((_, i) => (holdStart(i + 1) + holdEnd(i + 1)) / 2)

// the clock's warp: a travel weighs 1 (the first a little more), a hold HOLD_W
const HOLD_W = 0.55
const RATE = 1.8
const WB: number[] = [0]
const WW: number[] = []
TRAVEL.forEach(([s, e], k) => {
  WB.push(s, e)
  WW.push(k === 0 ? 0.6 : HOLD_W, k === 0 ? 1.3 : 1)
})
WB.push(OUTRO, 1)
WW.push(HOLD_W, 0.9)
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

/** where the story is: station k, travel t toward k+1 (0 = holding), hold progress h */
function where(q: number) {
  for (let k = 0; k < TRAVEL.length; k++) {
    const [s, e] = TRAVEL[k]
    if (q < s) return { k, t: 0, h: clamp((q - holdStart(k)) / (s - holdStart(k))) }
    if (q < e) return { k, t: (q - s) / (e - s), h: 1 }
  }
  return { k: N, t: 0, h: clamp((q - holdStart(N)) / (OUTRO - holdStart(N))) }
}
/** the video on the sheet at q (the switch lands mid-travel, as the camera moves) */
function pictureAt(q: number) {
  const w = where(q)
  const st = w.t >= 0.5 ? w.k + 1 : w.k
  return Math.max(0, st - 1)
}

// ---- camera poses: a position, a heading (yaw 0 looks toward -z), a pitch, a fov
type Pose = { p: THREE.Vector3; yaw: number; pitch: number; fov: number }
const pose = (): Pose => ({ p: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 30 })
const _f = new THREE.Vector3()
const _r = new THREE.Vector3()
const _u = new THREE.Vector3()
const _d = new THREE.Vector3()
function basis(yaw: number, pitch: number) {
  _f.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
  _r.set(Math.cos(yaw), 0, Math.sin(yaw))
  _u.crossVectors(_r, _f)
}
/** NDC of world point q seen from (p, yaw, pitch) */
function project(p: THREE.Vector3, yaw: number, pitch: number, fov: number, aspect: number, q: THREE.Vector3): [number, number] {
  basis(yaw, pitch)
  _d.subVectors(q, p)
  const z = Math.max(1e-4, _d.dot(_f))
  const t = Math.tan((fov * Math.PI) / 360)
  return [_d.dot(_r) / (z * t * aspect), _d.dot(_u) / (z * t)]
}
/** the heading from p that puts world point s at NDC (nx, ny) */
function aim(p: THREE.Vector3, s: THREE.Vector3, nx: number, ny: number, fov: number, aspect: number) {
  _d.subVectors(s, p)
  let yaw = Math.atan2(_d.x, -_d.z)
  let pitch = Math.atan2(_d.y, Math.hypot(_d.x, _d.z))
  for (let it = 0; it < 8; it++) {
    const [x0, y0] = project(p, yaw, pitch, fov, aspect, s)
    const e = 1e-4
    const [x1, y1] = project(p, yaw + e, pitch, fov, aspect, s)
    const [x2, y2] = project(p, yaw, pitch + e, fov, aspect, s)
    const a = (x1 - x0) / e
    const b = (x2 - x0) / e
    const c = (y1 - y0) / e
    const d = (y2 - y0) / e
    const det = a * d - b * c
    if (Math.abs(det) < 1e-9) break
    const ex = nx - x0
    const ey = ny - y0
    yaw += (d * ex - b * ey) / det
    pitch += (-c * ex + a * ey) / det
  }
  return { yaw, pitch }
}
/**
 * Place a camera at depth z = cz so world point `f` lands at NDC `ft` while
 * the heading keeps world point `lock` at NDC `lt` (solves x, y).
 */
function solve2(out: Pose, f: THREE.Vector3, ft: [number, number], lock: THREE.Vector3, lt: [number, number], cz: number, fov: number, aspect: number, guess: [number, number], yMin: number) {
  let cx = guess[0]
  let cy = guess[1]
  const evalAt = (x: number, y: number) => {
    out.p.set(x, y, cz)
    const o = aim(out.p, lock, lt[0], lt[1], fov, aspect)
    return project(out.p, o.yaw, o.pitch, fov, aspect, f)
  }
  for (let it = 0; it < 14; it++) {
    const [x0, y0] = evalAt(cx, cy)
    const e = 1e-3
    const [x1, y1] = evalAt(cx + e, cy)
    const [x2, y2] = evalAt(cx, cy + e)
    const a = (x1 - x0) / e
    const b = (x2 - x0) / e
    const c = (y1 - y0) / e
    const d = (y2 - y0) / e
    const det = a * d - b * c
    if (Math.abs(det) < 1e-9) break
    const ex = ft[0] - x0
    const ey = ft[1] - y0
    cx += clamp((d * ex - b * ey) / det, -3, 3)
    cy += clamp((-c * ex + a * ey) / det, -3, 3)
    cy = clamp(cy, yMin, 40)
  }
  out.p.set(cx, cy, cz)
  const o = aim(out.p, lock, lt[0], lt[1], fov, aspect)
  out.yaw = o.yaw
  out.pitch = o.pitch
  out.fov = fov
}

// ---- the set (world units; 1 = 10 cm)
const TABLE_H = 11
const TABLE_X = 10.4
const TABLE_Z = 42.5
const CHAIR_Z = 26.5
const CHAIRS: [number, number][] = [
  [-7.4, 0.07],
  [0, -0.02],
  [7.4, -0.09],
]
/** the seat Greg's guitar sits in */
const GUITAR_SEAT = 1

export default function create(): Chapter {
  const group = new THREE.Group()
  let sheet: Sheet | null = null
  let beam: Beam | null = null
  let proj: ReturnType<typeof buildProjector> | null = null
  let guitar: ReturnType<typeof buildGuitar> | null = null
  let spill: THREE.PointLight | null = null
  let bulbMat: THREE.MeshBasicMaterial | null = null
  const pics: (THREE.Texture | null)[] = new Array(N).fill(null)
  const cards: (THREE.Texture | null)[] = new Array(N).fill(null)
  /** the lens in world space, the picture's centre and the guitar's headstock (the camera's anchors) */
  const lensW = new THREE.Vector3()
  const imgC = IMG_C.clone()
  const headW = new THREE.Vector3(0, 14, CHAIR_Z + 2.8)

  // DOM
  let intro: HTMLElement, introTitle: HTMLElement
  let card: HTMLElement, inner: HTMLElement
  let yt: HTMLAnchorElement, play: HTMLButtonElement
  let reel: HTMLElement[] = []
  let measureBox: HTMLElement | null = null
  let cardW = 400
  let cardH = 360
  let introH = 220

  // story state
  const clock = new StoryClock({ rate: RATE, snap: 1.5 })
  let q = NaN
  let snap = true
  let shown = -1
  let onSheet = -1
  let idle = 0
  /** dt-accumulated time (runs with Motion off) and the last projector click */
  let now = 0
  let clickAt = -10
  /** the clock's value last frame (a jump of more than a step is a teleport) */
  let lastU = NaN

  const poses = {
    key: '',
    open: pose(),
    intro: pose(),
    introB: pose(),
    items: Array.from({ length: N }, pose),
    outro: pose(),
  }

  /** the picture texture for video i: its thumbnail, else its title card */
  function picture(i: number): THREE.Texture {
    const p = pics[i]
    if (p) return p
    let c = cards[i]
    if (!c) c = cards[i] = titleCard(VIDEOS[i])
    return c
  }

  function buildPoses(frame: Frame) {
    const W = frame.width || 1440
    const H = frame.height || 900
    const key = `${W}x${H}:${cardW},${cardH},${introH}`
    if (key === poses.key || !proj) return
    poses.key = key
    const aspect = W / H
    const portrait = H > W * 1.05
    const short = !portrait && H <= 500
    const gutter = clamp(W * 0.034, 16, 48)
    const safeTop = short ? 52 : clamp(H * 0.105, 80, 112)
    const safeBot = short ? 52 : portrait && W <= 560 ? 96 : clamp(H * 0.105, 82, 110)
    const nx = (px: number) => (px / W) * 2 - 1
    const ny = (py: number) => 1 - (py / H) * 2
    // the free region beside / above the card, px [x0, y0, x1, y1] (y down)
    const R = portrait
      ? [gutter, safeTop + 4, W - gutter, H - safeBot - cardH - 12]
      : [gutter + cardW + (short ? 20 : 48), safeTop + (short ? 0 : 6), W - gutter - (short ? 4 : 24), H - safeBot - (short ? 0 : 8)]
    const rw = R[2] - R[0]
    const rh = R[3] - R[1]

    // ---- the videos: the picture fills the top of the region; under it, the guitar's
    // headstock rises from the front row; the dolly slides the room past (the picture holds)
    const iw = portrait ? rw * 0.98 : Math.min(rw * 0.92, (rh * (short ? 0.64 : 0.57) * 16) / 9)
    const ih = (iw * 9) / 16
    const scx = (R[0] + R[2]) / 2
    // landscape: headroom above the picture for the string lights
    const scy = portrait ? R[1] + ih / 2 + 4 : R[1] + rh * (short ? 0.4 : 0.43)
    const bandTop = scy + ih / 2
    const hcy = bandTop + (R[3] - bandTop) * (portrait ? 0.42 : 0.4)
    const cz = portrait ? 57 : 58
    let tf = IMG_W / 2 / ((cz - 2) * aspect * (iw / W))
    for (let pass = 0; pass < 4; pass++) {
      const fov = clamp((Math.atan(tf) * 360) / Math.PI, 12, 70)
      for (let i = 0; i < N; i++) {
        const s = (i / (N - 1)) * 2 - 1
        const hx = scx - s * iw * (portrait ? 0.2 : 0.24)
        solve2(poses.items[i], headW, [nx(hx), ny(hcy)], imgC, [nx(scx), ny(scy)], cz, fov, aspect, [s * 3, 19], 8)
      }
      const P = poses.items[4]
      const [xl] = project(P.p, P.yaw, P.pitch, fov, aspect, _q.set(imgC.x - IMG_W / 2, imgC.y, imgC.z))
      const [xr] = project(P.p, P.yaw, P.pitch, fov, aspect, _q.set(imgC.x + IMG_W / 2, imgC.y, imgC.z))
      const actual = ((xr - xl) / 2) * W
      if (!(actual > 1)) break
      tf *= actual / iw
    }

    // ---- the intro: the whole corner from the left — the sheet right of centre,
    // the projector's table in the right foreground, the headline on the left
    {
      // portrait: the scene fills the space under the headline block, the projector low right
      const IR = portrait
        ? [gutter, safeTop + introH + 18, W - gutter, H - safeBot - 8]
        : [W * (short ? 0.44 : 0.42), safeTop, W - gutter, H - safeBot]
      const sw = (IR[2] - IR[0]) * (portrait ? 0.76 : 0.66)
      const sx = portrait ? W * 0.47 : IR[0] + (IR[2] - IR[0]) * 0.46
      // (portrait: headroom so the string lights hang below the headline, never behind it)
      const sy = portrait ? IR[1] + (sw * 9) / 32 + (IR[3] - IR[1]) * 0.17 : IR[1] + (IR[3] - IR[1]) * 0.36
      const lx = portrait ? W * 0.83 : IR[0] + (IR[2] - IR[0]) * 0.76
      const ly = portrait ? IR[3] - (IR[3] - IR[1]) * 0.14 : IR[1] + (IR[3] - IR[1]) * 0.66
      const cz = portrait ? 96 : 86
      const f0 = clamp(((Math.atan(IMG_W / 2 / ((cz - 4) * aspect * (sw / W))) * 360) / Math.PI) * 1.02, 16, 72)
      solve2(poses.intro, lensW, [nx(lx), ny(ly)], imgC, [nx(sx), ny(sy)], cz, f0, aspect, [-14, 22], 10)
      solve2(poses.introB, lensW, [nx(lx - W * 0.012), ny(ly)], imgC, [nx(sx), ny(sy)], cz - 2.2, f0, aspect, [poses.intro.p.x, poses.intro.p.y], 10)
      // the scene opens out of the soundhole a little closer in, low and to the right
      const O = poses.open
      O.p.copy(poses.intro.p).lerp(lensW, 0.16)
      O.p.y -= 2
      const o = aim(O.p, imgC, nx(sx) - 0.08, ny(sy) + 0.04, f0, aspect)
      O.yaw = o.yaw
      O.pitch = o.pitch
      O.fov = f0 * 0.96
    }

    // ---- out: crane up from the last video to the string lights, the sheet below
    {
      const L = poses.items[N - 1]
      const O = poses.outro
      O.p.copy(L.p).add(_q.set(-2, 10, -10))
      const o = aim(O.p, _q.set(0, 22.6, 0), portrait ? 0 : 0.18, portrait ? 0.05 : 0.02, L.fov * 1.12, aspect)
      O.yaw = o.yaw
      O.pitch = o.pitch
      O.fov = L.fov * 1.12
    }
  }

  const tmpA = pose()
  const tmpB = pose()
  const tmpC = pose()
  function lerpPose(out: Pose, a: Pose, b: Pose, t: number, tr = t) {
    out.p.lerpVectors(a.p, b.p, t)
    let dy = b.yaw - a.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    out.yaw = a.yaw + dy * tr
    out.pitch = lerp(a.pitch, b.pitch, tr)
    out.fov = lerp(a.fov, b.fov, t)
  }
  function copyPose(out: Pose, a: Pose) {
    out.p.copy(a.p)
    out.yaw = a.yaw
    out.pitch = a.pitch
    out.fov = a.fov
  }
  /** the pose held at station st, hold progress h (a slow glide, a touch of push) */
  function holdPose(out: Pose, st: number, h: number) {
    if (st === 0) return lerpPose(out, poses.intro, poses.introB, h)
    copyPose(out, poses.items[st - 1])
    const s = h - 0.5
    out.p.x += s * 0.5
    out.p.z -= h * 0.5
    out.yaw -= s * 0.004
  }

  /** the card's tallest layout across all videos (so its top never jumps) */
  function measureCard() {
    if (!measureBox || !card) return
    measureBox.style.width = `${card.offsetWidth}px`
    let hmax = 0
    for (let i = 0; i < N; i++) {
      fill(measureBox, i)
      hmax = Math.max(hmax, measureBox.offsetHeight)
    }
    if (hmax > 0) {
      card.style.setProperty('--fr-hmax', `${hmax}px`)
      cardH = hmax
    }
    cardW = card.offsetWidth || cardW
  }

  /** write video i into a card element (the live card or the measuring clone) */
  function fill(box: HTMLElement, i: number) {
    const v = VIDEOS[i]
    box.querySelector<HTMLElement>('.fr-count')!.textContent = `${pad2(i + 1)} / ${pad2(N)}`
    box.querySelector<HTMLElement>('.fr-kind')!.textContent = v.kind
    box.querySelector<HTMLElement>('.fr-title')!.textContent = v.title
    const b = box.querySelector<HTMLElement>('.fr-by')!
    b.textContent = v.by ? `by ${v.by}` : ''
    b.hidden = !v.by
    const n = box.querySelector<HTMLElement>('.fr-note')!
    n.textContent = v.note ?? ''
    n.hidden = !v.note
  }

  function cardMarkup(parent: HTMLElement) {
    const top = el('div', 'fr-top', undefined, parent)
    el('span', 'fr-count', '', top)
    el('span', 'fr-kind', '', top)
    el('h3', 'fr-title', '', parent)
    el('p', 'fr-by', '', parent)
    el('p', 'hud-body fr-note', '', parent)
  }

  return {
    id: 'watch',
    group,
    anchors: ANCHORS,
    busy: () => clock.busy || !!sheet?.busy,
    async init(ctx) {
      const mobile = ctx.mobile
      await fontsReady()

      // ---- the room
      group.add(buildWall(), buildFloor())
      const strand = buildStrand()
      bulbMat = strand.bulbMat
      group.add(strand.group)
      const chairGeo = chairGeometry()
      const chairMat = chairMaterial()
      for (const [x, ry] of CHAIRS) {
        const c = new THREE.Mesh(chairGeo, chairMat)
        c.position.set(x, 0, CHAIR_Z)
        c.rotation.y = ry
        c.castShadow = true
        c.receiveShadow = true
        group.add(c)
      }
      await nextFrame()

      // ---- the projector on its table, aimed at the picture
      const table = buildTable(TABLE_H)
      table.position.set(TABLE_X, 0, TABLE_Z)
      group.add(table)
      proj = buildProjector()
      const pg = proj.group
      pg.position.set(TABLE_X, TABLE_H + 0.02, TABLE_Z)
      // turn it toward the picture and tilt the front up (the lens is off-centre: aim by iteration)
      for (let it = 0; it < 4; it++) {
        pg.updateMatrixWorld(true)
        lensW.copy(proj.lens).applyMatrix4(pg.matrixWorld)
        const dx = imgC.x - lensW.x
        const dz = lensW.z - imgC.z
        pg.rotation.y = -Math.atan2(dx, dz)
        pg.rotation.x = Math.atan2(imgC.y - lensW.y, Math.hypot(dx, dz))
      }
      pg.updateMatrixWorld(true)
      lensW.copy(proj.lens).applyMatrix4(pg.matrixWorld)
      group.add(pg)
      // the power cord: off the back of the projector, down the table, away across the floor
      const back = new THREE.Vector3(0.1, 0.5, 1.7).applyMatrix4(pg.matrixWorld)
      group.add(
        cable(
          [
            back,
            new THREE.Vector3(back.x + 0.4, back.y - 0.6, back.z + 0.9),
            new THREE.Vector3(TABLE_X + 2.3, TABLE_H - 1.5, TABLE_Z + 2.4),
            new THREE.Vector3(TABLE_X + 2.6, 3, TABLE_Z + 2.2),
            new THREE.Vector3(TABLE_X + 3, 0.06, TABLE_Z + 3.2),
            new THREE.Vector3(TABLE_X + 6, 0.06, TABLE_Z + 8),
            new THREE.Vector3(TABLE_X + 16, 0.06, TABLE_Z + 14),
          ],
          0.05,
        ),
      )
      await nextFrame()

      // ---- the sheet and the beam
      sheet = new Sheet(picture(0), lensW, mobile)
      group.add(sheet.group)
      beam = new Beam(
        {
          lens: lensW.clone(),
          lensH: new THREE.Vector2(0.21, 0.12),
          img: new THREE.Vector3(imgC.x, imgC.y, imgC.z + 0.4),
          imgH: new THREE.Vector2(IMG_W / 2, IMG_H / 2),
        },
        mobile,
      )
      group.add(beam.mesh, beam.motes)
      spill = new THREE.PointLight('#ffb070', 0, 0, 1.25)
      spill.position.set(0, 14, 9)
      group.add(spill)
      await nextFrame()

      // ---- Greg's guitar, sitting in the right-hand seat of the front row, facing the show
      guitar = buildGuitar({ mobile })
      {
        const [cx, ry] = CHAIRS[GUITAR_SEAT]
        const lean = 0.25
        const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean)
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + ry)
        const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
        guitar.group.quaternion.copy(qx).multiply(qy).multiply(qz)
        guitar.group.position.set(cx, 4.62 + 2.16, CHAIR_Z + 0.42)
        guitar.group.traverse(o => {
          const m = o as THREE.Mesh
          if (m.isMesh) m.castShadow = true
        })
        group.add(guitar.group)
        guitar.group.updateMatrixWorld(true)
        headW.set(7.4, 0, -0.1).applyMatrix4(guitar.group.matrixWorld)
      }
      await nextFrame()

      // ---- copy
      intro = el('div', 'fr-intro', undefined, ctx.stage)
      el('p', 'hud-eyebrow', SECTIONS.watch.eyebrow, intro)
      introTitle = rise(el('h2', 'hud-h2 fr-headline', undefined, intro), 'Check out the video for <em>House Not Home!</em>')
      if (YOUTUBE) {
        const ch = el('a', 'fr-channel', undefined, intro)
        ch.href = YOUTUBE
        ch.target = '_blank'
        ch.rel = 'noopener'
        ch.innerHTML = '<span class="fr-channel-dot" aria-hidden="true"></span>YouTube channel <span aria-hidden="true">↗</span>'
      }

      card = el('div', 'fr-card hud-panel', undefined, ctx.stage)
      inner = el('div', 'fr-inner', undefined, card)
      cardMarkup(inner)
      const actions = el('div', 'fr-actions', undefined, inner)
      yt = el('a', 'hud-btn fr-yt', 'Watch on YouTube ↗', actions)
      yt.target = '_blank'
      yt.rel = 'noopener'
      play = el('button', 'hud-btn hud-btn--ghost fr-play', undefined, actions)
      play.type = 'button'
      play.innerHTML = '<span class="fr-play-ic" aria-hidden="true"></span>Play here'
      play.addEventListener('click', () => {
        if (shown >= 0) openPlayer(VIDEOS[shown], play)
      })
      const strip = el('ol', 'fr-reel', undefined, card)
      reel = VIDEOS.map(() => el('li', '', undefined, strip))

      // an invisible twin of the card, to find its tallest layout
      measureBox = el('div', 'fr-card fr-card--measure hud-panel', undefined, ctx.stage)
      const mi = el('div', 'fr-inner', undefined, measureBox)
      cardMarkup(mi)
      const ma = el('div', 'fr-actions', undefined, mi)
      el('span', 'hud-btn fr-yt', 'Watch on YouTube ↗', ma)
      el('span', 'hud-btn hud-btn--ghost fr-play', 'Play here', ma)
      el('ol', 'fr-reel', undefined, measureBox).innerHTML = '<li></li>'
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => measureCard()).observe(ctx.stage)
        new ResizeObserver(() => {
          introH = intro.offsetHeight || introH
        }).observe(intro)
      }
      document.fonts?.ready.then(() => measureCard())

      // ---- thumbnails: the first right away, the rest after the reveal (never blocking init)
      const load = (i: number) =>
        loadThumb(VIDEOS[i].id)
          .then(t => {
            pics[i] = t
          })
          .catch(() => {
            /* no thumbnail: its title card stays on the sheet */
          })
      load(0)
      whenRevealed().then(() => Promise.all(VIDEOS.map((_, i) => (i === 0 ? null : load(i)))))
    },
    onEnter() {
      clock.reset()
      snap = true
    },
    onLeave() {
      if (isPlayerOpen()) closePlayer()
    },
    update(local, frame, ctx) {
      if (!sheet || !beam || !proj || !spill) return
      const dt = frame.dt
      now += dt
      const calm = frame.reducedMotion || !!frame.still
      if (!frame.reducedMotion && !frame.still) idle += dt
      const uC = clock.update(warp(local), dt)
      q = unwarp(uC)
      const w = where(q)
      // entering the chapter, a nav jump or a screenshot teleport: snap, no click
      const wasSnap = snap || !Number.isFinite(lastU) || Math.abs(uC - lastU) > 1.2
      lastU = uC
      snap = false

      // ---- the picture on the sheet (a cross-fade + focus pull; snaps on teleports)
      const want = pictureAt(q)
      const tex = picture(want)
      if (!sheet.showing(tex)) {
        // a thumbnail arriving for the video already up just settles in (no focus pull)
        const arriving = want === onSheet
        sheet.show(tex, { instant: wasSnap, calm, focus: !arriving })
        // the projector's gate clicks as a new video comes up (rate-limited by time; never on a teleport)
        if (!wasSnap && !arriving && now - clickAt > 0.4) {
          clickAt = now
          window.dispatchEvent(new CustomEvent('hark:sfx', { detail: { kind: 'click', level: 0.5 } }))
        }
        onSheet = want
      }
      sheet.update(dt, ctx.post.params.exposure, calm, 0.94, _amb.set('#2e1c11'))

      // ---- the projector: reels turn with the story (and idly with time), the film moves across
      const turn = q * 38 + idle * 0.9
      proj.setReels(-turn, -turn * 1.55, 1 - q)
      proj.setLamp(1)

      // ---- the light: the picture colours the beam, the spill and the rims
      const g = sheet.glow
      const lum = 0.2126 * g.r + 0.7152 * g.g + 0.0722 * g.b
      _chroma.copy(g).multiplyScalar(1 / Math.max(lum, 0.04))
      _chroma.r = Math.min(_chroma.r, 1.8)
      _chroma.g = Math.min(_chroma.g, 1.8)
      _chroma.b = Math.min(_chroma.b, 1.8)
      _beamC.set('#ffdcae').lerp(_chroma, 0.35)
      const bright = 0.55 + 0.9 * (lum / (lum + 0.12))
      beam.update(_beamC, 1.35 * bright, 1.1 * bright, idle, sheet.state, ctx.renderer.getPixelRatio())
      spill.color.copy(_beamC).lerp(_c2.set('#ffc890'), 0.4)
      spill.intensity = 30 * bright

      const p = ctx.world.params
      const track = w.k + ease.inOutCubic(w.t)
      // the lamp over the front row: a warm pool on the boards round the chairs
      p.spot = 3.6
      p.spotColor = GEL.tungsten
      p.spotPos.set(-7, 34, 47)
      p.spotAt.set(1.5, 2.5, 30)
      p.spotAngle = 0.36
      p.spotPenumbra = 0.7
      // the picture's light from behind the front row edges the chairs and the guitar
      p.rimA = 0.55
      p.rimAColor = _c.set(GEL.amber).lerp(_beamC, 0.3).getHex()
      p.rimADir.set(-0.5, 0.35, -1)
      p.rimB = 0.04
      p.rimBColor = GEL.straw
      p.rimBDir.set(0.9, 0.25, -1)
      p.fill = 0.12
      p.env = 0.3
      p.envTurn = 0.2 + track * 0.04
      p.haze = 0.3
      p.hazeColor = '#8a4e28'
      p.hazeY = 0.1
      p.bulbs = 0.45
      p.bokeh = 0.1
      bulbUniforms.uBulbI.value = 1
      if (bulbMat) bulbMat.color.set('#ffb45e').multiplyScalar(4.2)

      const post = ctx.post.params
      post.bloomThreshold = 1.9
      post.bloomStrength = 0.5
      post.bloomRadius = 0.5
      post.vignette = 0.5
      post.warmth = 0.9
      post.saturation = 1.04

      // the guitar in the front row: resting, not played
      if (guitar) {
        guitar.strings.amp.fill(0)
        guitar.strings.lightDir.set(-0.3, 0.8, 0.5)
        guitar.update(frame, ctx.camera, ctx.renderer)
      }

      // ---- copy
      const introVis = 1 - smoothstep(INTRO_OUT + V(0.005), INTRO_OUT + V(0.05), q)
      reveal(intro, introVis, 0)
      setRise(introTitle, q > RISE && q < INTRO_OUT + V(0.05))

      // the card: fades in as the camera settles on the first video, holds through the
      // videos (only its content cross-fades at each change), fades out for the crane up
      const t0 = TRAVEL[0]
      const panelIn = smoothstep(lerp(t0[0], t0[1], 0.55), lerp(t0[0], t0[1], 0.9), q)
      const panelOut = 1 - smoothstep(OUTRO + V(0.01), OUTRO + V(0.07), q)
      const pv = panelIn * panelOut
      reveal(card, pv, 0)
      let cv = 1
      if (w.k >= 1 && w.t > 0) cv = w.t < 0.5 ? 1 - smoothstep(0.16, 0.44, w.t) : smoothstep(0.56, 0.84, w.t)
      inner.style.opacity = cv.toFixed(3)
      const idx = want
      if (idx !== shown) {
        shown = idx
        const v = VIDEOS[idx]
        fill(inner, idx)
        yt.href = youtubeUrl(v.id)
        yt.setAttribute('aria-label', `Watch ${v.title} on YouTube (opens in a new tab)`)
        reel.forEach((li, j) => li.classList.toggle('is-on', j === idx))
      }
      card.classList.toggle('is-live', pv > 0.5)
    },
    camera(local, frame, out: CameraPose) {
      buildPoses(frame)
      const at = Number.isFinite(q) ? q : local
      const w = where(at)
      const P = tmpA
      if (w.k === 0 && w.t === 0 && at < RISE + 0.02) {
        // out of the soundhole: settle back from a little closer in to the wide shot
        const e = ease.inOutCubic(clamp(at / (RISE + 0.02)))
        holdPose(tmpB, 0, 0)
        lerpPose(P, poses.open, tmpB, e)
      } else if (w.t > 0) {
        holdPose(tmpB, w.k, 1)
        holdPose(tmpC, w.k + 1, 0)
        const e = ease.inOutCubic(w.t)
        if (w.k === 0) {
          // the wide shot → behind the projector: swing round and down, the eye leading
          lerpPose(P, tmpB, tmpC, e, ease.inOutCubic(clamp(w.t * 1.1)))
          P.p.y += Math.sin(Math.PI * w.t) * 1.5
        } else {
          // one step along the back of the front row
          lerpPose(P, tmpB, tmpC, e)
          P.p.z += Math.sin(Math.PI * w.t) * 0.35
        }
      } else holdPose(P, w.k, w.h)
      if (at > OUTRO) lerpPose(P, P, poses.outro, ease.inOutCubic(clamp((at - OUTRO) / (1 - OUTRO))))
      basis(P.yaw, P.pitch)
      out.position.copy(P.p)
      out.target.copy(P.p).addScaledVector(_f, 10)
      out.fov = P.fov
      out.parallax = 0.18
    },
  }
}

const _q = new THREE.Vector3()
const _c = new THREE.Color()
const _c2 = new THREE.Color()
const _amb = new THREE.Color()
const _chroma = new THREE.Color()
const _beamC = new THREE.Color()
