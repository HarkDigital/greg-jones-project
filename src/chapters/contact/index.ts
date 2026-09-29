import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext } from '../../core/types'
import { reveal, setRise } from '../../core/dom'
import { ease, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { Ring } from '../../kit/strings'
import { GEL } from '../../world/World'
import { buildHud, measureHud, type Hud, type Layout, type Rect } from './hud'
import { buildSet, type Box, type LastCallSet } from './scene'
import './contact.css'

/*
 * CONTACT · "Last Call" — the end of the night. The room has emptied: the
 * guitar leans on the bar stool under the last lamp, the boom mic still
 * hangs where the singer was, the setlist is taped to the rug, all ticked
 * off. The festoon bulbs dim as you read. One last chord rings out as you
 * arrive and decays (time-paced, subtle).
 *
 *   0.00–0.12  under the soundhole cut: the camera is close on THIS guitar's
 *              soundhole (the cut opens out of one soundhole onto another)
 *   0.06–0.30  the camera pulls back and up off the strings to the whole
 *              corner stage; the last chord strikes as the frame clears
 *   0.18–0.87  settled (landing / heading stop 0.3): the panel — eyebrow,
 *              "Best way to get in touch:", Greg Jones – the phone, the
 *              address on a spruce plate, Copy email, tour info, the EPK,
 *              the socials, Back to top, the footer. Short screens split it
 *              into two beats (A, then B) at SPLIT_AT, swapped by a 0.36 s
 *              time-paced dip (never left dimmed at rest). The camera eases
 *              round a few degrees; the festoon strands dim; the lamp's cone
 *              shows in the haze.
 *   0.87–1.00  the sign-off: the panel goes, the camera cranes up and back
 *              to the lamp over the empty stool (chairs up on the tables
 *              round the edge of the light) beside / over EPK.closing, the
 *              address, Back to top and the footer. The last frame stays lit
 *              (there is no cut after it).
 *
 * The camera, the copy and the light levels derive from `local`; only the
 * strings (Ring), the haze drift, the part swap and the copy's answer run
 * on time.
 */

const SPLIT_AT = 0.52
const STRUM_AT = 0.135

interface Shot {
  pos: THREE.Vector3
  tgt: THREE.Vector3
  fov: number
}
const shot = (): Shot => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 })

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Frame a box (centre c, half extents hw × hh, facing the camera) inside a
 * screen rect r (u across, v down, 0..1). The camera stands at distance d,
 * raised by `elev` degrees; the box is placed ACROSS by sliding the rig
 * sideways and UP/DOWN by pitching the view. Then the rig orbits by `yaw`
 * about the box's vertical axis (+ = the camera swings to the right).
 */
function fit(out: Shot, aspect: number, fov: number, b: Box, r: { u0: number; u1: number; v0: number; v1: number }, elev: number, yaw: number) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const halfH = Math.max(b.hh / Math.max(0.05, r.v1 - r.v0), b.hw / Math.max(0.05, (r.u1 - r.u0) * aspect))
  const halfW = halfH * aspect
  const d = halfH / tanV
  const sx = -((r.u0 + r.u1) / 2 - 0.5) * 2 * halfW
  const ny = 1 - (r.v0 + r.v1)
  const delta = Math.atan(ny * tanV)
  const e = THREE.MathUtils.degToRad(elev)
  _b.set(sx, d * Math.sin(e), d * Math.cos(e))
  _a.set(0, -Math.sin(e + delta), -Math.cos(e + delta)).multiplyScalar(d).add(_b)
  _a.applyAxisAngle(UP, yaw)
  _b.applyAxisAngle(UP, yaw)
  out.tgt.set(b.c.x + _a.x, b.c.y + _a.y, b.c.z + _a.z)
  out.pos.set(b.c.x + _b.x, b.c.y + _b.y, b.c.z + _b.z)
  out.fov = fov
  return out
}

function mix(out: Shot, a: Shot, b: Shot, t: number) {
  out.pos.lerpVectors(a.pos, b.pos, t)
  out.tgt.lerpVectors(a.tgt, b.tgt, t)
  out.fov = lerp(a.fov, b.fov, t)
  return out
}

const toRect = (q: Rect, W: number, H: number) => ({ u0: q.x0 / W, u1: q.x1 / W, v0: q.y0 / H, v1: q.y1 / H })

