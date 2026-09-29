import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Frame } from '../../core/types'
import { Strings } from '../../kit/strings'
import { chrome, cream, nickel, rosewoodMap } from '../../kit/materials'
import { box, burst, merge, mesh, mirrored, outline, plate, rod, tortoiseMap, wall } from './util'

/*
 * THE BAND · the other fretted instrument on the stage (Greg's acoustic is
 * the kit guitar): David Tracey's bass — a generic double-cut in aged cream
 * with a tortoise guard, four strings; no maker's shape or logo.
 *
 * It uses the kit guitar's local frame: it lies in XY facing
 * +Z, the neck along +X, the SADDLE at x = 0 and the NUT at x = scale, +Y
 * the bass side. `tail` is the local x of the bottom end, `back` the local z
 * of the back (for standing it on a stand), `hold` where a stand's yoke
 * takes the neck. Strings are the kit's vibrating Strings (6 slots: the two
 * unused slots are parked inside the body, out of sight).
 */

export interface Fretted {
  group: THREE.Group
  strings: Strings[]
  tail: number
  back: number
  hold: number
  /** local z of the neck's back at `hold` */
  holdZ: number
  update(frame: Frame, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void
  /** ring every string at amplitude v (units) */
  ring(v: number): void
}

interface NeckSpec {
  scale: number
  frets: number
  /** local x where the neck's heel meets the body */
  heel: number
  wNut: number
  wEnd: number
  boardZ: number
  boardT: number
  depth: number
  dots: number[]
  boardMat: THREE.Material
  neckMat: THREE.Material
  fretMat: THREE.Material
  dotMat: THREE.Material
  nutMat: THREE.Material
  mobile: boolean
}

const fretAt = (scale: number, n: number) => scale * Math.pow(2, -n / 12)

/** the neck: a tapered board with frets and dots, a rounded back, the nut */
function buildNeck(s: NeckSpec) {
  const g = new THREE.Group()
  const xEnd = fretAt(s.scale, s.frets) - 0.08
  const x1 = s.scale + 0.012
  const width = (x: number) => s.wEnd + (s.wNut - s.wEnd) * THREE.MathUtils.clamp((x - xEnd) / (s.scale - xEnd), 0, 1)
  // board
  const len = x1 - xEnd
  const bg = new THREE.BoxGeometry(len, 1, s.boardT, 6, 1, 1)
  bg.translate(xEnd + len / 2, 0, s.boardZ - s.boardT / 2)
  const p = bg.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * width(p.getX(i)))
  bg.computeVertexNormals()
  g.add(mesh(bg, s.boardMat))
  // back: a D profile from the heel to the nut
  {
    const segX = 8
    const segA = s.mobile ? 8 : 12
    const x0 = s.heel - 0.15
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= segX; i++) {
      const t = i / segX
      const x = x0 + (x1 - x0) * t
      const w = Math.max(width(x), s.wEnd) * 0.5
      const d = s.depth * (1 + 0.25 * (1 - t))
      for (let j = 0; j <= segA; j++) {
        const a = (Math.PI * j) / segA
        pos.push(x, Math.cos(a) * w, s.boardZ - s.boardT - Math.sin(a) * d)
        uv.push(x * 0.3, j / segA)
      }
    }
    for (let i = 0; i < segX; i++)
      for (let j = 0; j < segA; j++) {
        const a = i * (segA + 1) + j
        const b = a + segA + 1
        idx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    const ng = new THREE.BufferGeometry()
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    ng.setIndex(idx)
    ng.computeVertexNormals()
    const nm = mesh(ng, s.neckMat)
    ;(nm.material as THREE.Material).side = THREE.DoubleSide
    g.add(nm)
  }
  // frets
  const fg: THREE.BufferGeometry[] = []
  for (let n = 1; n <= s.frets; n++) {
    const x = fretAt(s.scale, n)
    fg.push(box(0.022, width(x) * 0.98, 0.02, x, 0, s.boardZ + 0.006))
  }
  g.add(mesh(merge(fg), s.fretMat, false, true))
  // dots
  const dg: THREE.BufferGeometry[] = []
  for (const n of s.dots) {
    const x = (fretAt(s.scale, n) + fretAt(s.scale, n - 1)) / 2
    const ys = n === 12 || n === 24 ? [-0.12 * (s.wNut / 0.44), 0.12 * (s.wNut / 0.44)] : [0]
    for (const y of ys) dg.push(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 14).rotateX(Math.PI / 2).translate(x, y, s.boardZ + 0.001))
  }
  if (dg.length) g.add(mesh(merge(dg), s.dotMat, false, true))
  // nut
  g.add(mesh(box(0.05, s.wNut, 0.05, s.scale + 0.02, 0, s.boardZ + 0.01), s.nutMat, false, true))
  return { group: g, width, xEnd }
}

