import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rng } from '../../core/math'
import { FONT, chrome, gold, grille, mahoganyMap, nickel, rubber, tile, tolexBump } from '../../kit/materials'
import { cable, scaleUv } from '../../kit/stage'
import { box, merge, mesh, rod } from './util'

/*
 * THE BAND · props for the corner stage: guitar stands, boom mic stands
 * with dynamic vocal mics (all three of them sing), a wooden bar stool, a bass
 * cab with its head, a road case, a tabletop radio with a
 * glowing dial (Radio104.5 and 93.7 on it), an ON AIR lightbox, a
 * clapperboard for the House Not Home video, a rug under the kit, warm
 * floorboards, a taped setlist and festoon strands of bulbs. All generic —
 * no makers' logos. Units: 1 = 10 cm; floor y = 0.
 *
 * The mic stand and the stool are the same props the hero's corner stage
 * needs — candidates for the kit (see the module's coreChangeRequests).
 */

/* ------------------------------------------------------------------ materials */

export interface Mats {
  stand: THREE.MeshStandardMaterial
  chrome: THREE.MeshStandardMaterial
  nickel: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  micBody: THREE.MeshStandardMaterial
  micMesh: THREE.MeshStandardMaterial
  oak: THREE.MeshPhysicalMaterial
  brass: THREE.MeshStandardMaterial
  cream: THREE.MeshStandardMaterial
  corner: THREE.MeshStandardMaterial
}

export function makeMats(): Mats {
  return {
    stand: new THREE.MeshStandardMaterial({ color: '#15130f', metalness: 0.55, roughness: 0.42 }),
    chrome: chrome(0.12),
    nickel: nickel(0.22),
    rubber: rubber(),
    micBody: new THREE.MeshStandardMaterial({ color: '#1a1917', metalness: 0.4, roughness: 0.45 }),
    micMesh: new THREE.MeshStandardMaterial({ color: '#ffffff', map: meshMap(), metalness: 1, roughness: 0.42 }),
    oak: new THREE.MeshPhysicalMaterial({ color: '#b27a48', map: oakMap(), roughness: 0.48, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    brass: gold(0.28),
    cream: new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.35 }),
    // amp corners and case balls: satin, so a point lamp never pins a hot glint on them
    corner: new THREE.MeshStandardMaterial({ color: '#8a8580', metalness: 0.85, roughness: 0.42 }),
  }
}

/** a mic's woven steel grille */
function meshMap() {
  return tile('band-micmesh', 64, 64, (g, w, h) => {
    g.fillStyle = '#2a2927'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#d8d6d0'
    g.lineWidth = 2.2
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * w
      g.beginPath()
      g.moveTo(p, 0)
      g.lineTo(p, h)
      g.moveTo(0, p)
      g.lineTo(w, p)
      g.stroke()
    }
  })
}

/** light oak with a soft grain (the stool) */
function oakMap() {
  return tile('band-oak', 256, 256, (g, w, h) => {
    g.fillStyle = '#e8d2b0'
    g.fillRect(0, 0, w, h)
    const r = rng(19)
    for (let i = 0; i < 90; i++) {
      const y = r() * h
      g.strokeStyle = `rgba(110,62,26,${0.06 + r() * 0.16})`
      g.lineWidth = 0.8 + r() * 2
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.7, y + (r() - 0.5) * 8, w, y)
      g.stroke()
    }
  })
}

/* ------------------------------------------------------------------ floor + rug */

/** warm, varnished floorboards (x along the boards), worn to lighter wood in the traffic */
export function floorMap() {
  return tile('band-floor', 512, 512, (g, w, h) => {
    const r = rng(23)
    const rows = 8
    const bh = h / rows
    for (let i = 0; i < rows; i++) {
      const y = i * bh
      // a few boards per row, each its own tone
      let x = -r() * 200
      while (x < w) {
        const len = 180 + r() * 260
        const tone = 0.78 + r() * 0.36
        g.fillStyle = `rgb(${Math.round(104 * tone)},${Math.round(64 * tone)},${Math.round(34 * tone)})`
        g.fillRect(x, y, len, bh)
        // grain streaks
        for (let k = 0; k < 16; k++) {
          const gy = y + r() * bh
          g.strokeStyle = r() > 0.5 ? `rgba(40,20,8,${0.08 + r() * 0.16})` : `rgba(170,110,60,${0.05 + r() * 0.1})`
          g.lineWidth = 0.5 + r() * 1.4
          g.beginPath()
          g.moveTo(x, gy)
          g.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 5, x + len * 0.7, gy + (r() - 0.5) * 5, x + len, gy + (r() - 0.5) * 2)
          g.stroke()
        }
        // an occasional knot
        if (r() > 0.7) {
          const kx = x + r() * len
          const ky = y + bh * (0.3 + r() * 0.4)
          const grad = g.createRadialGradient(kx, ky, 0, kx, ky, 7)
          grad.addColorStop(0, 'rgba(34,16,6,0.8)')
          grad.addColorStop(1, 'rgba(34,16,6,0)')
          g.fillStyle = grad
          g.beginPath()
          g.ellipse(kx, ky, 12, 5, 0, 0, Math.PI * 2)
          g.fill()
        }
        // butt joint + nails
        g.fillStyle = 'rgba(8,4,2,0.9)'
        g.fillRect(x + len - 1, y, 2, bh)
        g.fillStyle = 'rgba(20,12,8,0.7)'
        g.fillRect(x + 6, y + bh * 0.25, 2, 2)
        g.fillRect(x + 6, y + bh * 0.72, 2, 2)
        x += len
      }
      // the seam between rows
      g.fillStyle = 'rgba(6,3,1,0.95)'
      g.fillRect(0, y, w, 2)
    }
    // scuffs: varnish worn lighter
    for (let k = 0; k < 60; k++) {
      g.fillStyle = `rgba(200,150,100,${0.03 + r() * 0.05})`
      g.fillRect(r() * w, r() * h, 20 + r() * 80, 1 + r() * 2)
    }
  })
}

