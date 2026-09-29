import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { chrome, nickel, rubber, glow, plankMap } from '../../kit/materials'
import { stageFloor, scaleUv } from '../../kit/stage'
import {
  CASS_HUBS,
  SHEET_ROWS,
  SHEET_ROW_X,
  VU_PIVOT,
  VU_SWEEP,
  bookletMap,
  brushedMap,
  spunMap,
  cassetteMap,
  discMap,
  drumMap,
  legendMap,
  loopMap,
  packEdgeMap,
  tapeStripMap,
  trackSheetMap,
  vuFaceMap,
  walnutMap,
  wordMap,
} from './art'

/*
 * LISTEN · THE SET. A vintage 2-inch multitrack in the lamplight, the
 * corner of the room where Volume ONE lives. Units: 1 = 10 cm.
 *
 *  - THE MACHINE: a console cabinet with the transport deck on top, leaned
 *    back ~11°, walnut side cheeks. On the deck: two 10.5" NAB metal reels
 *    (three windows each, the wound pack of 2" tape showing through), the
 *    tape path (supply → tension roller → erase / record / play heads →
 *    capstan and pinch roller → roller → take-up), the transport buttons
 *    (REW FF STOP PLAY REC, lamps), a 4-drum mechanical min:sec counter,
 *    a pilot jewel. Above: a meter bridge with eight backlit VU meters.
 *  - THE SIDE TABLE on its right: the Volume ONE tape box lying open, its
 *    lid up with the track sheet taped inside (a grease-pencil loop round
 *    the song that's up — the reel itself is on the machine), the Like a
 *    Movie jewel case lying open, and the World Cafe Live audience cassette.
 *
 * World: the machine faces +z, centred on x = 0; the floor is y = 0.
 * Deck-local space: the plate is the XY plane facing +z (x across, y up the
 * plate), the tape runs at z 0.2..0.708 (2 inches wide).
 */

/* ------------------------------------------------------------------ layout */

const PLATE_W = 8.6
const PLATE_H = 6.2
const TILT = 0.19
/** the deck group's world placement (see header) */
export const DECK_POS = new THREE.Vector3(0, 11.8, 0.02)
const CAB_TOP = 8.72

const REEL_X = 2.3
const REEL_Y = 1.12
const FLANGE_R = 1.33
const HUB_R = 0.44
/** the full pack's radius and the empty hub's (area is conserved between the reels) */
const PACK_MAX = 1.25
const PACK_MIN = 0.47
const PACK_AREA = PACK_MAX * PACK_MAX + PACK_MIN * PACK_MIN
const TAPE_Z0 = 0.2
const TAPE_Z1 = 0.708
const ROLL_R = 0.17
const ROLL_Y = -1.12
const ROLL_X = 1.72
const TAPE_Y = ROLL_Y - ROLL_R
const HEADS_X = [-0.52, -0.1, 0.32]
const CAPSTAN_X = 1.06
const CTRL_Y = -2.5
const BTN_X = [-1.1, -0.55, 0, 0.55, 1.1]
export const LAMP = { rew: 0, ff: 1, stop: 2, play: 3, rec: 4 } as const
const COUNTER_X = -2.92

/** eight VU meters on the bridge */
const METERS = 8
const METER_PITCH = 1.0

/** table + props (world) */
const TABLE = { x0: 4.95, x1: 10.75, z0: -2.6, z1: 2.2, top: 7.6 }
const BOX = { x: 6.55, z: -0.95, yaw: -0.06, size: 2.8, depth: 0.32 }
const LID_OPEN = -1.72
export const JEWEL = { x: 9.15, z: 1.05, yaw: 0.36 }
export const CASS = { x: 6.95, z: 1.45, yaw: -0.24 }
/** total tape the counter spans (s): the six songs and a little leader */
export const TAPE_SPAN = 1700

/* ------------------------------------------------------------------ helpers */

const zAxis = (geo: THREE.BufferGeometry) => geo.rotateX(Math.PI / 2)

/** Chaikin corner-cutting on a closed polygon (rounds its corners) */
function chaikin(pts: THREE.Vector2[], iters = 2) {
  let p = pts
  for (let k = 0; k < iters; k++) {
    const q: THREE.Vector2[] = []
    for (let i = 0; i < p.length; i++) {
      const a = p[i]
      const b = p[(i + 1) % p.length]
      q.push(new THREE.Vector2().lerpVectors(a, b, 0.25), new THREE.Vector2().lerpVectors(a, b, 0.75))
    }
    p = q
  }
  return p
}

/** the NAB metal reel flange: a disc with a hub hole and three big windows */
function flangeGeometry(segs: number) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, FLANGE_R, 0, Math.PI * 2, false)
  const hub = new THREE.Path()
  hub.absarc(0, 0, HUB_R - 0.03, 0, Math.PI * 2, true)
  shape.holes.push(hub)
  const r0 = 0.58
  const r1 = 1.17
  const half = 0.72
  for (let k = 0; k < 3; k++) {
    const c = Math.PI / 2 + (k * Math.PI * 2) / 3
    const pts: THREE.Vector2[] = []
    const n = 18
    // the ribs between windows are straight-sided: inset the inner arc a little more
    const hi = half - 0.05
    for (let i = 0; i <= n; i++) {
      const a = c - half + (2 * half * i) / n
      pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1))
    }
    for (let i = n; i >= 0; i--) {
      const a = c - hi * 0.82 + (2 * hi * 0.82 * i) / n
      pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0))
    }
    const round = chaikin(pts, 3).reverse()
    const hole = new THREE.Path(round)
    shape.holes.push(hole)
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: segs,
  })
  // UVs centred on the hub: the spun-aluminium rings run round the reel
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2.9 * FLANGE_R) + 0.5, pos.getY(i) / (2.9 * FLANGE_R) + 0.5)
  uv.needsUpdate = true
  return geo
}