export default function create(): Chapter {
  const group = new THREE.Group()
  let hud: Hud
  let set: LastCallSet
  let lay: Layout | null = null
  let lastW = 0
  let lastH = 0
  // the split's part swap runs on TIME (a 0.36 s dip), so the copy is never
  // left dimmed at rest wherever the scroll stops
  let shownB = false
  let swapT = -1
  let snapPart = true
  let closingOn = false

  // the last chord: six time-decaying rings, struck low D → high D
  const rings = Array.from({ length: 6 }, () => new Ring(3.4, 0.6))
  const PEAK = [0.012, 0.011, 0.0102, 0.0094, 0.0085, 0.0076]
  let strumAt = -1e9
  let lastStrum = -1e9
  const struck = [true, true, true, true, true, true]
  let prevLocal = NaN
  let entered = false
  // the copy's answer: the lamp swells a touch, the high D sings (wall clock)
  let copiedSeen = -1e9
  let pulse = 0

  // camera scratch
  const CLOSE = shot()
  const S1 = shot()
  const S2 = shot()
  const F = shot()
  const OUT = shot()
  const tight: Box = { c: new THREE.Vector3(), hw: 0, hh: 0 }
  const phone: Box = { c: new THREE.Vector3(), hw: 0, hh: 0 }
  const lightDir = new THREE.Vector3()
  const buf = new THREE.Vector2()

  const relayout = (W: number, H: number) => {
    lay = measureHud(hud, W, H)
    lastW = W
    lastH = H
    snapPart = true
  }

  return {
    id: 'contact',
    group,
    anchors: [],

    async init(ctx: ChapterContext) {
      hud = buildHud(ctx.stage)
      await nextFrame()
      set = await buildSet(ctx.mobile)
      group.add(set.group)
      lightDir.copy(set.lampAt).sub(set.heart).normalize()
      set.guitar.strings.lightDir.copy(lightDir)
      await nextFrame()
    },

    onEnter() {
      entered = true
      prevLocal = NaN
      snapPart = true
    },

    busy() {
      return pulse > 0.002 || swapT >= 0
    },

    update(local, frame, ctx) {
      const W = frame.width
      const H = frame.height
      if (hud.dirty || W !== lastW || H !== lastH || !lay) relayout(W, H)
      const L = lay!
      const calm = ctx.reducedMotion || frame.reducedMotion || !!frame.still
      const g = set.guitar

      // ------------------------------------------------ the last chord
      const ready = document.documentElement.dataset.ready === '1'
      // the chord sounds only when the scroll carries you across STRUM_AT (a
      // continuous crossing); arriving by a jump rings the strings silently —
      // the sound contract never fires on teleports. Rate-limited by TIME.
      const continuous = Number.isFinite(prevLocal) && Math.abs(local - prevLocal) < 0.12
      const crossed = continuous && prevLocal < STRUM_AT && local >= STRUM_AT && local <= 0.9
      const arrived = entered && local >= STRUM_AT && local <= 0.9
      if (ready && !calm && (crossed || arrived) && frame.time - lastStrum > 4) {
        strumAt = frame.time
        lastStrum = frame.time
        struck.fill(false)
        // the open DADGBD chord (the UI's strum), gently
        if (crossed) window.dispatchEvent(new CustomEvent('hark:strum', { detail: { level: 0.7 } }))
      }
      if (ready) entered = false
      prevLocal = local
      for (let i = 0; i < 6; i++) {
        if (!struck[i] && frame.time >= strumAt + i * 0.05) {
          rings[i].strike(frame.time, 1)
          struck[i] = true
        }
      }
      // copying the address: the high D sings once, the lamp answers
      if (hud.copiedAt !== copiedSeen) {
        copiedSeen = hud.copiedAt
        if (!calm && rings[5].strike(frame.time, 0.85)) {
          window.dispatchEvent(new CustomEvent('hark:pluck', { detail: { midi: 62, level: 0.6 } }))
        }
      }
      const since = (performance.now() - hud.copiedAt) / 1000
      pulse = since >= 0 && since < 1.6 ? Math.sin(Math.min(1, since / 0.15) * Math.PI * 0.5) * Math.exp(-since * 2.2) : 0
      for (let i = 0; i < 6; i++) g.strings.amp[i] = calm ? 0 : PEAK[i] * rings[i].value(frame.time)
      g.strings.wobble = 0

      // ------------------------------------------------ the light
      // closing time: the festoon strands dim as you read; the last lamp stays
      const dim = smoothstep(0.16, 0.97, local)
      const fin = smoothstep(0.87, 0.98, local)
      const wp = ctx.world.params
      wp.top = '#0c0806'
      wp.bottom = '#020101'
      wp.haze = lerp(0.34, 0.24, dim)
      wp.hazeColor = '#8f4c26'
      wp.hazeY = 0.05
      wp.bulbs = lerp(1.0, 0.3, dim)
      wp.bulbColor = GEL.bulb
      wp.bokeh = lerp(0.16, 0.05, dim)
      wp.bokehA = GEL.amber
      wp.bokehB = GEL.candle
      wp.beams = 0
      // the last lamp is the spot (the only shadow caster)
      wp.spot = 1.35 + 0.08 * pulse
      wp.spotColor = GEL.tungsten
      wp.spotPos.copy(set.lampAt)
      wp.spotAt.copy(set.heart)
      wp.spotAngle = 0.5
      wp.spotPenumbra = 0.6
      // rims from behind: bulb amber left, a cool dusk window right (sparingly)
      wp.rimA = lerp(0.85, 0.7, fin)
      wp.rimAColor = GEL.amber
      wp.rimADir.set(-0.85, 0.35, -1)
      wp.rimB = 0.32
      wp.rimBColor = GEL.dusk
      wp.rimBDir.set(0.95, 0.2, -1)
      wp.fill = 0.07
      wp.env = lerp(0.6, 0.45, dim)
      wp.envTurn = -0.35 + 0.5 * local

      set.setLamp(1 + 0.3 * pulse)
      set.setRoom(lerp(1, 0.45, dim))
      // the lamp's cone in the haze (once the camera has pulled back off the
      // strings): a touch stronger as the room goes dark
      set.setHaze(lerp(0.13, 0.2, dim) * smoothstep(0.17, 0.27, local) * (1 + 0.15 * pulse), ctx.reducedMotion || frame.reducedMotion ? 0 : frame.time, ctx.camera.position)
      ctx.renderer.getDrawingBufferSize(buf)
      set.setFestoon(local, buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov / 2))))
      g.strings.light.set(GEL.tungsten).multiplyScalar(1.1)
      g.update(frame, ctx.camera, ctx.renderer)

      const pp = ctx.post.params
      // only the pendant bulb crosses the threshold
      pp.bloomStrength = 0.6
      pp.bloomRadius = 0.5
      pp.bloomThreshold = 1.85
      pp.vignette = lerp(0.6, 0.68, fin)
      pp.grain = 0.035
      pp.warmth = 1
      pp.lift = 0.013

      // ------------------------------------------------ copy
      let pv = smoothstep(0.17, 0.225, local) * (1 - smoothstep(0.855, 0.885, local))
      // the split: the panel dips out and back (0.36 s) while it changes part
      const wantB = L.split && local >= SPLIT_AT
      if (snapPart) {
        snapPart = false
        swapT = -1
        if (wantB !== shownB) hud.root.classList.toggle('show-b', (shownB = wantB))
      } else if (swapT < 0 && wantB !== shownB) swapT = 0
      if (swapT >= 0) {
        const was = swapT
        swapT = Math.min(1, swapT + frame.dt / 0.36)
        if (was < 0.5 && swapT >= 0.5 && wantB !== shownB) hud.root.classList.toggle('show-b', (shownB = wantB))
        pv *= Math.abs(1 - 2 * swapT)
        if (swapT >= 1) swapT = -1
      }
      reveal(hud.panel, pv)
      setRise(hud.title, local > 0.175 && local < 0.875 && !shownB)
      const ev = smoothstep(0.895, 0.935, local)
      reveal(hud.end, ev, 0)
      const on = local > 0.89
      if (on !== closingOn) setRise(hud.closing, (closingOn = on))
    },

    camera(local, frame, out: CameraPose) {
      const W = Math.max(1, frame.width)
      const H = Math.max(1, frame.height)
      const aspect = W / H
      const L = lay
      const stack = L ? L.stack : H > W
      const fov = stack ? 36 : 30
      const s = set.subject
      const band = L ? L.band : { x0: 0.04 * W, x1: 0.96 * W, y0: 0.11 * H, y1: 0.89 * H }
      const art = L ? L.art : stack ? { x0: band.x0, x1: band.x1, y0: band.y0, y1: H * 0.45 } : { x0: W * 0.46, x1: band.x1, y0: band.y0, y1: band.y1 }
      const fr = L ? L.fin : { x0: band.x0, x1: band.x1, y0: band.y0, y1: band.y1 - 160 }

      // arrival: close on this guitar's soundhole, a little above and to the right
      _a.copy(set.holeN)
      CLOSE.tgt.copy(set.hole)
      CLOSE.pos.copy(set.hole).addScaledVector(_a, stack ? 4.4 : 3.4).add(_b.set(0.6, 0.9, 0))
      CLOSE.fov = stack ? 40 : 32

      // phones: the guitar and the stool fill the little window; the mic's
      // top may crop into the chrome band
      let sub = s
      if (stack && W < 600) {
        phone.c.set(s.c.x + 0.3, 5.9, s.c.z)
        phone.hw = s.hw * 0.85
        phone.hh = 6.1
        sub = phone
      }
      // the settled drift: in a touch closer and round a few degrees
      tight.c.copy(sub.c).add(_b.set(-0.2, -0.2, 0))
      tight.hw = sub.hw * 0.96
      tight.hh = sub.hh * 0.96
      fit(S1, aspect, fov, sub, toRect(art, W, H), 7, stack ? 0.18 : 0.26)
      fit(S2, aspect, fov, tight, toRect(art, W, H), 5, stack ? 0.1 : 0.12)
      fit(F, aspect, fov, set.corner, toRect(fr, W, H), stack ? 12 : 10, stack ? 0.02 : 0.16)
      if (local < 0.3) mix(OUT, CLOSE, S1, ease.inOutCubic(segment(local, 0.05, 0.3)))
      else if (local < 0.87) mix(OUT, S1, S2, ease.inOutQuad(segment(local, 0.3, 0.87)))
      else mix(OUT, S2, F, ease.inOutCubic(segment(local, 0.87, 0.985)))
      out.position.copy(OUT.pos)
      out.target.copy(OUT.tgt)
      out.fov = OUT.fov
      out.roll = 0
      // the closing frame holds still
      out.parallax = 0.14 * (1 - smoothstep(0.87, 0.96, local)) * smoothstep(0.1, 0.25, local)
    },
  }
}