/** a worn Persian-style rug under the kit (fringe via alpha) */
function rugMap() {
  return tile(
    'band-rug',
    512,
    352,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      const fr = 14 // fringe
      const x0 = fr
      const x1 = w - fr
      const r = rng(43)
      // fringe threads
      g.strokeStyle = '#d9c9a4'
      g.lineWidth = 1.4
      for (let y = 4; y < h - 4; y += 4) {
        const j = (r() - 0.5) * 3
        g.beginPath()
        g.moveTo(0 + r() * 4, y + j)
        g.lineTo(x0 + 1, y)
        g.moveTo(x1 - 1, y)
        g.lineTo(w - r() * 4, y + j)
        g.stroke()
      }
      const W = x1 - x0
      const field = '#7a2316'
      const indigo = '#1f2440'
      const creamC = '#e2cfa4'
      const amber = '#c9832e'
      g.fillStyle = indigo
      g.fillRect(x0, 0, W, h)
      // guards and main border
      g.fillStyle = creamC
      g.fillRect(x0 + 6, 6, W - 12, h - 12)
      g.fillStyle = indigo
      g.fillRect(x0 + 9, 9, W - 18, h - 18)
      // main border motifs: little lozenges
      for (let i = 0; i < 40; i++) {
        const t = i / 40
        const pts: [number, number][] = [
          [x0 + 9 + t * (W - 18), 22],
          [x0 + 9 + t * (W - 18), h - 22],
        ]
        for (const [px, py] of pts) {
          g.fillStyle = i % 2 ? amber : creamC
          g.beginPath()
          g.moveTo(px, py - 7)
          g.lineTo(px + 6, py)
          g.lineTo(px, py + 7)
          g.lineTo(px - 6, py)
          g.fill()
        }
      }
      for (let i = 0; i < 26; i++) {
        const t = i / 26
        for (const px of [x0 + 22, x1 - 22]) {
          const py = 9 + t * (h - 18)
          g.fillStyle = i % 2 ? amber : creamC
          g.beginPath()
          g.moveTo(px, py - 6)
          g.lineTo(px + 6, py)
          g.lineTo(px, py + 6)
          g.lineTo(px - 6, py)
          g.fill()
        }
      }
      g.fillStyle = creamC
      g.fillRect(x0 + 34, 34, W - 68, h - 68)
      // the field
      g.fillStyle = field
      g.fillRect(x0 + 37, 37, W - 74, h - 74)
      // scattered flowers
      for (let i = 0; i < 90; i++) {
        const px = x0 + 50 + r() * (W - 100)
        const py = 50 + r() * (h - 100)
        g.fillStyle = r() > 0.5 ? 'rgba(226,207,164,0.55)' : 'rgba(31,36,64,0.7)'
        g.beginPath()
        g.arc(px, py, 2 + r() * 2.5, 0, Math.PI * 2)
        g.fill()
      }
      // corner spandrels
      g.fillStyle = indigo
      const cw = 70
      const ch = 56
      for (const [cx, cy, sx, sy] of [
        [x0 + 37, 37, 1, 1],
        [x1 - 37, 37, -1, 1],
        [x0 + 37, h - 37, 1, -1],
        [x1 - 37, h - 37, -1, -1],
      ]) {
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + sx * cw, cy)
        g.quadraticCurveTo(cx + sx * cw * 0.4, cy + sy * ch * 0.4, cx, cy + sy * ch)
        g.fill()
      }
      // the medallion
      const mx = w / 2
      const my = h / 2
      const lay = (rx: number, ry: number, col: string) => {
        g.fillStyle = col
        g.beginPath()
        g.moveTo(mx - rx, my)
        g.quadraticCurveTo(mx - rx * 0.3, my - ry * 0.3, mx, my - ry)
        g.quadraticCurveTo(mx + rx * 0.3, my - ry * 0.3, mx + rx, my)
        g.quadraticCurveTo(mx + rx * 0.3, my + ry * 0.3, mx, my + ry)
        g.quadraticCurveTo(mx - rx * 0.3, my + ry * 0.3, mx - rx, my)
        g.fill()
      }
      lay(130, 92, creamC)
      lay(124, 86, indigo)
      lay(88, 62, amber)
      lay(80, 56, field)
      lay(44, 32, creamC)
      lay(38, 27, indigo)
      g.fillStyle = amber
      g.beginPath()
      g.arc(mx, my, 9, 0, Math.PI * 2)
      g.fill()
      // wear: pale abrasion and dark soil
      const img = g.getImageData(0, 0, w, h)
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] === 0) continue
        const n = r()
        const k = 0.86 + n * 0.22
        img.data[i] = Math.min(255, img.data[i] * k)
        img.data[i + 1] = Math.min(255, img.data[i + 1] * k)
        img.data[i + 2] = Math.min(255, img.data[i + 2] * k)
      }
      g.putImageData(img, 0, 0)
    },
    { repeat: false },
  )
}

export function buildRug(w: number, d: number) {
  const geo = new THREE.PlaneGeometry(w, d)
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: rugMap(), roughness: 0.95, alphaTest: 0.5 }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.03
  m.receiveShadow = true
  return m
}

/* ------------------------------------------------------------------ stands */

const _f = new THREE.Vector3()
const _r = new THREE.Vector3()

/**
 * A tubular guitar stand under an upright instrument: a padded cradle for
 * its bottom (`bottom`, world), a post up to a yoke round the neck (`neck`,
 * world: a point just behind the neck), tripod legs. `yaw` = the direction
 * the instrument faces.
 */
