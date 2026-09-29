import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FONT, chrome, nickel, rubber, tile } from '../../kit/materials'
import { rng } from '../../core/math'
import { scaleUv } from '../../kit/stage'

/*
 * THE RIG — the props of Greg's solo-show setup (gregjonesproject.com/gear),
 * generic and faithful: no brand logos or trademark lettering anywhere.
 * Units: 1 = 10 cm. Every builder returns a group sitting on y = 0 (or its
 * own documented frame) so index.ts can place it.
 *
 *   guitarStand()   a black A-frame stand (cradle arms, a padded back yoke)
 *   sideTable()     a round tavern pedestal table with a worn, ring-stained top
 *   picks()         two plain celluloid picks: 1.0 mm and 1.14 mm
 *   stringPack()    a paper string envelope with a coiled string slipping out
 *   capo()          a trigger capo: a padded bar, a jaw, two squeeze handles
 *   harmonica()     a 10-hole diatonic: wooden comb, chrome covers
 *   cableCoil()     an over-under coil of instrument cable with its plugs
 *   micStand()      a tripod boom stand with a dynamic vocal mic in its clip
 *   paColumn()      a slim column line array on a power stand, and a bass module
 *   pedalboard()    a slanted board (the pedals themselves come from the kit)
 *   rug()           a faded kilim under the stool spot
 *
 * Canvas type is drawn with the kit's FONT (await fontsReady() first).
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const Y = V(0, 1, 0)

/* ------------------------------------------------------------ materials */

let _mats: ReturnType<typeof makeMats> | null = null
function makeMats() {
  return {
    powder: new THREE.MeshStandardMaterial({ color: '#171514', roughness: 0.46, metalness: 0.35 }),
    foam: new THREE.MeshStandardMaterial({ color: '#1d1a18', roughness: 0.95 }),
    rubber: rubber(),
    chrome: chrome(0.1),
    nickel: nickel(0.22),
    satin: new THREE.MeshStandardMaterial({ color: '#d8cfc2', roughness: 0.34, metalness: 1 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: '#111010', roughness: 0.62, metalness: 0.05 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#c99a5e', roughness: 0.3, metalness: 1 }),
  }
}
export const mats = () => (_mats ??= makeMats())

/* ------------------------------------------------------------ helpers */

/** a straight rod between two points */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, radial = 12, r2 = r) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r2, r, len, radial, 1)
  const m = new THREE.Mesh(g, mat)
  m.position.lerpVectors(a, b, 0.5)
  m.quaternion.setFromUnitVectors(Y, V().subVectors(b, a).normalize())
  return m
}

/** a smooth tube through points */
export function tube(points: THREE.Vector3[], r: number, mat: THREE.Material, seg = 0, radial = 10, tension: 'centripetal' | 'catmullrom' | 'chordal' = 'centripetal') {
  const curve = new THREE.CatmullRomCurve3(points, false, tension)
  const geo = new THREE.TubeGeometry(curve, seg || Math.max(20, points.length * 10), r, radial, false)
  return new THREE.Mesh(geo, mat)
}

/** A 2D strip (a polyline with thickness) as a closed Shape, for extruded metal plates. */
function stripShape(pts: THREE.Vector2[], t: number) {
  const n = pts.length
  const L: THREE.Vector2[] = []
  const R: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize()
    const nrm = new THREE.Vector2(-d.y, d.x).multiplyScalar(t / 2)
    L.push(pts[i].clone().add(nrm))
    R.push(pts[i].clone().sub(nrm))
  }
  const s = new THREE.Shape()
  s.moveTo(L[0].x, L[0].y)
  for (let i = 1; i < n; i++) s.lineTo(L[i].x, L[i].y)
  for (let i = n - 1; i >= 0; i--) s.lineTo(R[i].x, R[i].y)
  s.closePath()
  return s
}

/** sample a smooth 2D curve through control points */
function smooth2(pts: [number, number][], n = 24) {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  return c.getSpacedPoints(n)
}

function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse(c => {
    const m = c as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = cast
      m.receiveShadow = receive
    }
  })
  return o
}

/* ------------------------------------------------------------ 1/4" plug */

/**
 * A 1/4" instrument plug along +Y: the tip at y = 0, the sleeve, a nickel
 * barrel, a rubber strain-relief boot ending at y = 0.78 (the cable leaves there).
 */
export function jackPlug(): THREE.Group {
  const m = mats()
  const g = new THREE.Group()
  const metal = new THREE.LatheGeometry(
    [
      [0, 0],
      [0.02, 0.004],
      [0.027, 0.02],
      [0.02, 0.05],
      [0.03, 0.058],
      [0.03, 0.26],
      [0.034, 0.27],
      [0.058, 0.28],
      [0.058, 0.5],
      [0.052, 0.52],
      [0, 0.52],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  )
  g.add(new THREE.Mesh(metal, m.nickel))
  // the black insulator ring between tip and sleeve
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.022, 16), m.blackPlastic)
  ring.position.y = 0.07
  g.add(ring)
  const boot = new THREE.LatheGeometry(
    [
      [0, 0.5],
      [0.052, 0.5],
      [0.05, 0.62],
      [0.036, 0.78],
      [0, 0.78],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  )
  g.add(new THREE.Mesh(boot, m.rubber))
  return g
}

/* ------------------------------------------------------------ guitar stand */

/**
 * A black A-frame guitar stand. The guitar's tail rests in the two padded
 * cradle arms (tops at y = `cradle`, from z = -1.25 forward to z = 0.3, at
 * x = ±`span`); the padded yoke touches its back at (0, yokeY, yokeZ).
 */