/**
 * The tangent path of a belt of tape round a chain of circles. Each circle:
 * centre, radius, and s = +1 when the tape wraps it anticlockwise (centre on
 * the tape's left), -1 clockwise. Returns the departure/arrival points of
 * each straight run.
 */
function tangent(c1: THREE.Vector2, k1: number, c2: THREE.Vector2, k2: number, a: THREE.Vector2, b: THREE.Vector2) {
  // p = c - k L, where L is the left normal of the run direction d
  const dx = c2.x - c1.x
  const dy = c2.y - c1.y
  const dist = Math.hypot(dx, dy)
  const phi = Math.atan2(dy, dx)
  const th = phi - Math.asin(Math.max(-1, Math.min(1, (k2 - k1) / dist)))
  const Lx = -Math.sin(th)
  const Ly = Math.cos(th)
  a.set(c1.x - k1 * Lx, c1.y - k1 * Ly)
  b.set(c2.x - k2 * Lx, c2.y - k2 * Ly)
}

/**
 * Bake a parent's static child meshes that share a material (and shadow
 * flags / render order) into one mesh each: fewer draw calls for the many
 * small parts. Meshes tagged userData.dyn (they move, scale or recolour on
 * their own) are left alone.
 */
function mergeStatic(parent: THREE.Object3D) {
  const buckets = new Map<string, THREE.Mesh[]>()
  for (const o of parent.children) {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.dyn || Array.isArray(m.material) || m.children.length) continue
    const k = `${(m.material as THREE.Material).uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${m.frustumCulled}`
    const list = buckets.get(k) ?? []
    list.push(m)
    buckets.set(k, list)
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    const geos = list.map(m => {
      m.updateMatrix()
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
      g.clearGroups()
      return g.applyMatrix4(m.matrix)
    })
    const merged = mergeGeometries(geos)
    geos.forEach(g => g.dispose())
    if (!merged) continue
    const first = list[0]
    const mesh = new THREE.Mesh(merged, first.material)
    mesh.castShadow = first.castShadow
    mesh.receiveShadow = first.receiveShadow
    mesh.renderOrder = first.renderOrder
    for (const m of list) parent.remove(m)
    parent.add(mesh)
  }
}

/* ------------------------------------------------------------------ the set */

export interface ListenSet {
  root: THREE.Group
  deck: THREE.Group
  /** world anchors the camera frames */
  at: {
    deck: THREE.Vector3
    reelA: THREE.Vector3
    reelB: THREE.Vector3
    heads: THREE.Vector3
    counter: THREE.Vector3
    meters: THREE.Vector3
    sheet: THREE.Vector3
    box: THREE.Vector3
    jewel: THREE.Vector3
    cassette: THREE.Vector3
    table: THREE.Vector3
  }
  /** tape position in seconds: packs, tape path, counter drums */
  setTape(sec: number): void
  /** the reels' angles (radians, deck-local z) */
  setReels(a: number, b: number): void
  /** current pack radii [supply, take-up] */
  packs: [number, number]
  setVu(levels: ArrayLike<number>): void
  /** transport lamps 0..1: rew ff stop play rec */
  setLamps(v: ArrayLike<number>): void
  /** the grease-pencil loop on the track sheet: row (continuous 0..5), visibility */
  setMarker(row: number, vis: number): void
  /** the cassette hubs' angle */
  setCassette(angle: number): void
  /** the meter backlight 0..1 */
  setBacklight(v: number): void
}