export function guitarStand(M: Mats, bottom: THREE.Vector3, neck: THREE.Vector3, yaw: number) {
  _f.set(Math.sin(yaw), 0, Math.cos(yaw))
  _r.set(Math.cos(yaw), 0, -Math.sin(yaw))
  const V = (base: THREE.Vector3, f: number, r: number, y: number) => base.clone().addScaledVector(_f, f).addScaledVector(_r, r).setY(y)
  const cy = Math.max(0.4, bottom.y - 0.1)
  const hub = V(bottom, -0.9, 0, cy + 0.2)
  const g: THREE.BufferGeometry[] = []
  const pads: THREE.BufferGeometry[] = []
  // cradle bar and its two upturned arms
  g.push(rod(V(bottom, -0.05, -0.85, cy), V(bottom, -0.05, 0.85, cy), 0.06, 8))
  for (const s of [-1, 1]) {
    const a = V(bottom, -0.05, s * 0.72, cy)
    const b = V(bottom, 0.32, s * 0.72, cy + 0.34)
    g.push(rod(a, b, 0.055, 8))
    pads.push(rod(a.clone().lerp(b, 0.4), b.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.085, 10))
  }
  g.push(rod(V(bottom, -0.05, 0, cy), hub, 0.06, 8))
  // the post up to the yoke
  const top = neck.clone().addScaledVector(_f, -0.08)
  g.push(rod(hub, top, 0.065, 10))
  // yoke: a U round the neck
  for (const s of [-1, 1]) {
    const a = top.clone().addScaledVector(_r, s * 0.36)
    g.push(rod(top, a, 0.045, 8))
    const b = a.clone().addScaledVector(_f, 0.5)
    g.push(rod(a, b, 0.045, 8))
    pads.push(rod(a, b, 0.07, 10))
  }
  // tripod legs
  for (const [f, r] of [
    [-2.0, -1.2],
    [-2.0, 1.2],
    [0.7, 0],
  ]) {
    g.push(rod(hub, V(bottom, f, r, 0.05), 0.055, 8))
    pads.push(new THREE.SphereGeometry(0.1, 8, 6).translate(...V(bottom, f, r, 0.07).toArray()))
  }
  const grp = new THREE.Group()
  grp.add(mesh(merge(g), M.stand), mesh(merge(pads), M.rubber, false, true))
  return grp
}

/** the dynamic vocal mic, +Y up its body (the grille at y ≈ 1.3); origin at the connector end */
function micGeometry(M: Mats) {
  const handle = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, 0),
      new THREE.Vector2(0.17, 0),
      new THREE.Vector2(0.19, 0.05),
      new THREE.Vector2(0.205, 0.5),
      new THREE.Vector2(0.25, 0.95),
      new THREE.Vector2(0.27, 1.0),
      new THREE.Vector2(0.27, 1.02),
    ],
    20,
  )
  const band = new THREE.CylinderGeometry(0.285, 0.285, 0.08, 20).translate(0, 1.05, 0)
  const cap = new THREE.SphereGeometry(0.29, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6)
  scaleUv(cap, 7, 3)
  cap.translate(0, 1.24, 0)
  const skirt = new THREE.CylinderGeometry(0.276, 0.276, 0.16, 22, 1, true)
  scaleUv(skirt, 7, 0.5)
  skirt.translate(0, 1.13, 0)
  const g = new THREE.Group()
  g.add(mesh(handle, M.micBody, true, true), mesh(band, M.chrome, false, true), mesh(merge([cap, skirt]), M.micMesh, true, true))
  return g
}

export interface MicStand {
  group: THREE.Group
  /** world position of the mic's grille */
  head: THREE.Vector3
}

/**
 * A boom mic stand: tripod, two-section pole with a clutch, the boom from
 * the top joint to a mic clip at `clip` (world), a counterweight behind, the
 * mic aimed along `aim` (toward a singer's mouth), its cable down to the floor.
 */
export function boomStand(M: Mats, base: THREE.Vector3, height: number, clip: THREE.Vector3, aim: THREE.Vector3, legYaw = 0): MicStand {
  const g: THREE.BufferGeometry[] = []
  const blk: THREE.BufferGeometry[] = []
  const hub = base.clone().setY(1.2)
  for (let k = 0; k < 3; k++) {
    const a = legYaw + (k * Math.PI * 2) / 3
    const foot = base.clone().add(new THREE.Vector3(Math.cos(a) * 2.0, 0.08, Math.sin(a) * 2.0))
    g.push(rod(hub, foot, 0.055, 8))
    blk.push(new THREE.SphereGeometry(0.1, 8, 6).translate(foot.x, 0.08, foot.z))
  }
  const mid = base.clone().setY(height * 0.58)
  const top = base.clone().setY(height)
  g.push(rod(base.clone().setY(0.9), mid, 0.1, 10))
  blk.push(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 12).translate(mid.x, mid.y, mid.z))
  g.push(rod(mid, top, 0.07, 10))
  blk.push(new THREE.SphereGeometry(0.17, 12, 10).translate(top.x, top.y, top.z))
  // boom
  const back = top.clone().addScaledVector(clip.clone().sub(top), -0.5)
  g.push(rod(back, clip, 0.05, 8))
  blk.push(rod(back, back.clone().lerp(top, 0.3), 0.17, 12))
  blk.push(new THREE.SphereGeometry(0.1, 10, 8).translate(clip.x, clip.y, clip.z))
  const grp = new THREE.Group()
  grp.add(mesh(merge(g), M.stand), mesh(merge(blk), M.micBody))
  // the mic: its clip grabs it ~0.45 up the body
  const mic = micGeometry(M)
  const dir = aim.clone().normalize()
  mic.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  mic.position.copy(clip).addScaledVector(dir, -0.45)
  grp.add(mic)
  const tail = mic.position.clone()
  // the cable: out of the connector, down beside the pole, along the floor
  const pole = base.clone()
  grp.add(
    cable(
      [
        tail,
        tail.clone().addScaledVector(dir, -0.5).add(new THREE.Vector3(0, -0.4, 0)),
        tail.clone().lerp(top, 0.7).add(new THREE.Vector3(0, -1.2, 0)),
        pole.clone().add(new THREE.Vector3(0.18, height * 0.45, 0.1)),
        pole.clone().add(new THREE.Vector3(0.3, 0.9, 0.2)),
        pole.clone().add(new THREE.Vector3(0.6, 0.05, -0.5)),
        pole.clone().add(new THREE.Vector3(1.0, 0.05, -3.5)),
      ],
      0.034,
    ),
  )
  const head = mic.position.clone().addScaledVector(dir, 1.25)
  return { group: grp, head }
}

