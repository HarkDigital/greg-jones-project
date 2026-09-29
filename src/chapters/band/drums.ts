import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rng } from '../../core/math'
import { FONT, tile } from '../../kit/materials'
import { grainMap, merge, mesh, rod } from './util'
import type { Mats } from './props'

/*
 * THE BAND · Tom Buckley's kit: a compact four-piece in an amber lacquer —
 * a 20" kick (its front head carries the GJP monogram), a 12" rack tom on the
 * kick, a 14" floor tom on legs, a 14" snare on its stand, hi-hats, a ride
 * and a crash (hammered brass), a throne and a kick pedal. Built round the
 * kit's own origin: the floor at y = 0, the audience toward +z, the drummer
 * toward -z. Units: 1 = 10 cm (1" = 0.254).
 */

const IN = 0.254

export interface Kit {
  group: THREE.Group
  /** the kick's front head (it gives a little when the kick is struck) */
  kickHead: THREE.Mesh
  /** the cymbals, for a gentle idle shimmer */
  cymbals: THREE.Object3D[]
  /** named points (kit-local) */
  at: { kick: THREE.Vector3; snare: THREE.Vector3; ride: THREE.Vector3; crash: THREE.Vector3; mouth: THREE.Vector3 }
}

function ringMap() {
  return tile('band-cymbal', 16, 256, (g, w, h) => {
    const r = rng(9)
    for (let y = 0; y < h; y++) {
      const v = 200 + (r() - 0.5) * 70 + 20 * Math.sin(y * 0.9)
      g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.8})`
      g.fillRect(0, y, w, 1)
    }
  })
}

function headMap() {
  return tile(
    'band-kickhead',
    512,
    512,
    (g, w, h) => {
      const c = w / 2
      const grad = g.createRadialGradient(c, c, 20, c, c, c)
      grad.addColorStop(0, '#efe6d2')
      grad.addColorStop(0.9, '#e4d8bd')
      grad.addColorStop(1, '#cdbd9c')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      // the coated surface: faint mottling
      const r = rng(13)
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(120,100,70,${0.012 + r() * 0.02})`
        g.beginPath()
        g.arc(r() * w, r() * h, 2 + r() * 10, 0, Math.PI * 2)
        g.fill()
      }
      // emblem: a thin double ring and the monogram
      g.strokeStyle = '#6a3418'
      g.lineWidth = 5
      g.beginPath()
      g.arc(c, c, 150, 0, Math.PI * 2)
      g.stroke()
      g.lineWidth = 2
      g.beginPath()
      g.arc(c, c, 138, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = '#3a160a'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.displayItalic(150, 640)
      g.fillText('GJP', c, c - 6)
      g.font = FONT.mono(19, 600)
      g.fillStyle = '#6a3418'
      const label = 'GREG JONES PROJECT'
      g.fillText(label.split('').join(' '), c, c + 82)
    },
    { repeat: false },
  )
}

interface DrumMats {
  shell: THREE.Material
  head: THREE.Material
  hoop: THREE.Material
  lug: THREE.Material
}

