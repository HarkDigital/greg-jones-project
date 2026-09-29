import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { chrome, glow, rubber, tile } from '../../kit/materials'

/*
 * THE PROJECTOR — a generic vintage 16 mm film projector (no maker's marks):
 * a warm taupe hammertone body on a black plinth, two reel arms rising from
 * the top with a feed reel in front and a take-up reel behind (pressed-steel
 * flanges with three windows, a pack of dark film between them), the film
 * path threading down the right side past the gate and two sprockets, a black
 * lens barrel with a knurled focus ring, and a round lamp house at the back
 * whose vent slits leak the lamp's warm light. It sits on a tall café table.
 *
 * Local space: +y up, the lens points toward -z (the screen), the film path
 * is on +x. Units: 1 = 10 cm. `lens` is the centre of the lens's front glass.
 */

export interface Projector {
  group: THREE.Group
  /** lens front centre, local */
  lens: THREE.Vector3
  /** reel angles (radians) and how much film is on the feed reel (1 full → 0 empty) */
  setReels(feedAngle: number, takeAngle: number, feedFill: number): void
  /** 0..1 lamp (vent glow, lens glass, pilot jewel) */
  setLamp(v: number): void
}

const BODY = '#5b4d42'

/** a pressed-steel reel flange: a disc with three windows, rings, a square hub hole (alpha) */
function flangeMap() {
  return tile(
    'watch-reel-flange',
    256,
    256,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = w / 2 - 2
      g.fillStyle = '#c9c3b8'
      g.beginPath()
      g.arc(cx, cy, R, 0, Math.PI * 2)
      g.fill()
      // pressed rings
      g.strokeStyle = 'rgba(60,50,40,0.35)'
      g.lineWidth = 2
      for (const r of [R - 6, R * 0.34, R * 0.2]) {
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.stroke()
      }
      // three windows (kidney shapes between the hub and the rim)
      g.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * Math.PI * 2 + 0.28
        const a1 = a0 + Math.PI * 2 * 0.24
        g.beginPath()
        g.arc(cx, cy, R * 0.82, a0, a1)
        g.arc(cx, cy, R * 0.42, a1, a0, true)
        g.closePath()
        g.fill()
      }
      // the square drive hole
      g.fillRect(cx - 7, cy - 7, 14, 14)
      g.globalCompositeOperation = 'source-over'
    },
    { repeat: false },
  )
}

/** the lamp house's vent band: warm slits on black (emissive) */
function ventMap() {
  return tile(
    'watch-vents',
    128,
    64,
    (g, w, h) => {
      g.fillStyle = '#000'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 8; i++) {
        const y = 8 + i * 6.2
        const grad = g.createLinearGradient(0, y, 0, y + 3)
        grad.addColorStop(0, '#5a2a08')
        grad.addColorStop(0.5, '#ffd9a0')
        grad.addColorStop(1, '#5a2a08')
        g.fillStyle = grad
        g.fillRect(0, y, w, 3)
      }
    },
    { repeat: true },
  )
}