export function guitarStand({ span = 0.92, cradle = 0.98, yokeY = 4.7, yokeZ = -1.42 } = {}) {
  const m = mats()
  const g = new THREE.Group()
  const r = 0.055
  for (const s of [-1, 1]) {
    const x = s * span
    // the side rail: from the front foot, up and back behind the guitar to the yoke
    const rail = tube(
      [V(x * 1.12, 0.06, 0.5), V(x * 1.06, 0.55, 0.05), V(x, cradle - 0.08, -0.7), V(x * 0.9, 2.8, -1.12), V(x * 0.78, yokeY, yokeZ - 0.12)],
      r,
      m.powder,
      48,
      10,
    )
    g.add(rail)
    // the cradle arm: forward under the body, an up-turned lip, foam sleeve
    const arm = tube([V(x, cradle - 0.08, -1.25), V(x, cradle - 0.1, -0.2), V(x, cradle - 0.07, 0.22), V(x, cradle + 0.25, 0.36)], r * 0.9, m.powder, 24, 10)
    g.add(arm)
    const foam = tube([V(x, cradle - 0.06, -0.95), V(x, cradle - 0.08, -0.2), V(x, cradle - 0.05, 0.2), V(x, cradle + 0.22, 0.34)], 0.085, m.foam, 20, 12)
    g.add(foam)
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), m.rubber)
    foot.scale.set(1, 0.6, 1.4)
    foot.position.set(x * 1.12, 0.06, 0.5)
    g.add(foot)
  }
  // the yoke: a padded crossbar behind the upper bout
  const yoke = rod(V(-span * 0.78 - 0.05, yokeY, yokeZ - 0.12), V(span * 0.78 + 0.05, yokeY, yokeZ - 0.12), r, m.powder)
  g.add(yoke)
  const pad = rod(V(-span * 0.62, yokeY, yokeZ - 0.06), V(span * 0.62, yokeY, yokeZ - 0.06), 0.09, m.foam, 14)
  g.add(pad)
  // the rear leg, hinged at the back of the rails
  const hinge = V(0, 2.8, -1.2)
  g.add(rod(V(-span * 0.9, 2.8, -1.12), V(span * 0.9, 2.8, -1.12), r * 0.85, m.powder))
  g.add(tube([hinge, V(0, 1.4, -2.3), V(0, 0.06, -3.2)], r, m.powder, 20))
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), m.rubber)
  back.scale.set(1.5, 0.6, 1)
  back.position.set(0, 0.06, -3.2)
  g.add(back)
  return shadow(g)
}

/* ------------------------------------------------------------ side table */

function tableTopMap() {
  return tile(
    'gear-tabletop',
    512,
    512,
    (g, w, h) => {
      const r = rng(71)
      // warm oiled oak, boards running across, worn paler in the middle
      g.fillStyle = '#6a4326'
      g.fillRect(0, 0, w, h)
      const boards = 5
      for (let b = 0; b < boards; b++) {
        const y0 = (b / boards) * h
        const tone = 0.85 + r() * 0.3
        g.fillStyle = `rgba(${Math.round(120 * tone)},${Math.round(78 * tone)},${Math.round(44 * tone)},0.55)`
        g.fillRect(0, y0, w, h / boards)
        for (let i = 0; i < 46; i++) {
          const y = y0 + r() * (h / boards)
          g.strokeStyle = r() > 0.4 ? `rgba(40,20,10,${0.1 + r() * 0.22})` : `rgba(170,120,70,${0.06 + r() * 0.1})`
          g.lineWidth = 0.6 + r() * 1.6
          g.beginPath()
          g.moveTo(0, y)
          for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.012 + i + b) * 2.2)
          g.stroke()
        }
        g.fillStyle = 'rgba(12,6,3,0.8)'
        g.fillRect(0, y0, w, 2)
      }
      // wear: the middle is paler and satin
      const wear = g.createRadialGradient(w * 0.5, h * 0.52, 20, w * 0.5, h * 0.5, w * 0.5)
      wear.addColorStop(0, 'rgba(200,150,95,0.16)')
      wear.addColorStop(1, 'rgba(0,0,0,0.18)')
      g.fillStyle = wear
      g.fillRect(0, 0, w, h)
      // a ring stain from a glass, and a second faint one
      for (const [x, y, rr, a] of [
        [w * 0.73, h * 0.3, 34, 0.26],
        [w * 0.66, h * 0.36, 30, 0.12],
      ]) {
        g.strokeStyle = `rgba(30,14,6,${a})`
        g.lineWidth = 3
        g.beginPath()
        g.arc(x, y, rr, 0.3, Math.PI * 2 - 0.2)
        g.stroke()
      }
      // nicks and scratches
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `rgba(${r() > 0.5 ? '210,170,120' : '20,10,5'},${0.06 + r() * 0.1})`
        g.lineWidth = 0.5 + r()
        const x = r() * w
        const y = r() * h
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 10)
        g.stroke()
      }
    },
    { repeat: false },
  )
}

/** A round pedestal table; the top surface is at y = `height`. */
export function sideTable({ radius = 2.35, height = 7.4 } = {}) {
  const g = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5234', roughness: 0.5, metalness: 0 })
  const topMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tableTopMap(), roughness: 0.42, metalness: 0 })
  // the top face (textured disc) and its rounded edge (a lathe)
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.04, 72).rotateX(-Math.PI / 2), topMat)
  face.position.y = height
  face.receiveShadow = true
  g.add(face)
  const edge = new THREE.LatheGeometry(
    [
      [radius - 0.05, height],
      [radius - 0.01, height - 0.02],
      [radius, height - 0.06],
      [radius - 0.01, height - 0.13],
      [radius - 0.06, height - 0.18],
      [radius - 0.5, height - 0.19],
      [0.3, height - 0.2],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    72,
  )
  const edgeM = new THREE.Mesh(edge, wood)
  g.add(edgeM)
  // the turned pedestal
  const col = new THREE.LatheGeometry(
    [
      [0.001, 0.62],
      [0.62, 0.62],
      [0.52, 0.8],
      [0.3, 1.0],
      [0.26, 1.6],
      [0.34, 2.3],
      [0.24, 2.9],
      [0.2, 5.6],
      [0.3, 6.2],
      [0.24, 6.5],
      [0.34, 6.9],
      [0.52, height - 0.2],
      [0.001, height - 0.2],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  )
  g.add(new THREE.Mesh(col, wood))
  // a cross of four splayed feet
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const foot = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.34, 0.36, 2, 0.08), wood)
    foot.position.set(Math.cos(a) * 0.95, 0.28, Math.sin(a) * 0.95)
    foot.rotation.y = -a
    foot.rotation.z = 0.12
    g.add(foot)
  }
  shadow(g)
  face.castShadow = false
  return g
}

/* ------------------------------------------------------------ picks */