/** a drum with its axis +Y: batter head on top (+depth/2), resonant below */
function drum(M: DrumMats, r: number, depth: number, lugs: number, opts: { woodHoops?: boolean; front?: THREE.Material } = {}) {
  const g = new THREE.Group()
  const shell = mesh(new THREE.CylinderGeometry(r, r, depth, 48, 1, true), M.shell)
  ;(shell.material as THREE.Material).side = THREE.DoubleSide
  g.add(shell)
  const top = mesh(new THREE.CircleGeometry(r * 0.985, 48).rotateX(-Math.PI / 2).translate(0, depth / 2 + 0.012, 0), M.head, false, true)
  const bot = mesh(new THREE.CircleGeometry(r * 0.985, 48).rotateX(Math.PI / 2).translate(0, -depth / 2 - 0.012, 0), opts.front ?? M.head, false, true)
  g.add(top, bot)
  const hw: THREE.BufferGeometry[] = []
  const hoops: THREE.BufferGeometry[] = []
  for (const s of [1, -1]) {
    const y = (s * depth) / 2 + s * 0.02
    if (opts.woodHoops) {
      hoops.push(new THREE.CylinderGeometry(r + 0.07, r + 0.07, 0.3, 48, 1, true).translate(0, y - s * 0.06, 0))
      hoops.push(new THREE.RingGeometry(r * 0.98, r + 0.07, 48).rotateX((-s * Math.PI) / 2).translate(0, y + s * 0.09, 0))
    } else {
      hw.push(new THREE.TorusGeometry(r + 0.025, 0.04, 6, 48).rotateX(Math.PI / 2).translate(0, y, 0))
    }
  }
  // lugs (a pair of short tubes each side) and tension rods to the hoops
  for (let k = 0; k < lugs; k++) {
    const a = (k / lugs) * Math.PI * 2 + 0.2
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    for (const s of [1, -1]) {
      const yl = s * depth * 0.22
      hw.push(new RoundedBoxGeometry(0.12, Math.min(0.34, depth * 0.24), 0.1, 2, 0.04).rotateY(-a).translate(cx * (r + 0.05), yl, cz * (r + 0.05)))
      hw.push(rod(new THREE.Vector3(cx * (r + 0.07), (s * depth) / 2 + s * 0.04, cz * (r + 0.07)), new THREE.Vector3(cx * (r + 0.07), yl + s * 0.1, cz * (r + 0.07)), 0.018, 5))
    }
  }
  g.add(mesh(merge(hw), M.lug, false, true))
  if (hoops.length) g.add(mesh(merge(hoops), M.shell, false, true))
  return { group: g, top, bot }
}

/** a cymbal (hammered brass), dome up, centre at the origin */
function cymbalGeo(R: number) {
  const pts: THREE.Vector2[] = []
  const bellR = 0.24 * R
  const bellH = 0.09 * R + 0.06
  const drop = 0.06 * R
  const N = 26
  for (let i = 0; i <= N; i++) {
    const r = 0.06 + ((R - 0.06) * i) / N
    let y = bellH * (1 - THREE.MathUtils.smoothstep(r, bellR * 0.55, bellR))
    if (r > bellR) y -= drop * Math.pow((r - bellR) / (R - bellR), 1.3)
    pts.push(new THREE.Vector2(r, y))
  }
  return new THREE.LatheGeometry(pts, 48)
}

/** a tripod base with a vertical tube (chrome hardware) */
function tripod(out: THREE.BufferGeometry[], at: THREE.Vector3, top: number, spread = 1.7, yaw = 0) {
  const hub = new THREE.Vector3(at.x, 1.6, at.z)
  for (let k = 0; k < 3; k++) {
    const a = yaw + (k * Math.PI * 2) / 3
    out.push(rod(hub, new THREE.Vector3(at.x + Math.cos(a) * spread, 0.06, at.z + Math.sin(a) * spread), 0.05, 6))
    out.push(rod(hub.clone().setY(1.2), new THREE.Vector3(at.x + Math.cos(a) * spread * 0.55, 0.9, at.z + Math.sin(a) * spread * 0.55), 0.03, 5))
  }
  out.push(rod(new THREE.Vector3(at.x, 1.0, at.z), new THREE.Vector3(at.x, top * 0.6, at.z), 0.075, 8))
  out.push(rod(new THREE.Vector3(at.x, top * 0.6, at.z), new THREE.Vector3(at.x, top, at.z), 0.055, 8))
  out.push(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10).translate(at.x, top * 0.6, at.z))
}