export function buildProjector(): Projector {
  const group = new THREE.Group()
  group.name = 'projector'

  const paint = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.46, metalness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: '#171412', roughness: 0.5, metalness: 0.25 })
  const black = new THREE.MeshStandardMaterial({ color: '#0d0b0a', roughness: 0.38, metalness: 0.2 })
  const steel = chrome(0.22)
  const armMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.35, metalness: 0.6 })

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = cast
    m.receiveShadow = true
    group.add(m)
    return m
  }

  // ---- plinth + body
  add(new RoundedBoxGeometry(2.0, 0.32, 3.5, 2, 0.08), dark, 0, 0.16, 0)
  add(new RoundedBoxGeometry(1.72, 1.86, 3.1, 3, 0.16), paint, -0.04, 0.32 + 0.93, 0)
  // the film-path side plate (recessed, darker) and the gate block
  add(new RoundedBoxGeometry(0.08, 1.5, 2.6, 2, 0.03), black, 0.84, 1.28, -0.05, false)
  add(new RoundedBoxGeometry(0.22, 0.62, 0.5, 2, 0.05), steel, 0.9, 1.45, -1.05, false)
  // sprockets (upper and lower) on the side plate
  const sprGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20).rotateZ(Math.PI / 2)
  add(sprGeo, steel, 0.94, 1.78, -0.35, false)
  add(sprGeo, steel, 0.94, 0.78, -0.35, false)
  // knobs on the side and back
  const knobGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.12, 16)
  for (const [x, y, z, rx, rz] of [
    [0.94, 0.66, 0.9, 0, Math.PI / 2],
    [0.94, 0.66, 1.25, 0, Math.PI / 2],
    [-0.4, 0.75, 1.58, Math.PI / 2, 0],
    [0.1, 0.75, 1.58, Math.PI / 2, 0],
  ] as number[][]) {
    const k = add(knobGeo, black, x, y, z, false)
    k.rotation.set(rx, 0, rz)
  }
  // the pilot jewel on the back (steady warm glow, never blinks)
  const jewelMat = glow('#ffb45e', 2.5)
  add(new THREE.SphereGeometry(0.07, 12, 8), jewelMat, 0.52, 0.82, 1.56, false)

  // ---- the lens: a black barrel, a knurled focus ring, a chrome bezel, warm glass
  const LX = 0.42
  const LY = 1.42
  const barrel = new THREE.CylinderGeometry(0.27, 0.29, 1.15, 28).rotateX(Math.PI / 2)
  add(barrel, black, LX, LY, -1.55 - 0.575, false)
  const ring = new THREE.CylinderGeometry(0.33, 0.33, 0.34, 32).rotateX(Math.PI / 2)
  add(ring, dark, LX, LY, -1.95, false)
  const bezel = new THREE.TorusGeometry(0.27, 0.035, 8, 32)
  add(bezel, steel, LX, LY, -2.72, false)
  const glassMat = glow('#ffe6c0', 3)
  const glass = add(new THREE.CircleGeometry(0.25, 28), glassMat, LX, LY, -2.73, false)
  glass.rotation.y = Math.PI
  const lens = new THREE.Vector3(LX, LY, -2.74)

  // ---- the lamp house at the back left: a drum with glowing vent slits and a cap
  const drum = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 28, 1, true)
  add(drum, paint, -0.38, 2.18 + 0.6, 0.95)
  const ventTex = ventMap()
  const ventMat = new THREE.MeshStandardMaterial({
    color: '#0c0a09',
    roughness: 0.6,
    emissive: '#ffb266',
    emissiveMap: ventTex,
    emissiveIntensity: 1.6,
  })
  const vents = add(new THREE.CylinderGeometry(0.505, 0.505, 0.62, 28, 1, true), ventMat, -0.38, 2.9, 0.95, false)
  vents.rotation.y = 0.4
  add(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 28), dark, -0.38, 3.45, 0.95)
  add(new THREE.CylinderGeometry(0.3, 0.52, 0.14, 28), dark, -0.38, 3.56, 0.95)

  // ---- reel arms + reels (on the +x side)
  const ARM_X = 0.62
  const REEL_X = 0.98
  const REEL_R = 1.3
  const arms: [number, number, number, number][] = [
    // pivot z, tip y, tip z (the reel centre), lean
    [-0.55, 4.55, -1.55, 0],
    [0.55, 4.55, 1.55, 0],
  ]
  const armGeo = new RoundedBoxGeometry(0.16, 1, 0.24, 2, 0.05)
  const feed = new THREE.Group()
  const take = new THREE.Group()
  const flMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: flangeMap(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    metalness: 0.55,
    roughness: 0.4,
  })
  const flGeo = new THREE.CircleGeometry(REEL_R, 48).rotateY(Math.PI / 2)
  const filmMat = new THREE.MeshPhysicalMaterial({ color: '#2a1810', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 })
  const filmGeo = new THREE.CylinderGeometry(1, 1, 0.17, 48).rotateZ(Math.PI / 2)
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 16).rotateZ(Math.PI / 2)
  const packs: THREE.Mesh[] = []
  arms.forEach(([pz, ty, tz], i) => {
    const py = 2.18
    const dy = ty - py
    const dz = tz - pz
    const len = Math.hypot(dy, dz)
    const arm = add(armGeo, armMat, ARM_X, py + dy / 2, pz + dz / 2)
    arm.scale.y = len
    arm.rotation.x = Math.atan2(dz, dy)
    // the spindle
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10).rotateZ(Math.PI / 2), steel, ARM_X + 0.2, ty, tz, false)
    const reel = i === 0 ? feed : take
    reel.position.set(REEL_X, ty, tz)
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(flGeo, flMat)
      f.position.x = s * 0.11
      f.castShadow = true
      reel.add(f)
    }
    const pack = new THREE.Mesh(filmGeo, filmMat)
    pack.castShadow = true
    packs.push(pack)
    reel.add(pack, new THREE.Mesh(hubGeo, steel))
    group.add(reel)
  })

  // ---- the film threading: feed reel → upper sprocket → gate → lower sprocket → take-up reel
  const film = (pts: [number, number, number][]) => {
    const curve = new THREE.CatmullRomCurve3(
      pts.map(p => new THREE.Vector3(...p)),
      false,
      'centripetal',
    )
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.028, 5, false), filmMat)
    group.add(m)
    return m
  }
  film([
    [REEL_X, 4.55 - 1.0, -1.55 + 0.35],
    [REEL_X, 2.6, -0.8],
    [0.99, 1.98, -0.4],
    [0.99, 1.62, -0.72],
    [1.0, 1.45, -1.0],
    [0.99, 1.1, -0.72],
    [0.99, 0.62, -0.4],
  ])
  film([
    [0.99, 0.62, -0.25],
    [1.0, 0.7, 0.35],
    [REEL_X, 2.4, 0.95],
    [REEL_X, 4.55 - 0.6, 1.55 - 0.25],
  ])

  // ---- rubber feet (the front pair on a raised tilt foot)
  const footGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.12, 12)
  for (const [x, z] of [
    [-0.75, -1.45],
    [0.75, -1.45],
    [-0.75, 1.45],
    [0.75, 1.45],
  ])
    add(footGeo, rubber(), x, -0.04, z, false)

  let lamp = -1
  return {
    group,
    lens,
    setReels(feedAngle, takeAngle, feedFill) {
      feed.rotation.x = feedAngle
      take.rotation.x = takeAngle
      // film moves from the feed pack to the take-up pack (constant total area)
      const core = 0.34
      const total = 1.18 * 1.18 - core * core
      const fr = Math.sqrt(core * core + total * Math.min(1, Math.max(0, feedFill)))
      const tr = Math.sqrt(core * core + total * (1 - Math.min(1, Math.max(0, feedFill))) * 0.92 + 0.02)
      packs[0].scale.set(1, fr, fr)
      packs[1].scale.set(1, tr, tr)
    },
    setLamp(v) {
      if (Math.abs(v - lamp) < 1e-3) return
      lamp = v
      ventMat.emissiveIntensity = 0.3 + 1.5 * v
      glassMat.color.set('#ffe6c0').multiplyScalar(0.4 + 3.4 * v)
      jewelMat.color.set('#ffb45e').multiplyScalar(0.6 + 2 * v)
    },
  }
}

/** A tall round café table (the projector's stand): dark stained top, iron pedestal and base. Top at y = H. */
export function buildTable(H = 11): THREE.Group {
  const g = new THREE.Group()
  const wood = new THREE.MeshPhysicalMaterial({ color: '#3a1e10', roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.18 })
  const iron = new THREE.MeshStandardMaterial({ color: '#151210', roughness: 0.55, metalness: 0.5 })
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.4, 0.3, 48), wood)
  top.position.y = H - 0.15
  const edge = new THREE.Mesh(new THREE.TorusGeometry(2.43, 0.07, 8, 48).rotateX(Math.PI / 2), wood)
  edge.position.y = H - 0.15
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, H - 0.6, 16), iron)
  col.position.y = (H - 0.6) / 2 + 0.3
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.18, 24), iron)
  collar.position.y = H - 0.39
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 0.3, 32), iron)
  base.position.y = 0.15
  for (const m of [top, edge, col, collar, base]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  return g
}