/** a wooden bar stool (the seat at seatH) */
export function stool(M: Mats, pos: THREE.Vector3, seatH = 7.2) {
  const g: THREE.BufferGeometry[] = []
  const seat = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, seatH - 0.16),
      new THREE.Vector2(1.46, seatH - 0.16),
      new THREE.Vector2(1.56, seatH - 0.08),
      new THREE.Vector2(1.58, seatH + 0.04),
      new THREE.Vector2(1.5, seatH + 0.12),
      new THREE.Vector2(0.9, seatH + 0.14),
      new THREE.Vector2(0, seatH + 0.1),
    ],
    32,
  )
  scaleUv(seat, 2, 1)
  g.push(seat)
  g.push(new THREE.CylinderGeometry(1.15, 1.15, 0.36, 28, 1, true).translate(0, seatH - 0.34, 0))
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const t = new THREE.Vector3(Math.cos(a) * 0.95, seatH - 0.3, Math.sin(a) * 0.95)
    const b = new THREE.Vector3(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7)
    g.push(rod(b, t, 0.1, 10, 0.085))
  }
  g.push(new THREE.TorusGeometry(1.38, 0.065, 8, 40).rotateX(Math.PI / 2).translate(0, 2.5, 0))
  const m = mesh(merge(g), M.oak)
  m.position.copy(pos)
  return m
}

/* ------------------------------------------------------------------ amps */

function tolexMat(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, bumpMap: tolexBump(), bumpScale: 1.2 })
}