export function buildKit(M: Mats, mobile: boolean): Kit {
  const group = new THREE.Group()
  const shell = new THREE.MeshPhysicalMaterial({
    color: '#8e4a20',
    map: grainMap('maple'),
    roughness: 0.4,
    // satin lacquer: a tight lamp on a glossy drum shell pins a line that blooms
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    specularIntensity: 0.5,
  })
  const head = new THREE.MeshStandardMaterial({ color: '#e9e0cc', roughness: 0.82 })
  const front = new THREE.MeshStandardMaterial({ color: '#ffffff', map: headMap(), roughness: 0.8 })
  const D: DrumMats = { shell, head, hoop: M.chrome, lug: M.chrome }
  const hw: THREE.BufferGeometry[] = []

  // the kick: axis along z, batter toward the drummer (-z), the front head toward the audience
  const kr = 10 * IN
  const kd = 16 * IN
  const kick = drum(D, kr, kd, mobile ? 8 : 10, { woodHoops: true, front })
  kick.group.rotation.x = -Math.PI / 2
  kick.group.position.set(0, kr + 0.14, 0)
  group.add(kick.group)
  // spurs and the pedal
  for (const s of [-1, 1]) {
    hw.push(rod(new THREE.Vector3(s * (kr - 0.1), kr * 0.55, kd * 0.22), new THREE.Vector3(s * (kr + 0.9), 0.05, kd * 0.5), 0.045, 6))
  }
  {
    const pz = -kd / 2 - 0.2
    hw.push(new RoundedBoxGeometry(0.9, 0.08, 2.4, 2, 0.03).rotateX(-0.2).translate(0, 0.35, pz - 1.3))
    hw.push(rod(new THREE.Vector3(-0.45, 0.1, pz), new THREE.Vector3(-0.45, 1.9, pz), 0.05, 6))
    hw.push(rod(new THREE.Vector3(0.45, 0.1, pz), new THREE.Vector3(0.45, 1.9, pz), 0.05, 6))
    hw.push(rod(new THREE.Vector3(0, 1.8, pz - 0.2), new THREE.Vector3(0, 3.6, pz - 0.1), 0.03, 6))
  }
  const beater = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 14).rotateZ(Math.PI / 2).translate(0, 3.7, -kd / 2 - 0.34), new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.9 }), false, false)
  group.add(beater)

  // snare: 14 × 5.5 on its stand, drummer's left
  const snareAt = new THREE.Vector3(2.3, 6.35, -3.2)
  const snare = drum({ ...D, shell }, 7 * IN, 5.5 * IN, mobile ? 8 : 10)
  snare.group.position.copy(snareAt)
  snare.group.rotation.set(-0.12, 0, -0.1)
  group.add(snare.group)
  tripod(hw, new THREE.Vector3(snareAt.x, 0, snareAt.z), snareAt.y - 0.7, 1.5, 0.4)
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.5
    hw.push(
      rod(
        new THREE.Vector3(snareAt.x, snareAt.y - 0.7, snareAt.z),
        new THREE.Vector3(snareAt.x + Math.cos(a) * 1.7, snareAt.y - 0.62, snareAt.z + Math.sin(a) * 1.7),
        0.035,
        5,
      ),
    )
  }

  // rack tom 12 × 8 on the kick, tilted toward the drummer
  const rackAt = new THREE.Vector3(0.9, kr * 2 + 1.55, -0.9)
  const rack = drum(D, 6 * IN, 8 * IN, 6)
  rack.group.position.copy(rackAt)
  rack.group.rotation.set(-0.36, 0, -0.14)
  group.add(rack.group)
  hw.push(rod(new THREE.Vector3(0.3, kr * 2 + 0.14, -0.3), new THREE.Vector3(0.55, kr * 2 + 1.1, -0.5), 0.06, 8))
  hw.push(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 10).translate(0.3, kr * 2 + 0.24, -0.3))

  // floor tom 14 × 14 on three legs, drummer's right
  const floorAt = new THREE.Vector3(-3.4, 4.4, -2.7)
  const floor = drum(D, 7 * IN, 14 * IN, mobile ? 8 : 10)
  floor.group.position.copy(floorAt)
  floor.group.rotation.set(-0.06, 0, 0.05)
  group.add(floor.group)
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.9
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    const top = new THREE.Vector3(floorAt.x + cx * (7 * IN + 0.12), floorAt.y + 0.8, floorAt.z + cz * (7 * IN + 0.12))
    hw.push(rod(top, new THREE.Vector3(floorAt.x + cx * (7 * IN + 0.55), 0.05, floorAt.z + cz * (7 * IN + 0.55)), 0.045, 6))
    hw.push(new RoundedBoxGeometry(0.2, 0.3, 0.2, 2, 0.05).translate(top.x, top.y, top.z))
  }

  // cymbals
  // hammered brass, satin: a tight lamp on a polished bow blooms into a hot streak
  const brass = new THREE.MeshStandardMaterial({ color: '#c49a52', map: ringMap(), metalness: 0.95, roughness: 0.55, side: THREE.DoubleSide })
  const cymbals: THREE.Object3D[] = []
  const addCym = (R: number, at: THREE.Vector3, tilt: THREE.Euler, flip = false) => {
    const c = new THREE.Mesh(cymbalGeo(R), brass)
    c.castShadow = true
    c.receiveShadow = true
    const holder = new THREE.Group()
    holder.position.copy(at)
    holder.rotation.copy(tilt)
    if (flip) c.rotation.x = Math.PI
    holder.add(c)
    group.add(holder)
    cymbals.push(holder)
    return holder
  }
  // hi-hats (a pair) on their stand, drummer's far left
  const hatAt = new THREE.Vector3(4.6, 8.9, -3.0)
  addCym(7 * IN, hatAt.clone().add(new THREE.Vector3(0, 0.26, 0)), new THREE.Euler(-0.05, 0, 0))
  addCym(7 * IN, hatAt, new THREE.Euler(-0.05, 0, 0), true)
  tripod(hw, new THREE.Vector3(hatAt.x, 0, hatAt.z), hatAt.y + 0.5, 1.4, 0.9)
  hw.push(new RoundedBoxGeometry(0.8, 0.06, 2.1, 2, 0.02).rotateX(-0.18).translate(hatAt.x - 0.2, 0.3, hatAt.z - 1.4))
  // ride, drummer's right
  const rideAt = new THREE.Vector3(-4.1, 9.7, -1.2)
  addCym(10 * IN, rideAt, new THREE.Euler(0.22, 0, 0.24))
  const rideBase = new THREE.Vector3(-5.2, 0, -2.2)
  tripod(hw, rideBase, 7.6, 1.8, 0.2)
  hw.push(rod(new THREE.Vector3(rideBase.x, 7.6, rideBase.z), rideAt.clone().add(new THREE.Vector3(0, -0.1, 0)), 0.045, 6))
  // crash, drummer's left, high
  const crashAt = new THREE.Vector3(3.2, 11.6, -0.6)
  addCym(8 * IN, crashAt, new THREE.Euler(0.3, 0, -0.3))
  const crashBase = new THREE.Vector3(4.4, 0, 0.4)
  tripod(hw, crashBase, 8.6, 1.8, 1.4)
  hw.push(rod(new THREE.Vector3(crashBase.x, 8.6, crashBase.z), crashAt.clone().add(new THREE.Vector3(0, -0.1, 0)), 0.045, 6))
  // felts/nuts on the cymbal rods
  for (const p of [hatAt.clone().add(new THREE.Vector3(0, 0.45, 0)), rideAt.clone().add(new THREE.Vector3(0, 0.26, 0)), crashAt.clone().add(new THREE.Vector3(0, 0.26, 0))])
    hw.push(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8).translate(p.x, p.y, p.z))

  // throne
  const thr = new THREE.Vector3(0, 0, -5.1)
  tripod(hw, thr, 4.6, 1.5, 0.5)
  const seat = mesh(
    new THREE.LatheGeometry(
      [new THREE.Vector2(0, 4.6), new THREE.Vector2(1.45, 4.6), new THREE.Vector2(1.55, 4.8), new THREE.Vector2(1.5, 5.15), new THREE.Vector2(1.1, 5.3), new THREE.Vector2(0, 5.34)],
      28,
    ),
    new THREE.MeshStandardMaterial({ color: '#1b1816', roughness: 0.55 }),
  )
  seat.position.set(thr.x, 0, thr.z)
  group.add(seat)

  group.add(mesh(merge(hw), M.chrome, true, true))

  return {
    group,
    kickHead: kick.bot,
    cymbals,
    at: {
      kick: new THREE.Vector3(0, kr + 0.14, kd / 2),
      snare: snareAt.clone(),
      ride: rideAt.clone(),
      crash: crashAt.clone(),
      mouth: new THREE.Vector3(0, 12.4, -5.0),
    },
  }
}