function pickMap(key: string, color: string, label: string) {
  return tile(
    `gear-pick-${key}`,
    128,
    128,
    (g, w, h) => {
      g.fillStyle = color
      g.fillRect(0, 0, w, h)
      // a matte, faintly mottled surface
      const r = rng(key.length * 13)
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.04})`
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
      }
      // the gauge, stamped near the tip (no logo)
      g.fillStyle = 'rgba(245,238,225,0.85)'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.mono(15, 600)
      g.fillText(label, w / 2, h * 0.62)
    },
    { repeat: false },
  )
}

/** The pick outline (a rounded triangle, tip toward -y), 0.27 wide, 0.3 tall. */
function pickShape() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.15)
  s.bezierCurveTo(0.05, -0.13, 0.13, -0.02, 0.135, 0.06)
  s.bezierCurveTo(0.138, 0.13, 0.07, 0.155, 0, 0.155)
  s.bezierCurveTo(-0.07, 0.155, -0.138, 0.13, -0.135, 0.06)
  s.bezierCurveTo(-0.13, -0.02, -0.05, -0.13, 0, -0.15)
  return s
}

/** Two plain picks (1.0 mm blue, 1.14 mm purple), lying flat; the group sits on y = 0. */
export function picks() {
  const g = new THREE.Group()
  const list: THREE.Mesh[] = []
  const defs = [
    { key: '100', color: '#4f82ec', label: '1.0mm', t: 0.01, at: V(-0.1, 0, 0.02), rot: 0.35, tilt: 0 },
    { key: '114', color: '#9160e0', label: '1.14mm', t: 0.0114, at: V(0.13, 0.012, -0.05), rot: -0.5, tilt: 0.09 },
  ]
  for (const d of defs) {
    const geo = new THREE.ExtrudeGeometry(pickShape(), { depth: d.t, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.004, bevelSegments: 2, curveSegments: 16 })
    // cap UVs: the shape's own xy → 0..1 across the pick
    const uv = geo.attributes.uv
    const p = geo.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 0.15) / 0.3, (p.getY(i) + 0.16) / 0.32)
    geo.rotateX(-Math.PI / 2)
    const face = new THREE.MeshStandardMaterial({ color: '#ffffff', map: pickMap(d.key, d.color, d.label), roughness: 0.62 })
    const side = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.55 })
    const m = new THREE.Mesh(geo, [face, side])
    m.position.copy(d.at)
    m.position.y += 0.003
    m.rotation.y = d.rot
    m.rotation.z = d.tilt
    m.receiveShadow = true
    g.add(m)
    list.push(m)
  }
  return g
}

/* ------------------------------------------------------------ strings */

function envelopeMap() {
  return tile(
    'gear-envelope',
    256,
    256,
    (g, w, h) => {
      // cream paper stock, a faint fibre, a printed border in sapele ink
      g.fillStyle = '#c9ab7c'
      g.fillRect(0, 0, w, h)
      const r = rng(5)
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(120,90,50,${0.03 + r() * 0.05})`
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 0.6)
      }
      const ink = '#6e2e18'
      g.strokeStyle = ink
      g.lineWidth = 3
      g.strokeRect(14, 14, w - 28, h - 28)
      g.lineWidth = 1
      g.strokeRect(20, 20, w - 40, h - 40)
      // the flap's fold line
      g.strokeStyle = 'rgba(90,60,30,0.35)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(20, 20)
      g.lineTo(w / 2, 86)
      g.lineTo(w - 20, 20)
      g.stroke()
      g.fillStyle = ink
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.mono(13, 600)
      g.fillText('A C O U S T I C', w / 2, 112)
      g.font = FONT.display(64, 700)
      g.fillText('.013', w / 2, 160)
      g.font = FONT.mono(12, 600)
      g.fillText('G A U G E', w / 2, 204)
      // a little hand-drawn star either side
      g.font = FONT.script(26, 600)
      g.fillText('✶', w * 0.2, 160)
      g.fillText('✶', w * 0.8, 160)
    },
    { repeat: false },
  )
}

/** A paper string envelope (1.25 square) with a coiled string slipping out; sits on y = 0. */
export function stringPack() {
  const m = mats()
  const g = new THREE.Group()
  const W = 1.25
  const paper = new THREE.MeshStandardMaterial({ color: '#ffffff', map: envelopeMap(), roughness: 0.82 })
  const edge = new THREE.MeshStandardMaterial({ color: '#b89a6c', roughness: 0.85 })
  // a second envelope underneath, turned a little (the pack)
  const under = new THREE.Mesh(new THREE.BoxGeometry(W, 0.018, W), [edge, edge, paper, edge, edge, edge])
  under.position.set(0.12, 0.009, -0.1)
  under.rotation.y = 0.28
  g.add(under)
  const env = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, W), [edge, edge, paper, edge, edge, edge])
  env.position.y = 0.028
  g.add(env)
  // the coiled string: loops of bronze wire half out of the envelope's open side
  const coil = new THREE.Group()
  const loops = 6
  for (let i = 0; i < loops; i++) {
    const rr = 0.36 + i * 0.006
    const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0075, 6, 72), m.bronze)
    t.rotation.x = -Math.PI / 2
    t.position.set(i * 0.004, 0.012 + i * 0.006, i * 0.003)
    coil.add(t)
  }
  // the ball end and the free tail curling away
  const tail = tube([V(0.36, 0.05, 0), V(0.52, 0.045, 0.12), V(0.62, 0.035, 0.34), V(0.58, 0.03, 0.52)], 0.0075, m.bronze, 24, 6)
  coil.add(tail)
  const ball = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), m.bronze)
  ball.position.set(0.58, 0.03, 0.54)
  ball.rotation.x = Math.PI / 2
  coil.add(ball)
  coil.position.set(0.2, 0.04, 0.55)
  g.add(coil)
  shadow(g, true, true)
  return g
}

/* ------------------------------------------------------------ capo */

export interface Capo {
  group: THREE.Group
  /** the bar's swing about the pivot, radians: 0 clamped on the neck, < 0 squeezed open, > 0 closed tighter */
  setAngle(a: number): void
}

/**
 * A trigger capo, built in the guitar NECK's frame: the neck runs along +x,
 * +y is across the board toward the bass side, +z is up off the board. The
 * padded bar sits across the strings at z ≈ `padZ`; the jaw wraps under the
 * neck to `backZ`; the pivot and the two squeeze handles stick out on the
 * bass side. `setAngle` swings the bar about the pivot (negative = open).
 */