export async function buildSet({ mobile, yieldFn }: { mobile: boolean; yieldFn: () => Promise<void> }): Promise<ListenSet> {
  const root = new THREE.Group()
  const segs = mobile ? 40 : 64

  /* ---------------- materials */
  const walnut = new THREE.MeshPhysicalMaterial({ color: '#b8876a', map: walnutMap(), roughness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.2 })
  const tableWood = new THREE.MeshStandardMaterial({ color: '#d7a27a', map: walnutMap(), roughness: 0.58 })
  const plate = new THREE.MeshStandardMaterial({ color: '#39332d', roughness: 0.5, metalness: 0.28 })
  const cabinet = new THREE.MeshStandardMaterial({ color: '#1a1614', roughness: 0.62, metalness: 0.15 })
  const plinth = new THREE.MeshStandardMaterial({ color: '#070606', roughness: 0.8 })
  const alu = new THREE.MeshStandardMaterial({ color: '#efeae2', map: brushedMap(), metalness: 0.72, roughness: 0.3 })
  const spun = new THREE.MeshStandardMaterial({ color: '#f4efe6', map: spunMap(), metalness: 0.74, roughness: 0.26 })
  const aluDark = new THREE.MeshStandardMaterial({ color: '#a9a49c', map: brushedMap(), metalness: 0.8, roughness: 0.36 })
  const turntable = new THREE.MeshStandardMaterial({ color: '#12100f', roughness: 0.55, metalness: 0.2 })
  const packSide = new THREE.MeshStandardMaterial({ color: '#4a2e1c', roughness: 0.42 })
  const packCap = new THREE.MeshStandardMaterial({ color: '#ffffff', map: packEdgeMap(), roughness: 0.28, metalness: 0.15 })
  const tapeMat = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.3, metalness: 0.18, side: THREE.DoubleSide })
  const head = nickel(0.16)
  const chromeM = chrome(0.1)
  const rubberM = rubber()
  const bezel = new THREE.MeshStandardMaterial({ color: '#0d0c0b', roughness: 0.4, metalness: 0.3 })
  const cardboard = new THREE.MeshStandardMaterial({ color: '#6f533a', roughness: 0.92 })
  const cardboardIn = new THREE.MeshStandardMaterial({ color: '#5a4230', roughness: 0.95 })

  /* ---------------- the cabinet */
  const cab = new THREE.Mesh(new RoundedBoxGeometry(9.3, CAB_TOP - 0.8, 4.0, 3, 0.08), cabinet)
  cab.position.set(0, 0.8 + (CAB_TOP - 0.8) / 2, -1.42)
  cab.castShadow = cab.receiveShadow = true
  const base = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.8, 3.6), plinth)
  base.position.set(0, 0.4, -1.5)
  // door seams + two pulls on the cabinet front
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 6.4, 0.02), plinth)
  seam.position.set(0, 4.7, 0.59)
  const pullGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12)
  const pulls = [-0.35, 0.35].map(x => {
    const p = new THREE.Mesh(pullGeo, chromeM)
    p.position.set(x, 6.4, 0.66)
    return p
  })
  root.add(cab, base, seam, ...pulls)

  /* ---------------- the deck */
  const deck = new THREE.Group()
  deck.position.copy(DECK_POS)
  deck.rotation.x = -TILT
  root.add(deck)

  const plateMesh = new THREE.Mesh(new RoundedBoxGeometry(PLATE_W, PLATE_H, 0.3, 2, 0.04), plate)
  plateMesh.position.set(0, 0, -0.15)
  plateMesh.receiveShadow = true
  deck.add(plateMesh)

  // walnut cheeks, standing proud of the plate and framing the meter bridge
  const cheekGeo = new RoundedBoxGeometry(0.36, 8.5, 2.4, 3, 0.12)
  scaleUv(cheekGeo, 1, 2.5)
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(cheekGeo, walnut)
    c.position.set(s * (PLATE_W / 2 + 0.18), 1.0, -0.3)
    c.castShadow = c.receiveShadow = true
    deck.add(c)
  }
  // a walnut rail along the front edge (under the controls)
  const rail = new THREE.Mesh(new RoundedBoxGeometry(PLATE_W, 0.34, 0.5, 2, 0.08), walnut)
  rail.position.set(0, -PLATE_H / 2 - 0.1, 0.05)
  rail.castShadow = rail.receiveShadow = true
  deck.add(rail)
  await yieldFn()

  /* ---------------- reels */
  const flangeGeo = flangeGeometry(segs)
  const turnGeo = zAxis(new THREE.CylinderGeometry(0.98, 0.98, 0.12, segs))
  const hubGeo = zAxis(new THREE.CylinderGeometry(HUB_R, HUB_R, TAPE_Z1 - TAPE_Z0 + 0.1, segs))
  const packGeo = zAxis(new THREE.CylinderGeometry(1, 1, TAPE_Z1 - TAPE_Z0 - 0.01, segs, 1, false))
  const capGeo = zAxis(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 32))
  const earGeo = new RoundedBoxGeometry(0.12, 0.34, 0.1, 2, 0.04)
  const reels: THREE.Group[] = []
  const packs: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const tt = new THREE.Mesh(turnGeo, turntable)
    tt.position.set(s * REEL_X, REEL_Y, 0.06)
    tt.receiveShadow = true
    deck.add(tt)
    const reel = new THREE.Group()
    reel.position.set(s * REEL_X, REEL_Y, 0)
    const back = new THREE.Mesh(flangeGeo, spun)
    back.position.z = TAPE_Z0 - 0.045
    const front = new THREE.Mesh(flangeGeo, spun)
    front.position.z = TAPE_Z1 + 0.012
    back.castShadow = front.castShadow = true
    back.receiveShadow = front.receiveShadow = true
    const hub = new THREE.Mesh(hubGeo, aluDark)
    hub.position.z = (TAPE_Z0 + TAPE_Z1) / 2
    const pack = new THREE.Mesh(packGeo, [packSide, packCap, packCap])
    pack.userData.dyn = true
    pack.position.z = (TAPE_Z0 + TAPE_Z1) / 2
    pack.castShadow = pack.receiveShadow = true
    const cap = new THREE.Mesh(capGeo, chromeM)
    cap.position.z = TAPE_Z1 + 0.1
    reel.add(back, front, hub, pack, cap)
    for (let k = 0; k < 3; k++) {
      const ear = new THREE.Mesh(earGeo, chromeM)
      const a = (k * Math.PI * 2) / 3
      ear.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, TAPE_Z1 + 0.12)
      ear.rotation.z = a + Math.PI / 2
      reel.add(ear)
    }
    deck.add(reel)
    reels.push(reel)
    packs.push(pack)
  }
  await yieldFn()

  /* ---------------- rollers, arms, heads, capstan */
  const rollGeo = zAxis(new THREE.CylinderGeometry(ROLL_R, ROLL_R, 0.62, 32))
  const rollFlGeo = zAxis(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 32))
  const armGeo = new RoundedBoxGeometry(1.0, 0.13, 0.08, 2, 0.03)
  const pivotGeo = zAxis(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 24))
  for (const s of [-1, 1]) {
    const x = s * ROLL_X
    const r = new THREE.Mesh(rollGeo, chromeM)
    r.position.set(x, ROLL_Y, (TAPE_Z0 + TAPE_Z1) / 2)
    r.castShadow = true
    deck.add(r)
    for (const z of [TAPE_Z0 - 0.03, TAPE_Z1 + 0.03]) {
      const f = new THREE.Mesh(rollFlGeo, chromeM)
      f.position.set(x, ROLL_Y, z)
      deck.add(f)
    }
    // the tension arm: from a pivot down-and-out to the roller
    const px = s * (ROLL_X + 0.85)
    const py = ROLL_Y - 0.62
    const arm = new THREE.Mesh(armGeo, aluDark)
    arm.position.set((x + px) / 2, (ROLL_Y + py) / 2, 0.09)
    arm.rotation.z = Math.atan2(ROLL_Y - py, x - px)
    arm.scale.x = Math.hypot(x - px, ROLL_Y - py) / 1.0
    const pv = new THREE.Mesh(pivotGeo, chromeM)
    pv.position.set(px, py, 0.08)
    deck.add(arm, pv)
  }
  // the head block: a milled base, three heads whose faces meet the tape
  const block = new THREE.Mesh(new RoundedBoxGeometry(1.75, 0.62, 0.34, 2, 0.05), alu)
  block.position.set(-0.1, TAPE_Y - 0.44, 0.17)
  block.castShadow = true
  block.receiveShadow = true
  deck.add(block)
  const headGeo = new RoundedBoxGeometry(0.3, 0.34, 0.64, 3, 0.1)
  for (const x of HEADS_X) {
    const h = new THREE.Mesh(headGeo, head)
    h.position.set(x, TAPE_Y - 0.17, (TAPE_Z0 + TAPE_Z1) / 2)
    deck.add(h)
  }
  // a head shield over the play head (bent aluminium)
  const shield = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.06, 0.74, 2, 0.02), alu)
  shield.position.set(HEADS_X[2], TAPE_Y + 0.18, (TAPE_Z0 + TAPE_Z1) / 2)
  deck.add(shield)
  // capstan + pinch roller
  const capstan = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.055, 0.055, 0.86, 16)), chromeM)
  capstan.position.set(CAPSTAN_X, TAPE_Y - 0.056, 0.46)
  const pinch = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.2, 0.2, 0.56, 32)), rubberM)
  pinch.position.set(CAPSTAN_X, TAPE_Y + 0.201, (TAPE_Z0 + TAPE_Z1) / 2)
  pinch.castShadow = true
  const pinchCap = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 20)), chromeM)
  pinchCap.position.copy(pinch.position)
  const pinchArm = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.12, 0.08, 2, 0.03), aluDark)
  pinchArm.position.set(CAPSTAN_X + 0.3, TAPE_Y + 0.3, 0.09)
  pinchArm.rotation.z = 0.35
  deck.add(capstan, pinch, pinchCap, pinchArm)
  await yieldFn()

  /* ---------------- the tape: a ribbon along the path (rebuilt when the packs change) */
  const ARC = 12
  const NPTS = 2 + ARC * 2
  const tapePos = new Float32Array(NPTS * 2 * 3)
  const tapeNrm = new Float32Array(NPTS * 2 * 3)
  const tapeIdx: number[] = []
  for (let i = 0; i < NPTS - 1; i++) {
    const a = i * 2
    tapeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const tapeGeo = new THREE.BufferGeometry()
  tapeGeo.setAttribute('position', new THREE.BufferAttribute(tapePos, 3))
  tapeGeo.setAttribute('normal', new THREE.BufferAttribute(tapeNrm, 3))
  tapeGeo.setIndex(tapeIdx)
  tapeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.45), 6)
  const tape = new THREE.Mesh(tapeGeo, tapeMat)
  tape.frustumCulled = false
  tape.castShadow = true
  tape.receiveShadow = true
  deck.add(tape)
  const cA = new THREE.Vector2(-REEL_X, REEL_Y)
  const cB = new THREE.Vector2(REEL_X, REEL_Y)
  const cS1 = new THREE.Vector2(-ROLL_X, ROLL_Y)
  const cS2 = new THREE.Vector2(ROLL_X, ROLL_Y)
  const p0 = new THREE.Vector2()
  const p1 = new THREE.Vector2()
  const p2 = new THREE.Vector2()
  const p3 = new THREE.Vector2()
  const p4 = new THREE.Vector2()
  const p5 = new THREE.Vector2()
  const path: THREE.Vector2[] = Array.from({ length: NPTS }, () => new THREE.Vector2())
  function buildTape(rs: number, rt: number) {
    // supply (CW) → S1 (CCW) → S2 (CCW) → take-up (CW)
    tangent(cA, -rs, cS1, ROLL_R, p0, p1)
    tangent(cS1, ROLL_R, cS2, ROLL_R, p2, p3)
    tangent(cS2, ROLL_R, cB, -rt, p4, p5)
    let n = 0
    path[n++].copy(p0)
    const arc = (c: THREE.Vector2, from: THREE.Vector2, to: THREE.Vector2) => {
      const a0 = Math.atan2(from.y - c.y, from.x - c.x)
      let a1 = Math.atan2(to.y - c.y, to.x - c.x)
      while (a1 < a0) a1 += Math.PI * 2 // anticlockwise
      for (let i = 0; i < ARC; i++) {
        const a = a0 + ((a1 - a0) * i) / (ARC - 1)
        path[n++].set(c.x + Math.cos(a) * ROLL_R, c.y + Math.sin(a) * ROLL_R)
      }
    }
    arc(cS1, p1, p2)
    arc(cS2, p3, p4)
    path[n++].copy(p5)
    for (let i = 0; i < NPTS; i++) {
      const a = path[Math.max(0, i - 1)]
      const b = path[Math.min(NPTS - 1, i + 1)]
      let nx = -(b.y - a.y)
      let ny = b.x - a.x
      const l = Math.hypot(nx, ny) || 1
      nx /= l
      ny /= l
      const p = path[i]
      tapePos.set([p.x, p.y, TAPE_Z0 + 0.004, p.x, p.y, TAPE_Z1 - 0.004], i * 6)
      tapeNrm.set([nx, ny, 0, nx, ny, 0], i * 6)
    }
    tapeGeo.attributes.position.needsUpdate = true
    tapeGeo.attributes.normal.needsUpdate = true
  }

  /* ---------------- transport buttons + legends */
  const btnGeo = new RoundedBoxGeometry(0.44, 0.28, 0.16, 3, 0.05)
  const btnBase = ['#d8cdb6', '#d8cdb6', '#d8cdb6', '#e2d6bd', '#9c2e1f']
  const btnLamp = ['#ffb257', '#ffb257', '#ffe2b8', '#ffc98a', '#ff5a3c']
  const btnMats = btnBase.map(
    (c, i) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, emissive: new THREE.Color(btnLamp[i]), emissiveIntensity: 0 }),
  )
  const btns = BTN_X.map((x, i) => {
    const b = new THREE.Mesh(btnGeo, btnMats[i])
    b.position.set(x, CTRL_Y, 0.08)
    deck.add(b)
    return b
  })
  const legend = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 0.26),
    new THREE.MeshBasicMaterial({ map: legendMap(['REW', 'FF', 'STOP', 'PLAY', 'REC']), transparent: true, depthWrite: false }),
  )
  legend.position.set(0, CTRL_Y + 0.3, 0.004)
  deck.add(legend)

  /* ---------------- the counter: four drums, min:sec */
  const DRUM_R = 0.24
  const drumGeo = new THREE.CylinderGeometry(DRUM_R, DRUM_R, 0.2, 36, 1, true)
  {
    // swap u/v: the texture's x runs across the drum (left → right once the
    // axis is turned onto -x), its y round the drum
    const uv = drumGeo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getY(i), uv.getX(i))
    drumGeo.rotateZ(Math.PI / 2)
  }
  const drum10 = new THREE.MeshStandardMaterial({ color: '#ffffff', map: drumMap(10), roughness: 0.5 })
  const drum6 = new THREE.MeshStandardMaterial({ color: '#ffffff', map: drumMap(6), roughness: 0.5 })
  const DRUM_X = [-0.39, -0.17, 0.17, 0.39]
  const drums = DRUM_X.map((dx, i) => {
    const d = new THREE.Mesh(drumGeo, i === 2 ? drum6 : drum10)
    d.userData.dyn = true
    d.position.set(COUNTER_X + dx, CTRL_Y, 0.2 - DRUM_R)
    deck.add(d)
    return d
  })
  // the bezel: a black plate with a window round the drums
  {
    const s = new THREE.Shape()
    s.moveTo(-0.7, -0.22)
    s.lineTo(0.7, -0.22)
    s.lineTo(0.7, 0.22)
    s.lineTo(-0.7, 0.22)
    s.closePath()
    const w = new THREE.Path()
    w.moveTo(-0.52, -0.082)
    w.lineTo(-0.52, 0.082)
    w.lineTo(0.52, 0.082)
    w.lineTo(0.52, -0.082)
    w.closePath()
    s.holes.push(w)
    const bz = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 1 }), bezel)
    bz.position.set(COUNTER_X, CTRL_Y, 0.2)
    deck.add(bz)
    // the colon
    const dotGeo = new THREE.CircleGeometry(0.02, 10)
    const dotMat = new THREE.MeshBasicMaterial({ color: '#d9cfbd' })
    for (const y of [0.035, -0.035]) {
      const d = new THREE.Mesh(dotGeo, dotMat)
      d.position.set(COUNTER_X, CTRL_Y + y, 0.205)
      deck.add(d)
    }
    const rst = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 20)), chromeM)
    rst.position.set(COUNTER_X + 0.92, CTRL_Y, 0.08)
    deck.add(rst)
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.2), new THREE.MeshBasicMaterial({ map: wordMap('COUNTER', 22), transparent: true, depthWrite: false }))
    lab.position.set(COUNTER_X, CTRL_Y + 0.4, 0.004)
    deck.add(lab)
  }
  // the pilot jewel and a speed toggle on the right of the strip
  const jewelMat = glow('#ffab4a', 1.6)
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), jewelMat)
  jewel.position.set(2.62, CTRL_Y, 0.06)
  const jewelRing = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 20)), chromeM)
  jewelRing.position.set(2.62, CTRL_Y, 0.02)
  const toggle = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 10)), chromeM)
  toggle.position.set(3.3, CTRL_Y + 0.05, 0.16)
  toggle.rotation.x = 0.5
  const toggleNut = new THREE.Mesh(zAxis(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 6)), chromeM)
  toggleNut.position.set(3.3, CTRL_Y, 0.03)
  deck.add(jewel, jewelRing, toggle, toggleNut)
  // a strip of masking tape across the top of the plate, in marker
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.31),
    new THREE.MeshStandardMaterial({ map: tapeStripMap('GJP · Volume ONE'), transparent: true, roughness: 0.85, depthWrite: false }),
  )
  strip.position.set(0, 2.72, 0.006)
  strip.rotation.z = 0.012
  deck.add(strip)
  await yieldFn()

  /* ---------------- the meter bridge */
  const bridge = new THREE.Group()
  bridge.position.set(0, PLATE_H / 2 + 0.95, 0.12)
  bridge.rotation.x = 0.26
  deck.add(bridge)
  const housing = new THREE.Mesh(new RoundedBoxGeometry(PLATE_W, 1.72, 1.5, 2, 0.06), plate)
  housing.position.set(0, 0, -0.75)
  housing.castShadow = housing.receiveShadow = true
  bridge.add(housing)
  const faceW = 0.84
  const faceH = 0.63
  const faceMat = new THREE.MeshBasicMaterial({ map: vuFaceMap(), color: new THREE.Color('#ffe2b8') })
  const faceGeo = new THREE.PlaneGeometry(faceW, faceH)
  const bezelGeo = new RoundedBoxGeometry(0.97, 0.8, 0.08, 2, 0.03)
  const needleGeo = new THREE.BoxGeometry(0.011, 0.66, 0.004).translate(0, 0.33, 0)
  const needleMat = new THREE.MeshBasicMaterial({ color: '#150e0a' })
  const capMeterGeo = new RoundedBoxGeometry(0.3, 0.13, 0.03, 2, 0.02)
  const needles: THREE.Mesh[] = []
  for (let i = 0; i < METERS; i++) {
    const x = (i - (METERS - 1) / 2) * METER_PITCH
    const b = new THREE.Mesh(bezelGeo, bezel)
    b.position.set(x, 0.04, 0)
    const f = new THREE.Mesh(faceGeo, faceMat)
    f.position.set(x, 0.06, 0.045)
    const n = new THREE.Mesh(needleGeo, needleMat)
    n.userData.dyn = true
    n.position.set(x, 0.06 - faceH / 2 - VU_PIVOT * faceH, 0.052)
    const c = new THREE.Mesh(capMeterGeo, bezel)
    c.position.set(x, 0.06 - faceH / 2 + 0.03, 0.058)
    bridge.add(b, f, n, c)
    needles.push(n)
  }
  // channel numbers under the meters
  const chan = new THREE.Mesh(
    new THREE.PlaneGeometry(METERS * METER_PITCH, 0.2),
    new THREE.MeshBasicMaterial({ map: legendMap(['1', '2', '3', '4', '5', '6', '7', '8'], 30), transparent: true, depthWrite: false }),
  )
  chan.position.set(0, -0.56, 0.004)
  bridge.add(chan)
  // the meters' glow, thrown down onto the deck (one small warm point light)
  const vuLight = new THREE.PointLight('#ffb866', 0, 7, 2)
  vuLight.position.set(0, -0.2, 1.3)
  bridge.add(vuLight)
  await yieldFn()

  /* ---------------- the room: floor, side table */
  // the kit's planks, on a wide field that falls off to black round the corner
  // (no hard floor edge against the haze)
  const floor = stageFloor(160, 160)
  {
    const g = new THREE.PlaneGeometry(160, 160, 48, 48)
    scaleUv(g, 160 / 12, 160 / 12)
    const pos = g.attributes.position
    const col = new Float32Array(pos.count * 4)
    for (let i = 0; i < pos.count; i++) {
      // plane is XY before the floor's -90° x rotation: y here is -z in the world
      // lit round the front of the machine and the table; dark behind the
      // cabinet, where the lamp's cone would otherwise draw a horizon
      const x = (pos.getX(i) - 3) / 10
      const z = -pos.getY(i) - 2
      const d = Math.hypot(x, z / (z < 0 ? 4.5 : 8))
      const k = Math.max(0, Math.min(1, (1.35 - d) / 0.8))
      const v = k * k * (3 - 2 * k)
      col.set([v, v, v, Math.min(1, v * 1.6)], i * 4)
    }
    // rgba: the floor darkens AND fades out, so the room's haze shows through
    // its far edge (no horizon line)
    g.setAttribute('color', new THREE.BufferAttribute(col, 4))
    floor.geometry.dispose()
    floor.geometry = g
    // diffuse only: a glancing view of the far floor must not pick up the
    // room's reflection (the mask can't darken a specular sheen)
    ;(floor.material as THREE.Material).dispose()
    floor.material = new THREE.MeshLambertMaterial({ map: plankMap(), vertexColors: true, transparent: true, depthWrite: false })
    floor.renderOrder = -1
  }
  root.add(floor)
  const tableTop = new THREE.Mesh(new RoundedBoxGeometry(TABLE.x1 - TABLE.x0, 0.3, TABLE.z1 - TABLE.z0, 3, 0.08), tableWood)
  scaleUv(tableTop.geometry, 2, 1.4)
  tableTop.position.set((TABLE.x0 + TABLE.x1) / 2, TABLE.top - 0.15, (TABLE.z0 + TABLE.z1) / 2)
  tableTop.castShadow = tableTop.receiveShadow = true
  root.add(tableTop)
  const legGeo = new THREE.BoxGeometry(0.34, TABLE.top - 0.3, 0.34)
  for (const x of [TABLE.x0 + 0.35, TABLE.x1 - 0.35])
    for (const z of [TABLE.z0 + 0.35, TABLE.z1 - 0.35]) {
      const l = new THREE.Mesh(legGeo, tableWood)
      l.position.set(x, (TABLE.top - 0.3) / 2, z)
      l.castShadow = true
      root.add(l)
    }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(TABLE.x1 - TABLE.x0 - 0.5, 0.5, 0.1), tableWood)
  apron.position.set((TABLE.x0 + TABLE.x1) / 2, TABLE.top - 0.55, TABLE.z1 - 0.38)
  root.add(apron)

  /* ---------------- the tape box: lying open, the lid up with the track sheet */
  const box = new THREE.Group()
  box.position.set(BOX.x, TABLE.top, BOX.z)
  box.rotation.y = BOX.yaw
  root.add(box)
  const S = BOX.size
  const D = BOX.depth
  {
    const floorB = new THREE.Mesh(new THREE.BoxGeometry(S, 0.03, S), cardboardIn)
    floorB.position.y = 0.015
    floorB.receiveShadow = true
    box.add(floorB)
    const wallGeoX = new THREE.BoxGeometry(S, D, 0.04)
    const wallGeoZ = new THREE.BoxGeometry(0.04, D, S)
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(wallGeoX, cardboard)
      a.position.set(0, D / 2, (s * (S - 0.04)) / 2)
      const b = new THREE.Mesh(wallGeoZ, cardboard)
      b.position.set((s * (S - 0.04)) / 2, D / 2, 0)
      a.castShadow = b.castShadow = true
      a.receiveShadow = b.receiveShadow = true
      box.add(a, b)
    }
    // a round hub pad on the floor of the box (where the reel sat)
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.02, 40), cardboard)
    pad.position.y = 0.04
    box.add(pad)
  }
  const lid = new THREE.Group()
  lid.position.set(0, D, -S / 2)
  lid.rotation.x = LID_OPEN
  box.add(lid)
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(S + 0.04, 0.05, S + 0.04), cardboard)
    top.position.set(0, 0.025, S / 2)
    top.castShadow = top.receiveShadow = true
    lid.add(top)
    const rimX = new THREE.BoxGeometry(S + 0.04, 0.26, 0.04)
    const rimZ = new THREE.BoxGeometry(0.04, 0.26, S + 0.04)
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(rimX, cardboard)
      a.position.set(0, -0.13, S / 2 + (s * S) / 2)
      const b = new THREE.Mesh(rimZ, cardboard)
      b.position.set((s * S) / 2, -0.13, S / 2)
      a.receiveShadow = b.receiveShadow = true
      lid.add(a, b)
    }
  }
  const SHEET = 2.46
  const sheetMap = trackSheetMap()
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET, SHEET),
    // paper in lamplight: a touch of its own warmth so the hand stays legible at the edge of the pool
    new THREE.MeshStandardMaterial({ map: sheetMap, roughness: 0.82, emissive: new THREE.Color('#ffcf94'), emissiveMap: sheetMap, emissiveIntensity: 0.16 }),
  )
  sheet.rotation.x = Math.PI / 2
  sheet.position.set(0, -0.004, S / 2 + 0.02)
  sheet.receiveShadow = true
  lid.add(sheet)
  // two strips of masking tape holding it on
  const tapeBits = new THREE.MeshStandardMaterial({ color: '#e3d2a6', roughness: 0.8, transparent: true, opacity: 0.92 })
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), tapeBits)
    t.rotation.set(Math.PI / 2, 0, s * 0.6)
    t.position.set((s * SHEET) / 2 - s * 0.05, -0.007, S / 2 + 0.02 + SHEET / 2 - 0.05)
    lid.add(t)
  }
  const loopW = (SHEET_ROW_X[1] - SHEET_ROW_X[0]) * SHEET
  const loopMat = new THREE.MeshBasicMaterial({ map: loopMap(), transparent: true, depthWrite: false, opacity: 0 })
  const loop = new THREE.Mesh(new THREE.PlaneGeometry(loopW, 0.27), loopMat)
  loop.rotation.x = Math.PI / 2
  lid.add(loop)
  const sheetTopZ = S / 2 + 0.02 + SHEET / 2
  const loopZ = (row: number) => {
    const i = Math.max(0, Math.min(5, row))
    const i0 = Math.floor(i)
    const f = SHEET_ROWS[Math.min(5, i0)] + (SHEET_ROWS[Math.min(5, i0 + 1)] - SHEET_ROWS[Math.min(5, i0)]) * (i - i0)
    return sheetTopZ - f * SHEET
  }
  await yieldFn()

  /* ---------------- Like a Movie: a jewel case lying open */
  const jewelCase = new THREE.Group()
  jewelCase.position.set(JEWEL.x, TABLE.top, JEWEL.z)
  jewelCase.rotation.y = JEWEL.yaw
  root.add(jewelCase)
  const clear = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    depthWrite: false,
  })
  const trayBlack = new THREE.MeshStandardMaterial({ color: '#0d0c0c', roughness: 0.32, metalness: 0.1 })
  const CW = 1.42
  const CD = 1.24
  {
    // the tray half (right) and the lid half (left), hinged along x = 0
    const shellGeo = new RoundedBoxGeometry(CW, 0.05, CD, 2, 0.012)
    const trayShell = new THREE.Mesh(shellGeo, clear)
    trayShell.position.set(CW / 2, 0.025, 0)
    trayShell.renderOrder = 2
    const tray = new THREE.Mesh(new RoundedBoxGeometry(CW - 0.1, 0.035, CD - 0.04, 2, 0.01), trayBlack)
    tray.position.set(CW / 2 + 0.03, 0.02, 0)
    tray.receiveShadow = true
    const lidShell = new THREE.Mesh(shellGeo, clear)
    lidShell.position.set(-CW / 2, 0.025, 0)
    lidShell.renderOrder = 2
    const booklet = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: bookletMap(), roughness: 0.8 }))
    booklet.rotation.x = -Math.PI / 2
    booklet.position.set(-CW / 2 - 0.02, 0.012, 0)
    booklet.receiveShadow = true
    // the disc on the tray's hub
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.6, segs),
      new THREE.MeshPhysicalMaterial({ map: discMap(), roughness: 0.34, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.set(CW / 2 + 0.03, 0.041, 0)
    disc.receiveShadow = true
    const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16), trayBlack)
    rosette.position.set(CW / 2 + 0.03, 0.05, 0)
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, CD, 8).rotateX(Math.PI / 2), clear)
    hinge.position.set(0, 0.03, 0)
    jewelCase.add(tray, booklet, disc, rosette, trayShell, lidShell, hinge)
  }

  /* ---------------- the World Cafe Live audience cassette */
  const cass = new THREE.Group()
  cass.position.set(CASS.x, TABLE.top, CASS.z)
  cass.rotation.y = CASS.yaw
  root.add(cass)
  const CAW = 1.0
  const CAD = 0.635
  const hubs: THREE.Mesh[] = []
  {
    const shell = new THREE.Mesh(new RoundedBoxGeometry(CAW, 0.09, CAD, 2, 0.02), new THREE.MeshStandardMaterial({ color: '#151312', roughness: 0.4 }))
    shell.position.y = 0.045
    shell.castShadow = shell.receiveShadow = true
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(CAW, CAD),
      new THREE.MeshStandardMaterial({ map: cassetteMap(), roughness: 0.55, alphaTest: 0.5 }),
    )
    face.rotation.x = -Math.PI / 2
    face.position.y = 0.1
    face.receiveShadow = true
    const spool = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.4 })
    const hubWhite = new THREE.MeshStandardMaterial({ color: '#efe7d8', roughness: 0.4 })
    const hubGeo2 = (() => {
      const parts: THREE.BufferGeometry[] = [new THREE.RingGeometry(0.034, 0.058, 24).rotateX(-Math.PI / 2)]
      for (let k = 0; k < 6; k++) {
        const t = new THREE.PlaneGeometry(0.012, 0.018).rotateX(-Math.PI / 2)
        const a = (k * Math.PI) / 3
        t.rotateY(-a)
        t.translate(Math.sin(a) * 0.028, 0, Math.cos(a) * 0.028)
        parts.push(t)
      }
      return mergeGeometries(parts)
    })()
    const zOf = (f: number) => -CAD / 2 + f * CAD
    CASS_HUBS.forEach(([u, v], i) => {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(i === 0 ? 0.2 : 0.12, i === 0 ? 0.2 : 0.12, 0.004, 32), spool)
      sp.position.set((u - 0.5) * CAW, 0.093, zOf(v))
      const h = new THREE.Mesh(hubGeo2, hubWhite)
      h.userData.dyn = true
      h.position.set((u - 0.5) * CAW, 0.097, zOf(v))
      cass.add(sp, h)
      hubs.push(h)
    })
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(CAW * 0.52, CAD * 0.18),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.06, clearcoat: 0.4, depthWrite: false }),
    )
    glass.rotation.x = -Math.PI / 2
    glass.position.set(0, 0.103, zOf(0.46))
    cass.add(shell, face, glass)
  }

  /* ---------------- fewer draw calls: bake the static parts */
  for (const g of [root, deck, bridge, box, lid, jewelCase, cass, ...reels]) mergeStatic(g)

  /* ---------------- world anchors */
  root.updateMatrixWorld(true)
  const w = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z))
  const at = {
    deck: w(deck, 0, 0.3, 0.3),
    reelA: w(deck, -REEL_X, REEL_Y, 0.45),
    reelB: w(deck, REEL_X, REEL_Y, 0.45),
    heads: w(deck, 0, TAPE_Y, 0.45),
    counter: w(deck, COUNTER_X, CTRL_Y, 0.1),
    meters: w(bridge, 0, 0.06, 0.05),
    sheet: w(lid, 0, -0.01, sheetTopZ - SHEET / 2),
    box: w(box, 0, 0.3, 0),
    jewel: w(jewelCase, 0, 0.05, 0),
    cassette: w(cass, 0, 0.1, 0),
    table: new THREE.Vector3((TABLE.x0 + TABLE.x1) / 2, TABLE.top, (TABLE.z0 + TABLE.z1) / 2),
  }

  /* ---------------- controls */
  const packR: [number, number] = [PACK_MAX, PACK_MIN]
  let lastSec = NaN
  const prevDrum = [NaN, NaN, NaN, NaN]
  const setTape = (sec: number) => {
    const s = Math.max(0, sec)
    if (s === lastSec) return
    lastSec = s
    const f = Math.min(1, s / TAPE_SPAN)
    const rs = Math.sqrt(Math.max(PACK_MIN * PACK_MIN, PACK_MAX * PACK_MAX - f * (PACK_MAX * PACK_MAX - PACK_MIN * PACK_MIN)))
    const rt = Math.sqrt(Math.max(PACK_MIN * PACK_MIN, PACK_AREA - rs * rs))
    packR[0] = rs
    packR[1] = rt
    packs[0].scale.set(rs, rs, 1)
    packs[1].scale.set(rt, rt, 1)
    buildTape(rs, rt)
    // the counter: an odometer — each drum rolls over in the last tenth of its lower drum's cycle
    // the seconds drum steps (it rolls in the last quarter of each second, like
    // a Geneva-driven counter), so at rest every window shows a whole digit
    const fr = s - Math.floor(s)
    const step = Math.floor(s) + (fr > 0.75 ? ((fr - 0.75) / 0.25) ** 2 * (3 - 2 * ((fr - 0.75) / 0.25)) : 0)
    const ones = step % 10
    const roll = (x: number) => Math.max(0, x - 9) // 0..1 during the last unit
    const d0 = ones
    const tensRaw = Math.floor(s / 10)
    const d1 = (tensRaw % 6) + roll(ones)
    const minRaw = Math.floor(s / 60)
    const secIn = s % 60
    const secRoll = roll(ones) * (Math.floor(secIn / 10) === 5 ? 1 : 0)
    const d2 = (minRaw % 10) + secRoll
    const d3 = (Math.floor(minRaw / 10) % 10) + (minRaw % 10 === 9 ? secRoll : 0)
    const vals = [d3, d2, d1, d0]
    const ns = [10, 10, 6, 10]
    for (let i = 0; i < 4; i++) {
      if (vals[i] === prevDrum[i]) continue
      prevDrum[i] = vals[i]
      drums[i].rotation.x = (-2 * Math.PI * (vals[i] + 0.5)) / ns[i]
    }
  }
  setTape(0)

  return {
    root,
    deck,
    at,
    packs: packR,
    setTape,
    setReels(a, b) {
      reels[0].rotation.z = a
      reels[1].rotation.z = b
    },
    setVu(levels) {
      for (let i = 0; i < METERS; i++) needles[i].rotation.z = -(Math.max(0, Math.min(1.04, levels[i])) * 2 - 1) * VU_SWEEP
    },
    setLamps(v) {
      for (let i = 0; i < 5; i++) {
        const k = Math.max(0, Math.min(1, v[i]))
        btnMats[i].emissiveIntensity = k * (i === LAMP.stop ? 0.55 : 0.9)
        btns[i].position.z = 0.08 - k * 0.025
      }
    },
    setMarker(row, vis) {
      loop.position.set(0, -0.012, loopZ(row) - 0.01)
      loopMat.opacity = Math.max(0, Math.min(1, vis)) * 0.95
      loop.visible = vis > 0.004
    },
    setCassette(angle) {
      hubs[0].rotation.y = angle
      hubs[1].rotation.y = angle * 1.35
    },
    setBacklight(v) {
      faceMat.color.set('#ffe2b8').multiplyScalar(0.25 + 0.85 * v)
      jewelMat.color.set('#ffab4a').multiplyScalar(0.4 + 1.2 * v)
      vuLight.intensity = 5 * v
    },
  }
}