interface HeadSpec {
  scale: number
  /** outline beyond the nut (x from 0) — upper half, mirrored */
  half: [number, number][]
  thick: number
  /** z of the face at the nut (local) */
  faceZ: number
  /** back angle (radians) */
  angle: number
  faceMat: THREE.Material
  backMat: THREE.Material
}

/** a headstock: an extruded outline angled back at the nut; returns the frame to place tuners in */
function buildHead(h: HeadSpec) {
  const pts = mirrored(h.half)
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h.thick, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 })
  geo.translate(0, 0, -h.thick)
  const g = new THREE.Group()
  const m = mesh(geo, [h.faceMat, h.backMat])
  g.add(m)
  g.position.set(h.scale + 0.03, 0, h.faceZ)
  g.rotation.y = h.angle
  g.updateMatrix()
  return g
}

interface StringSpec {
  /** saddle end (x ≈ 0) and nut end points, one per string (≤ 6 per Strings) */
  from: THREE.Vector3[]
  to: THREE.Vector3[]
  radius: number[]
  wound: boolean[]
  tints: THREE.Color[]
  /** a parking spot inside the body for unused slots */
  park: THREE.Vector3
}

function makeStrings(s: StringSpec): Strings {
  const from = s.from.slice()
  const to = s.to.slice()
  const radius = s.radius.slice()
  const wound = s.wound.slice()
  const tints = s.tints.slice()
  while (from.length < 6) {
    from.push(s.park.clone())
    to.push(s.park.clone().add(new THREE.Vector3(0.12, 0, 0)))
    radius.push(0.001)
    wound.push(false)
    tints.push(new THREE.Color('#000000'))
  }
  return new Strings({ from, to, radius, wound, tints, swing: new THREE.Vector3(0, 1, 0.3), segments: 48 })
}

/** the short runs behind the nut and the saddle (merged thin rods) */
function runs(pairs: [THREE.Vector3, THREE.Vector3][], r: number, mat: THREE.Material) {
  return mesh(merge(pairs.map(([a, b]) => rod(a, b, r, 4))), mat, false, false)
}

const nickelStr = new THREE.Color('#d9d4ca')

function finishRing(strings: Strings[], v: number) {
  for (const s of strings) for (let i = 0; i < 6; i++) s.amp[i] = v
}

/* ================================================================== BASS */