export function capo({ padZ = 0.1, backZ = -0.33, halfW = 0.3 } = {}): Capo {
  const m = mats()
  const metal = new THREE.MeshStandardMaterial({ color: '#cfc8bd', roughness: 0.36, metalness: 1 })
  const group = new THREE.Group()
  const pivot = new THREE.Vector2(halfW + 0.15, (padZ + backZ) / 2 + 0.01)
  const depth = 0.13
  const ex = (s: THREE.Shape, d = depth) => {
    const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6, steps: 1 })
    geo.translate(0, 0, -d / 2)
    // shape space (u = across, v = up) → neck frame: x along the neck, y across, z up
    geo.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0)))
    return geo
  }
  const strip = (pts: [number, number][], t: number, d = depth) => new THREE.Mesh(ex(stripShape(smooth2(pts, 36).map(p => p.sub(pivot)), t), d), metal)
  // the top arm (pivots): the bar across the strings, bent down round the bass
  // edge to the pivot, and past it the upper wing, flaring out and up
  const top = new THREE.Group()
  const barZ = padZ + 0.075
  top.add(
    strip(
      [
        [-halfW - 0.05, barZ],
        [0, barZ + 0.004],
        [halfW - 0.02, barZ],
        [halfW + 0.1, barZ - 0.03],
        [pivot.x + 0.01, barZ - 0.12],
        [pivot.x, pivot.y],
      ],
      0.05,
    ),
  )
  top.add(
    strip(
      [
        [pivot.x, pivot.y],
        [pivot.x + 0.16, pivot.y + 0.08],
        [pivot.x + 0.34, pivot.y + 0.19],
        [pivot.x + 0.46, pivot.y + 0.27],
      ],
      0.045,
      depth * 1.25,
    ),
  )
  // the rubber pad under the bar
  const pad = new THREE.Mesh(new RoundedBoxGeometry(depth * 0.9, halfW * 2 + 0.05, 0.035, 2, 0.012), m.rubber)
  pad.position.set(0, -pivot.x - 0.005, padZ + 0.03 - pivot.y)
  top.add(pad)
  top.position.set(0, pivot.x, pivot.y)
  group.add(top)
  // the fixed jaw: from the pivot round the bass edge and under the neck, and the lower wing
  const jaw = new THREE.Group()
  jaw.add(
    strip(
      [
        [pivot.x, pivot.y],
        [halfW + 0.07, backZ + 0.07],
        [halfW - 0.1, backZ - 0.045],
        [0, backZ - 0.07],
        [-halfW + 0.06, backZ - 0.04],
      ],
      0.05,
    ),
  )
  jaw.add(
    strip(
      [
        [pivot.x, pivot.y],
        [pivot.x + 0.16, pivot.y - 0.1],
        [pivot.x + 0.32, pivot.y - 0.24],
        [pivot.x + 0.42, pivot.y - 0.34],
      ],
      0.045,
      depth * 1.25,
    ),
  )
  jaw.position.set(0, pivot.x, pivot.y)
  group.add(jaw)
  const backPad = new THREE.Mesh(new RoundedBoxGeometry(depth * 0.9, 0.26, 0.045, 2, 0.014), m.rubber)
  backPad.position.set(0, -0.01, backZ - 0.022)
  group.add(backPad)
  // the pivot pin and a coil of spring
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, depth * 1.4, 14).rotateZ(Math.PI / 2), m.chrome)
  pin.position.set(0, pivot.x, pivot.y)
  group.add(pin)
  for (const s of [-1, 1]) {
    const spring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 18), m.chrome)
    spring.rotation.y = Math.PI / 2
    spring.position.set(s * 0.045, pivot.x, pivot.y)
    group.add(spring)
  }
  shadow(group, true, true)
  return {
    group,
    setAngle(a) {
      // squeeze: the bar swings up off the strings about the pivot (the upper wing comes down)
      top.rotation.x = a
    },
  }
}

/* ------------------------------------------------------------ harmonica */