/** an amp's control panel: labels (decorative), dark brushed plate */
function panelMap(labels: string[]) {
  return tile(
    'band-panel-' + labels.join('-'),
    512,
    96,
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#2a2622')
      grad.addColorStop(1, '#171411')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      const r = rng(labels.length * 3)
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,240,220,${0.015 + r() * 0.02})`
        g.fillRect(0, r() * h, w, 1)
      }
      g.fillStyle = '#e9dcc0'
      g.font = FONT.mono(13, 600)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      labels.forEach((l, i) => {
        const x = ((i + 0.5) / labels.length) * w
        g.fillText(l, x, h * 0.2)
      })
      g.strokeStyle = 'rgba(233,220,192,0.5)'
      g.lineWidth = 1.5
      g.strokeRect(5, 5, w - 10, h - 10)
    },
    { repeat: false },
  )
}

export interface Amp {
  group: THREE.Group
  jewel: THREE.MeshBasicMaterial
}

/**
 * A cabinet: tolex, a grille with cream piping, corners, feet. With `panel`
 * a strip of controls across the top of the front (knobs + a jewel lamp).
 */
export function buildAmp(
  M: Mats,
  o: { w: number; h: number; d: number; tolex: string; grille: 'wheat' | 'salt' | 'oxblood'; panel?: string[]; panelH?: number; handle?: boolean; feet?: boolean; jewel?: string },
): Amp {
  const grp = new THREE.Group()
  const { w, h, d } = o
  const body = mesh(new RoundedBoxGeometry(w, h, d, 3, 0.1), tolexMat(o.tolex))
  body.position.y = h / 2
  grp.add(body)
  const ph = o.panel ? (o.panelH ?? 0.95) : 0
  const gw = w - 0.56
  const gh = h - 0.56 - ph
  const gy = 0.28 + gh / 2
  const gGeo = new THREE.PlaneGeometry(gw, gh)
  scaleUv(gGeo, gw / 1.6, gh / 1.6)
  const gm = mesh(gGeo, grille(o.grille), false, true)
  gm.position.set(0, gy, d / 2 + 0.004)
  grp.add(gm)
  // piping round the grille
  const pp: THREE.BufferGeometry[] = []
  const z = d / 2 + 0.01
  const x0 = -gw / 2
  const x1 = gw / 2
  const y0 = gy - gh / 2
  const y1 = gy + gh / 2
  const P = (x: number, y: number) => new THREE.Vector3(x, y, z)
  pp.push(rod(P(x0, y0), P(x1, y0), 0.03, 6), rod(P(x1, y0), P(x1, y1), 0.03, 6), rod(P(x1, y1), P(x0, y1), 0.03, 6), rod(P(x0, y1), P(x0, y0), 0.03, 6))
  grp.add(mesh(merge(pp), M.cream, false, false))
  // corners and feet
  const cg: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1])
    for (const sy of [0, 1])
      for (const sz of [-1, 1]) cg.push(new RoundedBoxGeometry(0.4, 0.4, 0.4, 2, 0.1).translate((sx * (w - 0.3)) / 2, sy * h + (sy ? -0.15 : 0.15), (sz * (d - 0.3)) / 2))
  grp.add(mesh(merge(cg), M.corner, false, true))
  let jewel = new THREE.MeshBasicMaterial({ color: '#000000' })
  if (o.panel) {
    const py = h - 0.28 - ph / 2
    const pGeo = new THREE.PlaneGeometry(w - 0.56, ph)
    const pm = mesh(pGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: panelMap(o.panel), roughness: 0.55, metalness: 0.3 }), false, true)
    pm.position.set(0, py, d / 2 + 0.006)
    grp.add(pm)
    const kg: THREE.BufferGeometry[] = []
    const n = o.panel.length
    for (let i = 0; i < n; i++) {
      if (o.panel[i] === '' || o.panel[i] === 'INPUT') continue
      const x = -(w - 0.56) / 2 + ((i + 0.5) / n) * (w - 0.56)
      kg.push(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 16).rotateX(Math.PI / 2).translate(x, py - ph * 0.12, d / 2 + 0.08))
    }
    grp.add(mesh(merge(kg), new THREE.MeshStandardMaterial({ color: '#e6d6b2', roughness: 0.35 }), false, true))
    // input jack at the INPUT slot
    const ii = o.panel.indexOf('INPUT')
    if (ii >= 0) {
      const x = -(w - 0.56) / 2 + ((ii + 0.5) / n) * (w - 0.56)
      grp.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12).rotateX(Math.PI / 2).translate(x, py - ph * 0.12, d / 2 + 0.03), M.chrome, false, false))
    }
    // the jewel lamp at the right end
    jewel = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.jewel ?? '#ff9a3c').multiplyScalar(2.2), toneMapped: false })
    const jx = (w - 0.56) / 2 - 0.26
    const jm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), jewel)
    jm.position.set(jx, py - ph * 0.12, d / 2 + 0.04)
    grp.add(jm)
    grp.add(mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 16).translate(jx, py - ph * 0.12, d / 2 + 0.03), M.chrome, false, false))
  }
  if (o.handle) {
    const hg: THREE.BufferGeometry[] = []
    const hy = h + 0.02
    hg.push(box(1.5, 0.08, 0.34, 0, hy + 0.14, 0))
    hg.push(box(0.26, 0.2, 0.4, -0.85, hy + 0.04, 0), box(0.26, 0.2, 0.4, 0.85, hy + 0.04, 0))
    grp.add(mesh(merge(hg), new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.6 }), false, true))
  }
  return { group: grp, jewel }
}

/* ------------------------------------------------------------------ the happenings corner */

/** a road case: black laminate, aluminium edges, ball corners, latches, a stencil */
export function roadCase(M: Mats, w: number, h: number, d: number) {
  const grp = new THREE.Group()
  const body = mesh(new RoundedBoxGeometry(w, h, d, 2, 0.05), new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.62, bumpMap: tolexBump(), bumpScale: 0.35 }))
  body.position.y = h / 2
  grp.add(body)
  const al: THREE.BufferGeometry[] = []
  const e = 0.09
  for (const sy of [0, 1])
    for (const sz of [-1, 1]) al.push(box(w + 0.02, e * 2, e * 2, 0, sy * h + (sy ? -e : e), (sz * d) / 2))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) al.push(box(e * 2, h, e * 2, (sx * w) / 2, h / 2, (sz * d) / 2))
  for (const sx of [-1, 1])
    for (const sy of [0, 1]) al.push(box(e * 2, e * 2, d, (sx * w) / 2, sy * h + (sy ? -e : e), 0))
  // the lid seam
  al.push(box(w + 0.03, 0.12, d + 0.03, 0, h - 0.8, 0))
  grp.add(mesh(merge(al), new THREE.MeshStandardMaterial({ color: '#8f8b84', metalness: 0.9, roughness: 0.52 }), false, true))
  const hw: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1])
    for (const sy of [0, 1])
      for (const sz of [-1, 1]) hw.push(new THREE.SphereGeometry(0.2, 12, 8).translate((sx * w) / 2, sy * h, (sz * d) / 2))
  for (const x of [-w * 0.3, w * 0.3]) hw.push(new RoundedBoxGeometry(0.5, 0.42, 0.1, 2, 0.04).translate(x, h - 0.8, d / 2 + 0.04))
  grp.add(mesh(merge(hw), M.corner, false, true))
  // stencil
  const st = tile(
    'band-stencil',
    256,
    96,
    (g, cw, ch) => {
      g.clearRect(0, 0, cw, ch)
      g.fillStyle = 'rgba(236,228,210,0.86)'
      g.font = FONT.mono(64, 800)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('G J P', cw / 2, ch / 2 + 4)
      // stencil bridges
      g.globalCompositeOperation = 'destination-out'
      g.fillStyle = '#000'
      for (const x of [0.28, 0.5, 0.72]) g.fillRect(cw * x - 1.5, ch * 0.44, 3, 8)
      const r = rng(3)
      for (let i = 0; i < 400; i++) g.fillRect(r() * cw, r() * ch, 1.5, 1.5)
    },
    { repeat: false },
  )
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshStandardMaterial({ map: st, transparent: true, roughness: 0.8, depthWrite: false }))
  sm.position.set(-w * 0.18, h * 0.36, d / 2 + 0.006)
  sm.receiveShadow = true
  grp.add(sm)
  return grp
}

const FM0 = 88
const FM1 = 108
/** the dial window: FM and AM scales on warm glass (decorative numbers only) */
function dialMap() {
  return tile(
    'band-dial',
    512,
    256,
    (g, w, h) => {
      const grad = g.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.62)
      grad.addColorStop(0, '#ffe4a8')
      grad.addColorStop(0.6, '#f0b85c')
      grad.addColorStop(1, '#a8621e')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.strokeStyle = '#3a1a08'
      g.fillStyle = '#3a1a08'
      g.lineWidth = 2
      const u0 = 0.1 * w
      const u1 = 0.9 * w
      // FM row
      const fy = h * 0.42
      g.beginPath()
      g.moveTo(u0, fy)
      g.lineTo(u1, fy)
      g.stroke()
      for (let f = FM0; f <= FM1; f += 1) {
        const x = u0 + ((f - FM0) / (FM1 - FM0)) * (u1 - u0)
        const big = f % 4 === 0
        g.lineWidth = big ? 2.4 : 1.2
        g.beginPath()
        g.moveTo(x, fy)
        g.lineTo(x, fy - (big ? 18 : 9))
        g.stroke()
        if (big) {
          g.font = FONT.mono(22, 600)
          g.textAlign = 'center'
          g.fillText(String(f), x, fy - 34)
        }
      }
      g.font = FONT.mono(18, 700)
      g.textAlign = 'left'
      g.fillText('FM', 10, fy - 30)
      g.textAlign = 'right'
      g.font = FONT.mono(13, 600)
      g.fillText('MHz', w - 10, fy - 30)
      // AM row
      const ay = h * 0.7
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(u0, ay)
      g.lineTo(u1, ay)
      g.stroke()
      const am = [55, 60, 70, 80, 100, 120, 140, 160]
      am.forEach((a, i) => {
        const x = u0 + (i / (am.length - 1)) * (u1 - u0)
        g.lineWidth = 1.6
        g.beginPath()
        g.moveTo(x, ay)
        g.lineTo(x, ay + 12)
        g.stroke()
        g.font = FONT.mono(18, 600)
        g.textAlign = 'center'
        g.fillText(String(a), x, ay + 32)
      })
      g.font = FONT.mono(18, 700)
      g.textAlign = 'left'
      g.fillText('AM', 10, ay + 32)
      // the maker's-plate spot, left blank; a warm vignette
      const v = g.createLinearGradient(0, 0, 0, h)
      v.addColorStop(0, 'rgba(90,40,10,0.35)')
      v.addColorStop(0.2, 'rgba(90,40,10,0)')
      v.addColorStop(0.85, 'rgba(90,40,10,0)')
      v.addColorStop(1, 'rgba(90,40,10,0.4)')
      g.fillStyle = v
      g.fillRect(0, 0, w, h)
    },
    { repeat: false },
  )
}

export interface Radio {
  group: THREE.Group
  /** 0..1 the dial lamp */
  setGlow(v: number): void
  /** tune the needle (MHz) */
  tune(mhz: number): void
  /** local-space centre of the dial (for a light) */
  dialAt: THREE.Vector3
}

/** a 1950s tabletop radio: veneered cabinet, cloth grille with brass bars, a glowing dial */
export function buildRadio(M: Mats): Radio {
  const grp = new THREE.Group()
  const w = 4.2
  const h = 2.5
  const d = 1.8
  const wood = new THREE.MeshPhysicalMaterial({ color: '#b0643a', map: mahoganyMap(), roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.22, specularIntensity: 0.6 })
  const cab = mesh(new RoundedBoxGeometry(w, h, d, 4, 0.34), wood)
  cab.position.y = h / 2 + 0.08
  grp.add(cab)
  const fz = d / 2 + 0.004
  const cy = h / 2 + 0.08
  // cloth grille, left
  const gGeo = new THREE.PlaneGeometry(1.9, 1.62)
  scaleUv(gGeo, 1.4, 1.2)
  const gm = mesh(gGeo, grille('wheat'), false, true)
  gm.position.set(-0.92, cy + 0.02, fz)
  grp.add(gm)
  const bars: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const y = cy - 0.62 + i * 0.31
    bars.push(rod(new THREE.Vector3(-1.87, y, fz + 0.03), new THREE.Vector3(0.03, y, fz + 0.03), 0.028, 6))
  }
  // dial bezel
  const bx = 1.12
  const by = cy + 0.34
  const bw = 1.62
  const bh = 0.98
  const B = (x: number, y: number) => new THREE.Vector3(bx + x, by + y, fz + 0.03)
  bars.push(rod(B(-bw / 2, -bh / 2), B(bw / 2, -bh / 2), 0.035, 6), rod(B(bw / 2, -bh / 2), B(bw / 2, bh / 2), 0.035, 6))
  bars.push(rod(B(bw / 2, bh / 2), B(-bw / 2, bh / 2), 0.035, 6), rod(B(-bw / 2, bh / 2), B(-bw / 2, -bh / 2), 0.035, 6))
  grp.add(mesh(merge(bars), M.brass, false, true))
  const dialMat = new THREE.MeshBasicMaterial({ map: dialMap(), toneMapped: false, color: '#ffffff' })
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.06, bh - 0.06), dialMat)
  dial.position.set(bx, by, fz + 0.01)
  grp.add(dial)
  // the needle
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, bh * 0.8, 0.01), new THREE.MeshBasicMaterial({ color: '#8a1a0a' }))
  needle.position.set(bx, by, fz + 0.025)
  grp.add(needle)
  // knobs (bakelite)
  const kn: THREE.BufferGeometry[] = []
  for (const x of [0.62, 1.62]) {
    kn.push(new THREE.CylinderGeometry(0.2, 0.23, 0.2, 20).rotateX(Math.PI / 2).translate(x, cy - 0.58, fz + 0.1))
  }
  const knobs = mesh(merge(kn), new THREE.MeshPhysicalMaterial({ color: '#3a1c0c', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.22, specularIntensity: 0.6 }), false, true)
  grp.add(knobs)
  const tuneKnob = new THREE.Group()
  tuneKnob.position.set(1.62, cy - 0.58, fz + 0.21)
  tuneKnob.add(mesh(box(0.05, 0.26, 0.03, 0, 0.06, 0), M.cream, false, false))
  grp.add(tuneKnob)
  // feet
  const ft: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ft.push(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 10).translate(sx * (w / 2 - 0.4), 0.05, sz * (d / 2 - 0.3)))
  grp.add(mesh(merge(ft), M.rubber, false, false))
  const base = new THREE.Color('#ffffff')
  return {
    group: grp,
    dialAt: new THREE.Vector3(bx, by, fz + 0.4),
    setGlow(v) {
      dialMat.color.copy(base).multiplyScalar(0.12 + 0.82 * v)
    },
    tune(mhz) {
      const u = 0.1 + (0.8 * (mhz - FM0)) / (FM1 - FM0)
      needle.position.x = bx - (bw - 0.06) / 2 + u * (bw - 0.06)
      tuneKnob.rotation.z = -(mhz - FM0) * 0.32
    },
  }
}

export interface OnAir {
  group: THREE.Group
  setLevel(v: number): void
  /** local-space front centre (for its light) */
  front: THREE.Vector3
}

/** an ON AIR lightbox: steel housing, red glass, the letters lit from behind (steady) */
export function buildOnAir(M: Mats): OnAir {
  const grp = new THREE.Group()
  const w = 3.0
  const h = 1.2
  const d = 0.62
  const housing = mesh(new RoundedBoxGeometry(w, h, d, 3, 0.12), new THREE.MeshStandardMaterial({ color: '#1a1816', metalness: 0.7, roughness: 0.35 }))
  housing.position.y = h / 2 + 0.3
  grp.add(housing)
  const face = tile(
    'band-onair',
    512,
    192,
    (g, cw, ch) => {
      const grad = g.createRadialGradient(cw / 2, ch / 2, 20, cw / 2, ch / 2, cw * 0.6)
      grad.addColorStop(0, '#c81e0c')
      grad.addColorStop(1, '#6a0c04')
      g.fillStyle = grad
      g.fillRect(0, 0, cw, ch)
      g.font = FONT.sans(118, 700)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.shadowColor = 'rgba(255,200,170,0.9)'
      g.shadowBlur = 18
      g.fillStyle = '#fff1e4'
      // letter-spaced by hand
      const word = 'ON AIR'
      const sp = 14
      let total = 0
      for (const c of word) total += g.measureText(c).width + sp
      total -= sp
      let x = cw / 2 - total / 2
      for (const c of word) {
        const cw2 = g.measureText(c).width
        g.fillText(c, x + cw2 / 2, ch / 2 + 6)
        x += cw2 + sp
      }
    },
    { repeat: false },
  )
  const faceMat = new THREE.MeshBasicMaterial({ map: face, toneMapped: false, color: '#ffffff' })
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.28), faceMat)
  fm.position.set(0, h / 2 + 0.3, d / 2 + 0.005)
  grp.add(fm)
  // feet
  const ft: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    ft.push(rod(new THREE.Vector3(sx * 0.95, 0.02, 0.2), new THREE.Vector3(sx * 0.95, 0.4, 0), 0.05, 8))
    ft.push(rod(new THREE.Vector3(sx * 0.95, 0.02, -0.3), new THREE.Vector3(sx * 0.95, 0.4, 0), 0.05, 8))
  }
  grp.add(mesh(merge(ft), M.stand, false, false))
  const base = new THREE.Color('#ffffff')
  return {
    group: grp,
    front: new THREE.Vector3(0, h / 2 + 0.3, d / 2 + 0.6),
    setLevel(v) {
      faceMat.color.copy(base).multiplyScalar(0.12 + 0.72 * v)
    },
  }
}

/** a clapperboard for the House Not Home video (decorative chalk; the stick open) */
export function buildClapper(M: Mats) {
  const grp = new THREE.Group()
  const w = 2.9
  const h = 2.3
  const slate = tile(
    'band-slate',
    512,
    406,
    (g, cw, ch) => {
      g.fillStyle = '#151413'
      g.fillRect(0, 0, cw, ch)
      const r = rng(61)
      // chalk dust
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(230,225,215,${0.015 + r() * 0.03})`
        g.beginPath()
        g.ellipse(r() * cw, r() * ch, 20 + r() * 60, 8 + r() * 20, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.strokeStyle = 'rgba(240,236,228,0.85)'
      g.lineWidth = 3
      const row = (y: number) => {
        g.beginPath()
        g.moveTo(14, y)
        g.lineTo(cw - 14, y)
        g.stroke()
      }
      const col = (x: number, y0: number, y1: number) => {
        g.beginPath()
        g.moveTo(x, y0)
        g.lineTo(x, y1)
        g.stroke()
      }
      row(128)
      row(262)
      col(cw / 3, 128, 262)
      col((cw * 2) / 3, 128, 262)
      col(cw / 2, 262, ch - 14)
      g.fillStyle = 'rgba(240,236,228,0.9)'
      g.font = FONT.mono(20, 700)
      g.textAlign = 'left'
      g.textBaseline = 'top'
      g.fillText('PROD.', 22, 22)
      g.fillText('ROLL', 22, 138)
      g.fillText('SCENE', cw / 3 + 10, 138)
      g.fillText('TAKE', (cw * 2) / 3 + 10, 138)
      g.fillText('DIRECTOR', 22, 272)
      g.fillText('CAMERA', cw / 2 + 10, 272)
      // chalk handwriting
      g.fillStyle = 'rgba(246,242,234,0.95)'
      g.font = FONT.script(58, 600)
      g.textBaseline = 'alphabetic'
      g.fillText('House Not Home', 100, 100)
      g.font = FONT.script(64, 600)
      g.textAlign = 'center'
      g.fillText('A1', cw / 6, 236)
      g.fillText('4', cw / 2, 236)
      g.fillText('1', (cw * 5) / 6, 236)
    },
    { repeat: false },
  )
  const stripes = tile(
    'band-stripes',
    256,
    32,
    (g, cw, ch) => {
      g.fillStyle = '#f1ede4'
      g.fillRect(0, 0, cw, ch)
      g.fillStyle = '#141312'
      for (let x = -ch; x < cw + ch; x += 42) {
        g.beginPath()
        g.moveTo(x, ch)
        g.lineTo(x + 21, ch)
        g.lineTo(x + 21 + ch, 0)
        g.lineTo(x + ch, 0)
        g.fill()
      }
    },
    { repeat: false },
  )
  const black = new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.7 })
  const board = mesh(new THREE.BoxGeometry(w, h, 0.06), [black, black, black, black, new THREE.MeshStandardMaterial({ map: slate, roughness: 0.85 }), black])
  board.position.y = h / 2
  grp.add(board)
  const stickMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 })
  const sticks = [black, black, black, black, stickMat, black]
  const lower = mesh(new THREE.BoxGeometry(w, 0.38, 0.08), sticks)
  lower.position.set(0, h + 0.19, 0)
  grp.add(lower)
  const hinge = new THREE.Group()
  hinge.position.set(-w / 2, h + 0.38, 0)
  const upper = mesh(new THREE.BoxGeometry(w, 0.38, 0.08), sticks)
  upper.position.set(w / 2, 0.19, 0.01)
  hinge.add(upper)
  hinge.rotation.z = 0.36
  grp.add(hinge)
  grp.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(-w / 2 + 0.08, h + 0.38, 0), M.chrome, false, false))
  return grp
}