export function buildBass(mobile: boolean): Fretted {
  const group = new THREE.Group()
  const SCALE = 8.64
  const boardZ = 0.2
  const line = outline(
    [
      [-1.35, 0],
      [-1.25, -0.9],
      [-0.9, -1.5],
      [-0.25, -1.74],
      [0.5, -1.7],
      [1.15, -1.5],
      [1.62, -1.24],
      [2.02, -1.24],
      [2.5, -1.4],
      [2.95, -1.38],
      [3.24, -1.14],
      [3.16, -0.86],
      [2.92, -0.64],
      [2.86, -0.38],
      [2.95, 0],
      [2.95, 0.38],
      [3.12, 0.62],
      [3.52, 0.86],
      [3.94, 1.08],
      [4.0, 1.34],
      [3.72, 1.5],
      [3.12, 1.46],
      [2.52, 1.32],
      [1.98, 1.22],
      [1.38, 1.44],
      [0.56, 1.72],
      [-0.25, 1.78],
      [-0.9, 1.55],
      [-1.25, 0.95],
    ],
    mobile ? 100 : 150,
  )
  const C = new THREE.Vector2(0.6, 0)
  const T = 0.44
  const roll = 0.08
  const rings = mobile ? 7 : 10
  const paint = burst({ inner: '#efe5cc', mid: '#e6d5ae', outer: '#b89560', from: 0.6, to: 1.0, roughness: 0.3 })
  const backMat = new THREE.MeshPhysicalMaterial({ color: '#d8c49a', roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.22, specularIntensity: 0.6 })
  group.add(mesh(plate(line, C, rings, t => -roll * Math.pow(THREE.MathUtils.smoothstep(t, 0.88, 1), 1.5)), paint))
  group.add(mesh(wall(line, -roll, -T + roll), backMat))
  group.add(mesh(plate(line, C, rings, t => -T + roll * Math.pow(THREE.MathUtils.smoothstep(t, 0.88, 1), 1.5), true), backMat))

  // tortoise pickguard round the strings (upper body), a little proud of the top
  {
    const pg = outline(
      [
        [0.55, -0.62],
        [1.1, -1.0],
        [1.7, -1.02],
        [2.3, -0.98],
        [2.8, -0.72],
        [3.2, -0.34],
        [3.4, 0.2],
        [3.35, 0.62],
        [2.9, 0.98],
        [2.3, 1.04],
        [1.7, 1.02],
        [1.1, 1.12],
        [0.5, 1.08],
        [0.2, 0.7],
        [0.25, -0.2],
      ],
      80,
    )
    const shape = new THREE.Shape(pg)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 1 })
    geo.translate(0, 0, 0.004)
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.45, uv.getY(i) * 0.45)
    group.add(mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: tortoiseMap(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.22, specularIntensity: 0.6 }), false, true))
  }

  const board = new THREE.MeshStandardMaterial({ color: '#ffffff', map: rosewoodMap(), roughness: 0.6 })
  const maple = new THREE.MeshPhysicalMaterial({ color: '#d9a866', roughness: 0.44, clearcoat: 0.5, clearcoatRoughness: 0.22, specularIntensity: 0.6 })
  const neck = buildNeck({
    scale: SCALE,
    frets: 20,
    heel: 3.05,
    wNut: 0.42,
    wEnd: 0.62,
    boardZ,
    boardT: 0.06,
    depth: 0.23,
    dots: [3, 5, 7, 9, 12, 15, 17, 19],
    boardMat: board,
    neckMat: maple,
    fretMat: nickel(0.3),
    dotMat: cream(0.3),
    nutMat: cream(0.3),
    mobile,
  })
  group.add(neck.group)
  const head = buildHead({
    scale: SCALE,
    half: [
      [0, 0],
      [0, 0.22],
      [0.35, 0.4],
      [1.4, 0.58],
      [2.05, 0.6],
      [2.35, 0.46],
      [2.42, 0.18],
      [2.4, 0],
    ],
    thick: 0.15,
    faceZ: boardZ - 0.02,
    angle: 0.2,
    faceMat: new THREE.MeshPhysicalMaterial({ color: '#e8dcc0', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.22, specularIntensity: 0.6 }),
    backMat: maple,
  })
  group.add(head)

  const hw = chrome(0.16)
  const hwg: THREE.BufferGeometry[] = []
  // bridge plate with four saddles
  hwg.push(new RoundedBoxGeometry(0.62, 0.86, 0.04, 2, 0.015).translate(-0.12, 0, 0.02))
  for (let i = 0; i < 4; i++) hwg.push(new RoundedBoxGeometry(0.2, 0.14, 0.1, 2, 0.03).translate(0.02, (1.5 - i) * 0.19, 0.08))
  hwg.push(box(0.1, 0.86, 0.14, -0.4, 0, 0.07))
  // control plate + two knobs
  hwg.push(new RoundedBoxGeometry(1.1, 0.34, 0.02, 2, 0.01).rotateZ(-0.35).translate(-0.3, -1.12, 0.01))
  for (const [x, y] of [
    [-0.62, -1.0],
    [0.02, -1.24],
  ])
    hwg.push(new THREE.CylinderGeometry(0.1, 0.12, 0.13, 16).rotateX(Math.PI / 2).translate(x, y, 0.08))
  group.add(mesh(merge(hwg), hw, false, true))
  // a split pickup (two black covers, staggered)
  const pu: THREE.BufferGeometry[] = []
  pu.push(new RoundedBoxGeometry(0.24, 0.46, 0.08, 2, 0.04).translate(1.38, 0.2, 0.05))
  pu.push(new RoundedBoxGeometry(0.24, 0.46, 0.08, 2, 0.04).translate(1.2, -0.22, 0.05))
  group.add(mesh(merge(pu), new THREE.MeshStandardMaterial({ color: '#0e0c0b', roughness: 0.5 }), false, true))

  // tuners 2 + 2: posts on the face, open-gear housings on the back, clover keys out to the sides
  const tg: THREE.BufferGeometry[] = []
  const keys: THREE.BufferGeometry[] = []
  const posts: THREE.Vector3[] = []
  const xs = [0.62, 1.52]
  for (let k = 0; k < 4; k++) {
    const side = k < 2 ? 1 : -1
    const u = xs[k % 2]
    const v = side * 0.3
    tg.push(new THREE.CylinderGeometry(0.05, 0.055, 0.16, 12).rotateX(Math.PI / 2).translate(u, v, 0.07))
    tg.push(box(0.36, 0.3, 0.12, u, side * 0.44, -0.22))
    tg.push(rod(new THREE.Vector3(u, side * 0.58, -0.22), new THREE.Vector3(u, side * 0.84, -0.22), 0.025, 8))
    keys.push(new THREE.SphereGeometry(0.2, 14, 10).scale(1, 0.62, 0.22).translate(u, side * 0.98, -0.22))
    posts.push(new THREE.Vector3(u, v, 0.12).applyMatrix4(head.matrix))
  }
  head.add(mesh(merge(tg), chrome(0.12), false, true), mesh(merge(keys), chrome(0.1), false, true))

  const gauge = [0.105, 0.085, 0.065, 0.045].map(d => d * 0.127)
  const from: THREE.Vector3[] = []
  const to: THREE.Vector3[] = []
  for (let i = 0; i < 4; i++) {
    from.push(new THREE.Vector3(0.04, (1.5 - i) * 0.19, 0.2))
    to.push(new THREE.Vector3(SCALE + 0.02, (1.5 - i) * 0.1, boardZ + 0.05))
  }
  const strings = makeStrings({
    from,
    to,
    radius: gauge,
    wound: [true, true, true, true],
    tints: [nickelStr, nickelStr, nickelStr, nickelStr],
    park: new THREE.Vector3(-0.9, 0, -0.25),
  })
  group.add(strings.group)
  const pr: [THREE.Vector3, THREE.Vector3][] = []
  for (let i = 0; i < 4; i++) {
    pr.push([from[i], new THREE.Vector3(-0.38, from[i].y, 0.12)])
    pr.push([to[i], posts[i]])
  }
  group.add(runs(pr, 0.009, new THREE.MeshStandardMaterial({ color: '#c8c4bc', metalness: 1, roughness: 0.3 })))

  const out: Fretted = {
    group,
    strings: [strings],
    tail: -1.35,
    back: -T,
    hold: SCALE - 1.0,
    holdZ: boardZ - 0.06 - 0.23,
    update(frame, camera, renderer) {
      strings.update(frame, camera, renderer)
    },
    ring(v) {
      finishRing(out.strings, v)
    },
  }
  return out
}