function harpFrontMap() {
  return tile(
    'gear-harp-front',
    256,
    32,
    (g, w, h) => {
      g.fillStyle = '#a0683a'
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(60,30,12,0.25)'
      for (let x = 0; x < w; x += 5) g.fillRect(x, 0, 1, h)
      // ten square holes
      const cell = w / 10.6
      for (let i = 0; i < 10; i++) {
        const x = (0.3 + i) * cell + cell * 0.18
        g.fillStyle = '#120a06'
        g.fillRect(x, h * 0.18, cell * 0.64, h * 0.64)
      }
    },
    { repeat: false },
  )
}
function harpTopMap() {
  return tile(
    'gear-harp-top',
    512,
    128,
    (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h)
      gr.addColorStop(0, '#e8e6e2')
      gr.addColorStop(0.5, '#c9c6c0')
      gr.addColorStop(1, '#eeece8')
      g.fillStyle = gr
      g.fillRect(0, 0, w, h)
      // brushed
      const r = rng(9)
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '90,90,90'},${0.05 + r() * 0.06})`
        g.fillRect(0, r() * h, w, 0.7)
      }
      // hole numbers engraved along the front edge
      g.fillStyle = 'rgba(40,36,32,0.8)'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.sans(22, 600)
      const cell = w / 10.6
      for (let i = 0; i < 10; i++) g.fillText(String(i + 1), (0.3 + i + 0.5) * cell, h * 0.78)
      // an engraved border line
      g.strokeStyle = 'rgba(40,36,32,0.45)'
      g.lineWidth = 2
      g.strokeRect(10, 10, w - 20, h * 0.5)
    },
    { repeat: false },
  )
}

/** A 10-hole diatonic (1.02 long), lying flat, holes toward +z; sits on y = 0. */
export function harmonica() {
  const m = mats()
  const g = new THREE.Group()
  const L = 1.02
  const D = 0.27
  const comb = new THREE.MeshStandardMaterial({ color: '#b07448', roughness: 0.55 })
  const front = new THREE.MeshStandardMaterial({ color: '#ffffff', map: harpFrontMap(), roughness: 0.55 })
  const brass = new THREE.MeshStandardMaterial({ color: '#c8a060', roughness: 0.3, metalness: 1 })
  const cover = new THREE.MeshStandardMaterial({ color: '#d6d1c8', map: harpTopMap(), roughness: 0.44, metalness: 0.5 })
  const combM = new THREE.Mesh(new THREE.BoxGeometry(L - 0.04, 0.078, D - 0.01), [comb, comb, comb, comb, front, comb])
  combM.position.y = 0.11
  g.add(combM)
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(L - 0.03, 0.012, D - 0.02), brass)
    plate.position.y = 0.11 + s * 0.045
    g.add(plate)
    // the cover plates: a rounded shell over each reed plate
    const c = new THREE.Mesh(new RoundedBoxGeometry(L, 0.055, D, 3, 0.022), [cover, cover, cover, cover, cover, cover])
    c.position.y = 0.11 + s * 0.078
    g.add(c)
  }
  shadow(g, true, true)
  return g
}

/* ------------------------------------------------------------ cable coil */

/** An over-under coil of instrument cable lying flat, one plug trailing out; sits on y = 0. */
export function cableCoil({ radius = 0.78, loops = 6 } = {}) {
  const m = mats()
  const g = new THREE.Group()
  const r = 0.032
  const pts: THREE.Vector3[] = []
  const rand = rng(33)
  const offs = Array.from({ length: loops + 1 }, () => [(rand() - 0.5) * 0.12, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.08])
  const N = loops * 28
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = t * loops * Math.PI * 2
    const li = Math.min(loops - 1, Math.floor(t * loops))
    const f = t * loops - li
    const o0 = offs[li]
    const o1 = offs[li + 1]
    const ox = o0[0] + (o1[0] - o0[0]) * f
    const oz = o0[1] + (o1[1] - o0[1]) * f
    const rr = radius * (1 + o0[2] + (o1[2] - o0[2]) * f) * (1 + 0.1 * Math.sin(a * 0.5 + li))
    // loops stack: each over the last, a little higher in the middle of the pile
    const y = r + 0.012 + li * 0.014 + 0.02 * Math.sin(a + li * 1.7) * 0.5
    pts.push(V(Math.cos(a) * rr * 1.06 + ox, y, Math.sin(a) * rr + oz))
  }
  // the two ends: the start tucked, the end trailing out to a plug
  const end = pts[pts.length - 1]
  pts.push(V(end.x + 0.3, r + 0.01, end.z + 0.22), V(end.x + 0.62, r, end.z + 0.52))
  const cab = tube(pts, r, m.rubber, pts.length * 3, 8, 'catmullrom')
  g.add(cab)
  const plug = jackPlug()
  plug.quaternion.setFromUnitVectors(V(0, -1, 0), V(0.62 - 0.3, 0, 0.52 - 0.22).normalize())
  // the boot end (y = 0.78) meets the cable end
  const dir = V(0.32, 0, 0.3).normalize()
  plug.position.copy(pts[pts.length - 1]).addScaledVector(dir, 0.78)
  plug.position.y = 0.058
  g.add(plug)
  const plug2 = jackPlug()
  const s = pts[0]
  plug2.quaternion.setFromUnitVectors(V(0, -1, 0), V(-0.2, 0, -1).normalize())
  plug2.position.set(s.x - 0.12, 0.058, s.z - 0.7)
  g.add(plug2)
  g.add(tube([V(s.x - 0.1, r, s.z - 0.02), V(s.x - 0.12, r, s.z - 0.2), plug2.position.clone().add(V(0.015, 0, 0.08))], r, m.rubber, 12, 8))
  shadow(g, true, true)
  return g
}

/* ------------------------------------------------------------ mic + boom stand */

function meshMap() {
  return tile('gear-mesh', 128, 128, (g, w, h) => {
    g.fillStyle = '#1b1c1e'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#b9bcc2'
    g.lineWidth = 2.2
    const n = 8
    for (let i = -n; i <= n * 2; i++) {
      const x = (i / n) * w
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + w, h)
      g.stroke()
      g.beginPath()
      g.moveTo(x, h)
      g.lineTo(x + w, 0)
      g.stroke()
    }
  })
}

export interface MicStand {
  group: THREE.Group
  /** world-space-in-group: centre of the mic's grille ball */
  grille: THREE.Vector3
  /** the mic's axis (toward the grille) */
  axis: THREE.Vector3
}

/**
 * A tripod boom stand: the base at the origin, the pole up to `poleH`, the
 * boom through the clutch toward `micAt`, a dynamic vocal mic in its clip
 * pointing along `aim` (from the tail toward the grille).
 */
export function micStand({ poleH = 9.2, micAt = V(-1.6, 14.4, 1.7), aim = V(-0.28, 0.14, -0.95), legTurn = 0.35 } = {}): MicStand {
  const m = mats()
  const g = new THREE.Group()
  const hub = V(0, 1.25, 0)
  // tripod legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + legTurn
    const foot = V(Math.cos(a) * 1.7, 0.07, Math.sin(a) * 1.7)
    g.add(rod(hub, foot, 0.05, m.powder, 10))
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.rubber)
    f.scale.set(1.2, 0.6, 1.2)
    f.position.copy(foot)
    g.add(f)
  }
  g.add(rod(V(0, 1.0, 0), V(0, 1.55, 0), 0.12, m.powder, 16))
  // the pole: outer tube, clutch, inner tube
  g.add(rod(V(0, 1.0, 0), V(0, 5.6, 0), 0.085, m.powder, 16))
  const clutch = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 16), m.blackPlastic)
  clutch.position.set(0, 5.7, 0)
  g.add(clutch)
  g.add(rod(V(0, 5.6, 0), V(0, poleH, 0), 0.065, m.powder, 14))
  // the boom clutch and the arm
  const top = V(0, poleH + 0.12, 0)
  const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 16).rotateZ(Math.PI / 2), m.blackPlastic)
  bc.position.copy(top)
  const boomDir = V().subVectors(micAt, top).normalize()
  bc.quaternion.setFromUnitVectors(V(1, 0, 0), V(boomDir.z, 0, -boomDir.x).normalize())
  g.add(bc)
  const tail = top.clone().addScaledVector(boomDir, -2.4)
  const clipAt = micAt.clone()
  g.add(rod(tail, clipAt.clone().addScaledVector(boomDir, -0.12), 0.05, m.powder, 12))
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 18), m.powder)
  cw.position.copy(tail).addScaledVector(boomDir, 0.2)
  cw.quaternion.setFromUnitVectors(Y, boomDir)
  g.add(cw)
  // the mic, in its clip: a lathe along +y (tail at y = 0, grille ball on top)
  const A = aim.clone().normalize()
  const mic = new THREE.Group()
  const handleMat = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.42, metalness: 0.55 })
  const handle = new THREE.LatheGeometry(
    [
      [0.001, 0],
      [0.12, 0],
      [0.14, 0.05],
      [0.15, 0.3],
      [0.19, 0.9],
      [0.23, 1.04],
      [0.001, 1.04],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  )
  mic.add(new THREE.Mesh(handle, handleMat))
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.24, 0.1, 32), m.chrome)
  band.position.y = 1.08
  mic.add(band)
  const gm = new THREE.MeshStandardMaterial({ color: '#ffffff', map: meshMap(), roughness: 0.4, metalness: 0.7 })
  const grilleGeo = new THREE.SphereGeometry(0.29, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62)
  const ball = new THREE.Mesh(grilleGeo, gm)
  ball.position.y = 1.24
  mic.add(ball)
  const grilleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.255, 0.1, 32, 1, true), gm)
  grilleBase.position.y = 1.13
  mic.add(grilleBase)
  // the XLR end
  const xlr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 18), m.nickel)
  xlr.position.y = -0.08
  mic.add(xlr)
  const xlrBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.36, 14), m.rubber)
  xlrBoot.position.y = -0.36
  mic.add(xlrBoot)
  // the clip: a C-ring round the handle and a swivel to the boom
  const clip = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 24, Math.PI * 1.6), m.blackPlastic)
  clip.rotation.x = Math.PI / 2
  clip.rotation.z = -Math.PI * 0.3
  clip.position.y = 0.55
  mic.add(clip)
  mic.quaternion.setFromUnitVectors(Y, A)
  // hang it so the clip (mic y = 0.55) sits at micAt
  mic.position.copy(micAt).addScaledVector(A, -0.55)
  g.add(mic)
  const swivel = rod(micAt.clone().addScaledVector(boomDir, -0.14), micAt.clone().add(V(0, -0.02, 0)), 0.045, m.blackPlastic)
  g.add(swivel)
  // the XLR cable: out of the tail, along under the boom, down the pole, to the floor
  const micTail = mic.position.clone().addScaledVector(A, -0.55)
  const cablePts = [
    micTail,
    micTail.clone().addScaledVector(A, -0.3).add(V(0, -0.2, 0)),
    V().lerpVectors(clipAt, top, 0.5).add(V(0, -0.14, 0)),
    top.clone().add(V(0.12, -0.3, 0.05)),
    V(0.1, 7.6, 0.08),
    V(0.1, 5.9, 0.1),
    V(0.12, 3.4, 0.12),
    V(0.2, 1.3, 0.25),
    V(0.3, 0.04, -0.5),
    V(0.9, 0.035, -1.6),
  ]
  g.add(tube(cablePts, 0.04, m.rubber, 90, 8))
  shadow(g, true, true)
  const grille = mic.position.clone().addScaledVector(A, 1.24)
  return { group: g, grille, axis: A }
}

/* ------------------------------------------------------------ PA */

function perfMap() {
  return tile('gear-perf', 64, 64, (g, w, h) => {
    g.fillStyle = '#4a4744'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#0a0909'
    const n = 8
    for (let y = 0; y < n; y++)
      for (let x = 0; x <= n; x++) {
        const cx = ((x + (y % 2) * 0.5) / n) * w
        const cy = ((y + 0.5) / n) * h
        g.beginPath()
        g.arc(cx, cy, 2.3, 0, Math.PI * 2)
        g.fill()
      }
  })
}
function arrayMap() {
  // the articulated array's face: perforated metal over twelve small drivers
  return tile(
    'gear-array',
    64,
    512,
    (g, w, h) => {
      g.fillStyle = '#403d3a'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 12; i++) {
        const cy = ((i + 0.5) / 12) * h
        const cx = w / 2 + (i % 2 ? 4 : -4)
        const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 18)
        gr.addColorStop(0, '#6a6560')
        gr.addColorStop(0.55, '#1c1a19')
        gr.addColorStop(0.8, '#55504b')
        gr.addColorStop(1, '#403d3a')
        g.fillStyle = gr
        g.beginPath()
        g.arc(cx, cy, 18, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = 'rgba(0,0,0,0.75)'
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 17; x++) {
          g.beginPath()
          g.arc((x + (y % 2) * 0.5) * 4, y * 4 + 2, 1.15, 0, Math.PI * 2)
          g.fill()
        }
    },
    { repeat: false },
  )
}

/**
 * A slim column line array on its power stand (base at the origin, top at
 * y ≈ 19.4) and, beside it, a bass module. Generic, no badges.
 */
export function paColumn() {
  const m = mats()
  const g = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: '#3a3734', roughness: 0.42, metalness: 0.25 })
  const perf = new THREE.MeshStandardMaterial({ color: '#ffffff', map: perfMap(), roughness: 0.5, metalness: 0.45 })
  const face = new THREE.MeshStandardMaterial({ color: '#ffffff', map: arrayMap(), roughness: 0.5, metalness: 0.4 })
  // the power stand: a tapered body
  const base = new THREE.Mesh(new RoundedBoxGeometry(3.2, 5.0, 2.8, 4, 0.35), shell)
  {
    const p = base.geometry.attributes.position
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + 2.5) / 5
      const k = 1 - 0.3 * t
      p.setX(i, p.getX(i) * k)
      p.setZ(i, p.getZ(i) * (1 - 0.18 * t))
    }
    base.geometry.computeVertexNormals()
  }
  base.position.y = 2.5
  g.add(base)
  const foot = new THREE.Mesh(new RoundedBoxGeometry(3.5, 0.18, 3.1, 2, 0.06), m.rubber)
  foot.position.y = 0.09
  g.add(foot)
  // the socket on top
  const socket = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.3, 1.0, 2, 0.08), shell)
  socket.position.y = 5.1
  g.add(socket)
  // two column sections: the extension and the array (face toward +z)
  const colW = 0.92
  const colD = 0.72
  const secs: [number, number, boolean][] = [
    [5.25, 7.0, false],
    [12.35, 7.0, true],
  ]
  for (const [y0, hgt, arr] of secs) {
    const col = new THREE.Mesh(new RoundedBoxGeometry(colW, hgt, colD, 3, 0.16), shell)
    col.position.y = y0 + hgt / 2
    g.add(col)
    if (arr) {
      // the curved grille over the drivers
      const grille = new THREE.Mesh(new THREE.CylinderGeometry(colW * 0.56, colW * 0.56, hgt - 0.3, 24, 1, true, -Math.PI * 0.32, Math.PI * 0.64), face)
      grille.position.set(0, y0 + hgt / 2, colD * 0.02)
      grille.scale.z = 0.62
      g.add(grille)
    } else {
      const strip = new THREE.Mesh(scaleUv(new THREE.PlaneGeometry(colW * 0.7, hgt - 0.5), 1.2, 12), perf)
      strip.position.set(0, y0 + hgt / 2, colD / 2 + 0.005)
      g.add(strip)
    }
    const joint = new THREE.Mesh(new THREE.BoxGeometry(colW * 1.02, 0.05, colD * 1.02), m.blackPlastic)
    joint.position.y = y0 + 0.02
    g.add(joint)
  }
  const cap = new THREE.Mesh(new RoundedBoxGeometry(colW, 0.14, colD, 2, 0.06), shell)
  cap.position.y = 19.4
  g.add(cap)
  // the bass module: a cabinet with a grille, to the right
  const bass = new THREE.Group()
  const box = new THREE.Mesh(new RoundedBoxGeometry(3.5, 4.1, 4.4, 4, 0.22), shell)
  box.position.y = 2.05
  bass.add(box)
  const bg = new THREE.Mesh(scaleUv(new THREE.PlaneGeometry(3.0, 3.6), 5, 6), perf)
  bg.position.set(0, 2.05, 2.205)
  bass.add(bg)
  bass.position.set(3.1, 0, 0.9)
  bass.rotation.y = -0.18
  g.add(bass)
  // the link cable between them
  g.add(tube([V(1.3, 0.8, 0.9), V(1.6, 0.05, 1.6), V(2.6, 0.04, 2.9), V(3.2, 0.9, 3.05)], 0.035, m.rubber, 30, 8))
  shadow(g, true, true)
  return g
}

/* ------------------------------------------------------------ pedalboard */

/**
 * A slanted pedalboard (6.2 wide, 3.1 deep, rising from 0.3 at the front
 * (+z) to 0.72 at the back); `deckAt(x, z)` gives the deck's height.
 */
export function pedalboard() {
  const g = new THREE.Group()
  const W = 6.2
  const D = 3.1
  const h0 = 0.3
  const h1 = 0.72
  const shell = new THREE.MeshStandardMaterial({ color: '#141313', roughness: 0.7, metalness: 0.05 })
  const deck = new THREE.MeshStandardMaterial({ color: '#0e0d0d', roughness: 0.92 })
  // side profile extruded across the width
  const s = new THREE.Shape()
  s.moveTo(-D / 2, 0)
  s.lineTo(D / 2, 0)
  s.lineTo(D / 2, h0)
  s.lineTo(-D / 2 + 0.1, h1)
  s.lineTo(-D / 2, h1 - 0.08)
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 })
  geo.translate(0, 0, -W / 2)
  // profile x → world z (front = +z), extrusion → world x
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)))
  const body = new THREE.Mesh(geo, [deck, shell])
  g.add(body)
  shadow(g, true, true)
  const slope = Math.atan2(h1 - h0, D)
  return {
    group: g,
    slope,
    deckAt: (_x: number, z: number) => h0 + (h1 - h0) * ((D / 2 - z) / D) + 0.05,
    size: V(W, h1, D),
  }
}

/* ------------------------------------------------------------ rug */

function rugMap() {
  return tile(
    'gear-rug',
    512,
    320,
    (g, w, h) => {
      const r = rng(88)
      const madder = '#6c2618'
      const deep = '#2a120c'
      const amber = '#a8682a'
      const cream = '#cdb58a'
      const indigo = '#23263a'
      g.clearRect(0, 0, w, h)
      // fringe at the two short ends (cut out by alphaTest)
      const fr = 14
      g.strokeStyle = '#bfa77e'
      g.lineWidth = 1.4
      for (let y = 6; y < h - 6; y += 4) {
        for (const x0 of [0, w - fr]) {
          g.beginPath()
          g.moveTo(x0 + (x0 ? 0 : fr), y + (r() - 0.5))
          g.lineTo(x0 + (x0 ? fr - r() * 4 : r() * 4), y + (r() - 0.5) * 3)
          g.stroke()
        }
      }
      const x0 = fr
      const x1 = w - fr
      // field
      g.fillStyle = madder
      g.fillRect(x0, 0, x1 - x0, h)
      // borders: indigo band with an amber zigzag, cream guard stripes
      const band = (inset: number, width: number, col: string) => {
        g.fillStyle = col
        g.fillRect(x0 + inset, inset, x1 - x0 - inset * 2, width)
        g.fillRect(x0 + inset, h - inset - width, x1 - x0 - inset * 2, width)
        g.fillRect(x0 + inset, inset, width, h - inset * 2)
        g.fillRect(x1 - inset - width, inset, width, h - inset * 2)
      }
      band(0, 6, deep)
      band(6, 3, cream)
      band(9, 26, indigo)
      band(35, 3, cream)
      band(38, 5, deep)
      // zigzag in the indigo band
      g.strokeStyle = amber
      g.lineWidth = 3
      const zig = (ax: number, ay: number, bx: number, by: number) => {
        const len = Math.hypot(bx - ax, by - ay)
        const n = Math.floor(len / 14)
        const ux = (bx - ax) / len
        const uy = (by - ay) / len
        g.beginPath()
        for (let i = 0; i <= n; i++) {
          const s = (i % 2 ? 1 : -1) * 6
          const px = ax + ux * i * 14 - uy * s
          const py = ay + uy * i * 14 + ux * s
          if (i === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
        g.stroke()
      }
      zig(x0 + 22, 22, x1 - 22, 22)
      zig(x0 + 22, h - 22, x1 - 22, h - 22)
      zig(x0 + 22, 22, x0 + 22, h - 22)
      zig(x1 - 22, 22, x1 - 22, h - 22)
      // the medallion: stepped diamonds, nested
      const cx = w / 2
      const cy = h / 2
      const diamond = (rx: number, ry: number, col: string, step = 8) => {
        g.fillStyle = col
        for (let y = -ry; y <= ry; y += step) {
          const k = 1 - Math.abs(y) / ry
          g.fillRect(cx - rx * k, cy + y - step / 2, rx * 2 * k, step)
        }
      }
      diamond(150, 96, deep, 8)
      diamond(136, 86, amber, 8)
      diamond(116, 72, madder, 8)
      diamond(86, 54, cream, 6)
      diamond(66, 42, indigo, 6)
      diamond(40, 26, amber, 4)
      diamond(18, 12, deep, 4)
      // corner motifs: little stepped stars
      for (const [sx, sy] of [
        [x0 + 80, 76],
        [x1 - 80, 76],
        [x0 + 80, h - 76],
        [x1 - 80, h - 76],
      ]) {
        g.fillStyle = cream
        for (let k = -3; k <= 3; k++) g.fillRect(sx - (4 - Math.abs(k)) * 4, sy + k * 4, (4 - Math.abs(k)) * 8, 4)
        g.fillStyle = amber
        g.fillRect(sx - 4, sy - 4, 8, 8)
      }
      // wear: faded patches, pile noise, a darker traffic lane
      for (let i = 0; i < 2600; i++) {
        const x = x0 + r() * (x1 - x0)
        const y = r() * h
        g.fillStyle = r() > 0.5 ? `rgba(255,230,190,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`
        g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2)
      }
      const fade = g.createRadialGradient(w * 0.44, h * 0.55, 10, w * 0.5, h * 0.5, w * 0.6)
      fade.addColorStop(0, 'rgba(220,190,150,0.12)')
      fade.addColorStop(1, 'rgba(0,0,0,0.2)')
      g.fillStyle = fade
      g.fillRect(x0, 0, x1 - x0, h)
    },
    { repeat: false },
  )
}

/** A faded kilim, `w` long (x) — fringe at the ends. */
export function rug(w = 15) {
  const h = (w * 320) / 512
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#ffffff', map: rugMap(), roughness: 0.96, alphaTest: 0.4 }),
  )
  m.receiveShadow = true
  return m
}

/* ------------------------------------------------------------ floor lamp */

function shadeMap() {
  // a lit fabric drum: brighter toward the rims, a faint weave
  return tile(
    'gear-shade',
    32,
    128,
    (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h)
      gr.addColorStop(0, '#fff0d0')
      gr.addColorStop(0.08, '#f2c07a')
      gr.addColorStop(0.5, '#d88f45')
      gr.addColorStop(0.92, '#f5c47e')
      gr.addColorStop(1, '#fff2d6')
      g.fillStyle = gr
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(80,40,10,0.12)'
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1)
    },
    { repeat: false },
  )
}

/**
 * A standing floor lamp: an iron base, a brass pole, a fabric drum shade
 * lit from inside (emissive: it glows, it doesn't light — index.ts adds the
 * one warm point light at `bulbAt`). Sits on y = 0.
 */
export function floorLamp({ height = 15.5 } = {}) {
  const m = mats()
  const g = new THREE.Group()
  const brass = new THREE.MeshStandardMaterial({ color: '#b48d52', roughness: 0.32, metalness: 1 })
  const base = new THREE.LatheGeometry(
    [
      [0.001, 0.32],
      [0.35, 0.3],
      [0.9, 0.14],
      [1.15, 0.06],
      [1.15, 0],
      [0.001, 0],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  )
  g.add(new THREE.Mesh(base, m.powder))
  g.add(rod(V(0, 0.3, 0), V(0, height - 1.0, 0), 0.055, brass, 12))
  // the harp holding the shade, and the socket
  const top = height - 0.5
  for (const s of [-1, 1]) g.add(rod(V(0, height - 1.9, 0), V(s * 0.5, top - 0.05, 0), 0.018, brass, 6))
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.34, 14), brass)
  socket.position.y = height - 1.15
  g.add(socket)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(2.2), toneMapped: false }))
  bulb.position.y = height - 0.82
  g.add(bulb)
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.35, 1.55, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: '#2a1a0c', emissive: '#ffffff', emissiveMap: shadeMap(), emissiveIntensity: 0.95, roughness: 0.95, side: THREE.DoubleSide }),
  )
  shade.position.y = top - 0.55
  g.add(shade)
  shadow(g, false, true)
  return { group: g, bulbAt: V(0, height - 0.82, 0) }
}

/* ------------------------------------------------------------ bar stool */

/** A wooden bar stool: a round seat at `seat`, four splayed legs, a footrest ring. */
export function stool({ seat = 7.4 } = {}) {
  const g = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: '#6e4527', roughness: 0.5 })
  const seatGeo = new THREE.LatheGeometry(
    [
      [0.001, seat + 0.02],
      [1.2, seat + 0.05],
      [1.5, seat],
      [1.56, seat - 0.1],
      [1.5, seat - 0.2],
      [0.001, seat - 0.22],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  )
  g.add(new THREE.Mesh(seatGeo, wood))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 8, 40), mats().powder)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 2.5
  g.add(ring)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(rod(V(Math.cos(a) * 0.9, seat - 0.2, Math.sin(a) * 0.9), V(Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45), 0.1, wood, 10, 0.08))
  }
  return shadow(g)
}

/* ------------------------------------------------------------ the setlist */

function setlistMap(titles: string[]) {
  return tile(
    'gear-setlist',
    256,
    362,
    (g, w, h) => {
      g.fillStyle = '#efe4cc'
      g.fillRect(0, 0, w, h)
      const r = rng(12)
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(110,80,40,${0.02 + r() * 0.04})`
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 0.6)
      }
      // a fold across the middle
      g.fillStyle = 'rgba(80,60,30,0.12)'
      g.fillRect(0, h * 0.5, w, 1.5)
      g.fillStyle = '#1d140c'
      g.textAlign = 'left'
      g.textBaseline = 'alphabetic'
      g.font = FONT.script(44, 700)
      g.fillText('GJP', 22, 52)
      g.strokeStyle = '#1d140c'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(20, 62)
      g.quadraticCurveTo(120, 58, 230, 66)
      g.stroke()
      g.font = FONT.script(29, 600)
      titles.forEach((t, i) => {
        g.save()
        g.translate(24 + (i % 2) * 3, 104 + i * 40)
        g.rotate((r() - 0.5) * 0.03)
        g.fillText(t, 0, 0)
        g.restore()
      })
    },
    { repeat: false },
  )
}