/** a setlist taped to the floor (their own song titles, hand-written — decorative) */
export function setlist(titles: string[]) {
  const map = tile(
    'band-setlist',
    256,
    352,
    (g, w, h) => {
      g.fillStyle = '#efe3c6'
      g.fillRect(0, 0, w, h)
      const r = rng(71)
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(120,80,40,${0.02 + r() * 0.04})`
        g.beginPath()
        g.ellipse(r() * w, r() * h, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#20150e'
      g.font = FONT.script(44, 700)
      g.textAlign = 'left'
      g.textBaseline = 'alphabetic'
      g.fillText('GJP', 20, 50)
      g.font = FONT.script(30, 600)
      titles.forEach((t, i) => g.fillText(t, 22 + (i % 2) * 4, 96 + i * 32))
      // gaffer strips at the top corners
      g.fillStyle = '#26221e'
      g.save()
      g.translate(18, 8)
      g.rotate(-0.4)
      g.fillRect(-30, -10, 64, 22)
      g.restore()
      g.save()
      g.translate(w - 18, 8)
      g.rotate(0.4)
      g.fillRect(-34, -10, 64, 22)
      g.restore()
    },
    { repeat: false },
  )
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.9), new THREE.MeshStandardMaterial({ map, roughness: 0.9 }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  m.receiveShadow = true
  return m
}

/* ------------------------------------------------------------------ festoon */

const HALO_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uScale;
  uniform float uSize;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(2.0, uSize * uScale / max(0.5, -mv.z));
    vSeed = aSeed;
  }
`
const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  uniform float uTime;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float glow = exp(-r * r * 5.5) * 0.8 + exp(-r * r * 40.0) * 0.9;
    float flick = 0.95 + 0.05 * sin(uTime * 1.1 + vSeed * 40.0);
    float a = glow * (1.0 - smoothstep(0.85, 1.0, r));
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a * uLevel * flick, 1.0);
  }
`

export interface Festoon {
  group: THREE.Group
  update(time: number, calm: boolean, level: number, scale: number): void
}

/** strands of festoon bulbs hung in swags between anchor points (world) */
export function buildFestoon(strands: { a: THREE.Vector3; b: THREE.Vector3; sag: number; step: number }[], M: Mats): Festoon {
  const grp = new THREE.Group()
  const bulbs: THREE.Vector3[] = []
  const wires: THREE.BufferGeometry[] = []
  for (const s of strands) {
    const len = s.a.distanceTo(s.b)
    const n = Math.max(2, Math.round(len / s.step))
    const pts: THREE.Vector3[] = []
    const seg = n * 3
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const p = s.a.clone().lerp(s.b, t)
      p.y -= s.sag * 4 * t * (1 - t)
      pts.push(p)
    }
    wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg * 2, 0.025, 4, false))
    for (let i = 1; i < n; i++) {
      const t = i / n
      const p = s.a.clone().lerp(s.b, t)
      p.y -= s.sag * 4 * t * (1 - t) + 0.34
      bulbs.push(p)
    }
  }
  const wire = new THREE.Mesh(merge(wires), M.stand)
  grp.add(wire)
  // sockets + bulbs (instanced)
  const sockGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.26, 8).translate(0, 0.18, 0)
  const bulbGeo = new THREE.SphereGeometry(0.15, 12, 8)
  const sock = new THREE.InstancedMesh(sockGeo, new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.5 }), bulbs.length)
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb45e').multiplyScalar(3), toneMapped: false })
  const bulb = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length)
  const m4 = new THREE.Matrix4()
  bulbs.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z)
    sock.setMatrixAt(i, m4)
    bulb.setMatrixAt(i, m4)
  })
  grp.add(sock, bulb)
  // halos
  const pos = new Float32Array(bulbs.length * 3)
  const seed = new Float32Array(bulbs.length)
  const r = rng(5)
  bulbs.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3)
    seed[i] = r()
  })
  const hg = new THREE.BufferGeometry()
  hg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  hg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const uniforms = {
    uScale: { value: 400 },
    uSize: { value: 1.6 },
    uColor: { value: new THREE.Color('#ff9f45') },
    uLevel: { value: 1 },
    uTime: { value: 0 },
  }
  const halos = new THREE.Points(
    hg,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  halos.frustumCulled = false
  halos.renderOrder = 4
  grp.add(halos)
  const base = new THREE.Color('#ffb45e')
  return {
    group: grp,
    update(time, calm, level, scale) {
      if (!calm) uniforms.uTime.value = time
      uniforms.uLevel.value = level * 0.55
      uniforms.uScale.value = scale
      bulbMat.color.copy(base).multiplyScalar(0.3 + 2.4 * level)
    },
  }
}