/** A hand-written setlist (song titles passed in), gaffer-taped to the floor; sits on y = 0. */
export function setlist(titles: string[]) {
  const g = new THREE.Group()
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.97).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', map: setlistMap(titles), roughness: 0.9 }))
  sheet.position.y = 0.012
  sheet.receiveShadow = true
  g.add(sheet)
  const tapeMat = new THREE.MeshStandardMaterial({ color: '#1e1c1a', roughness: 0.55 })
  for (const [x, z, a] of [
    [-0.95, -1.4, 0.7],
    [0.95, -1.4, -0.7],
    [0.9, 1.42, 0.6],
  ]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.26).rotateX(-Math.PI / 2), tapeMat)
    t.position.set(x, 0.016, z)
    t.rotation.y = a
    t.receiveShadow = true
    g.add(t)
  }
  return g
}

/* ------------------------------------------------------------ draw-call diet */

/**
 * Merge a STATIC prop's meshes that share a material into one mesh each
 * (fewer draw calls in the main and the shadow pass). Multi-material meshes
 * and anything under a node flagged `userData.live` stay as they are.
 */
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<THREE.Material, THREE.Mesh[]>()
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material) || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return
    for (let p: THREE.Object3D | null = m; p && p !== root; p = p.parent) if (p.userData.live) return
    const list = buckets.get(m.material) ?? []
    list.push(m)
    buckets.set(m.material, list)
  })
  const rel = new THREE.Matrix4()
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue
    const geos: THREE.BufferGeometry[] = []
    let cast = false
    let receive = false
    for (const m of list) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      if (!g.attributes.normal) g.computeVertexNormals()
      g.clearGroups()
      g.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld))
      geos.push(g)
      cast ||= m.castShadow
      receive ||= m.receiveShadow
    }
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    for (const g of geos) g.dispose()
    for (const m of list) m.parent?.remove(m)
    const out = new THREE.Mesh(merged, mat)
    out.castShadow = cast
    out.receiveShadow = receive
    root.add(out)
  }
  return root
}
