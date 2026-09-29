import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { chrome, nickel, tolex } from '../../kit/materials'
import { scaleUv } from '../../kit/stage'
import { velvetBump, velvetMap } from './prints'

/*
 * THE CASE: a form-fit hard-shell guitar case lying open on the floor —
 * pebbled black vinyl outside, a crushed-velvet lining in deep burgundy
 * inside (MeshPhysical sheen: velvet catches the lamp at grazing angles),
 * an aluminium valance round the rim, four latches and a leather handle on
 * the near side, the accessory compartment under the neck with its lid
 * propped open. The lid is hinged along the far side and stands open behind
 * the body (~98°), its velvet facing the camera: flat keepsakes are taped
 * inside it.
 *
 * World frame (the case group sits at the origin): the case's length runs
 * along X (tail at -5.6, head end at +5.6), its width along Z (the near side,
 * the latches, toward +Z), up is +Y. Floor at y = 0.
 *
 *   onLid(x, z, lift) → a pose inside the open lid for a flat thing: x along
 *   the case, z the across-case coordinate it would have with the lid shut
 *   (z = 0 on the centre line, larger z = higher up the open lid).
 */

/** the outline's half-width along the case: (x, half width) control points */
const CTRL: [number, number][] = [
  [-5.48, 1.12],
  [-5.02, 1.92],
  [-4.25, 2.3],
  [-3.45, 2.28],
  [-2.85, 2.0],
  [-2.3, 1.74],
  [-1.72, 1.8],
  [-1.2, 1.86],
  [-0.72, 1.64],
  [-0.3, 1.12],
  [0.2, 0.86],
  [2.0, 0.8],
  [3.3, 0.78],
  [3.85, 0.92],
  [4.55, 1.05],
  [5.2, 0.98],
  [5.5, 0.6],
]
export const TAIL_X = -5.6
export const HEAD_X = 5.6
/** body shell height (the rim), lid depth, the padded floor inside */
export const BODY_H = 0.95
export const LID_H = 0.32
export const FLOOR_Y = 0.3
/** the lid's opening angle */
const OPEN = (98 * Math.PI) / 180
const WALL = 0.15

/** the outer outline in the XZ plane (as Vector2(x, z)), closed, CCW seen from above */
function outlinePoints(): THREE.Vector2[] {
  const pts: THREE.Vector3[] = [new THREE.Vector3(TAIL_X, 0, 0)]
  for (const [x, w] of CTRL) pts.push(new THREE.Vector3(x, 0, w))
  pts.push(new THREE.Vector3(HEAD_X, 0, 0))
  for (let i = CTRL.length - 1; i >= 0; i--) pts.push(new THREE.Vector3(CTRL[i][0], 0, -CTRL[i][1]))
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  return curve.getSpacedPoints(260).slice(0, -1).map(p => new THREE.Vector2(p.x, p.z))
}

/** offset a closed polyline inward by d (averaged normals) */
function inset(poly: THREE.Vector2[], d: number): THREE.Vector2[] {
  const n = poly.length
  // winding: signed area in (x, z)
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    area += a.x * b.y - b.x * a.y
  }
  const s = area > 0 ? 1 : -1
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n]
    const b = poly[(i + 1) % n]
    const t = new THREE.Vector2().subVectors(b, a).normalize()
    // left normal of the tangent; for a CCW polygon that points inward
    const nrm = new THREE.Vector2(-t.y, t.x).multiplyScalar(s)
    return new THREE.Vector2(p.x + nrm.x * d, p.y + nrm.y * d)
  })
}

/** a THREE.Shape in the XY plane from (x, z) points: shape y = -z, so after rotateX(-π/2) it lies back on (x, z) */
function shapeOf(poly: THREE.Vector2[]) {
  return new THREE.Shape(poly.map(p => new THREE.Vector2(p.x, -p.y)))
}
function pathOf(poly: THREE.Vector2[]) {
  return new THREE.Path(poly.map(p => new THREE.Vector2(p.x, -p.y)))
}

/** half-width of the outline at x (from the control points, linear) */
export function halfWidth(x: number) {
  const pts: [number, number][] = [[TAIL_X, 0], ...CTRL, [HEAD_X, 0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, w0] = pts[i]
    const [x1, w1] = pts[i + 1]
    if (x >= x0 && x <= x1) return w0 + ((w1 - w0) * (x - x0)) / (x1 - x0)
  }
  return 0
}

export interface Case {
  group: THREE.Group
  /** the lid (pivots on the hinge line); put lid things in lid.inside */
  lid: THREE.Group
  /** a frame inside the lid: x along the case, y = 0 at the velvet (toward the camera is -y), z across */
  inside: THREE.Group
  /** the accessory compartment (its open box); things placed inside it go here */
  compartment: THREE.Group
  /** the compartment's opening, world space (centre of the box's mouth) */
  compartmentAt: THREE.Vector3
  /** the velvet material (shared with keepsake props that want it) */
  velvet: THREE.MeshPhysicalMaterial
  /** points on the case's outside (body top + bottom edge, the open lid's rim), world space: for framing */
  silhouette: THREE.Vector3[]
  /** a pose inside the open lid (lid-local: position + quaternion for a PlaneGeometry facing the camera) */
  onLid(x: number, z: number, lift?: number, spin?: number): { position: THREE.Vector3; quaternion: THREE.Quaternion }
}

export function buildCase(mobile: boolean): Case {
  const group = new THREE.Group()
  group.name = 'case'
  const outer = outlinePoints()
  const inner = inset(outer, WALL)
  const lipLine = inset(outer, WALL - 0.02)
  const cvMap = velvetMap(mobile)
  const cvBump = velvetBump(mobile)
  const velvet = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: cvMap,
    roughness: 0.94,
    sheen: 1,
    sheenColor: new THREE.Color('#c8684e'),
    sheenRoughness: 0.4,
    bumpMap: cvBump,
    bumpScale: 0.5,
  })
  const velvetWall = velvet.clone()
  velvetWall.side = THREE.BackSide
  const shellMat = tolex()
  const rimMat = nickel(0.5)
  ;(rimMat as THREE.MeshStandardMaterial).color.set('#9a9286')

  /* ---- the body ---- */
  // shell: the outer outline with the inner as a hole (walls both sides + rim cap)
  {
    const sh = shapeOf(outer)
    sh.holes.push(pathOf(inner))
    const geo = new THREE.ExtrudeGeometry(sh, { depth: BODY_H - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.03, 0)
    scaleUv(geo, 0.6, 0.6)
    const m = new THREE.Mesh(geo, shellMat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
    // a rounded foot edge (vinyl rolled over the bottom)
    const base = new THREE.Mesh(tubeAlong(inset(outer, -0.01), 0.06, 0.06), shellMat)
    base.receiveShadow = true
    group.add(base)
  }
  // the padded floor
  {
    const geo = new THREE.ShapeGeometry(shapeOf(inner), 1)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, FLOOR_Y, 0)
    planarUv(geo, 0.72)
    const m = new THREE.Mesh(geo, velvet)
    m.receiveShadow = true
    group.add(m)
  }
  // velvet walls (inside the shell's inner wall) and a rolled velvet lip
  {
    const geo = wallGeometry(inset(outer, WALL + 0.012), FLOOR_Y, BODY_H - 0.05)
    const m = new THREE.Mesh(geo, velvetWall)
    m.receiveShadow = true
    group.add(m)
    const lip = new THREE.Mesh(tubeAlong(lipLine, BODY_H - 0.045, 0.055), velvet)
    lip.receiveShadow = true
    group.add(lip)
  }
  // the aluminium valance round the rim
  {
    const v = new THREE.Mesh(tubeAlong(inset(outer, -0.005), BODY_H - 0.005, 0.03), rimMat)
    group.add(v)
  }

  /* ---- the accessory compartment (under the neck, by the body) ---- */
  const compartment = new THREE.Group()
  compartment.name = 'compartment'
  const cx0 = 0.35
  const cx1 = 2.05
  const cw = Math.min(halfWidth(cx0), halfWidth(cx1)) - WALL - 0.02
  const cTop = 0.66
  {
    // four velvet walls + a dark floor, open on top
    const len = cx1 - cx0
    const wallT = 0.05
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), velvet)
      m.position.set(x, y, z)
      m.receiveShadow = true
      compartment.add(m)
      return m
    }
    const hgt = cTop - FLOOR_Y
    const midX = (cx0 + cx1) / 2
    box(wallT, hgt, cw * 2, cx0, FLOOR_Y + hgt / 2, 0)
    box(wallT, hgt, cw * 2, cx1, FLOOR_Y + hgt / 2, 0)
    // the lid: hinged on the tail-side wall, shut (a road map lies across it)
    const lidMesh = new THREE.Mesh(new RoundedBoxGeometry(len, 0.05, cw * 2 - 0.02, 2, 0.02), velvet)
    const pivot = new THREE.Group()
    pivot.position.set(cx0, cTop, 0)
    lidMesh.position.set(len / 2, 0.025, 0)
    pivot.add(lidMesh)
    pivot.rotation.z = 0
    lidMesh.castShadow = true
    lidMesh.receiveShadow = true
    compartment.add(pivot)
    // a ribbon pull on the lid
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.3), new THREE.MeshStandardMaterial({ color: '#c9a060', roughness: 0.7, side: THREE.DoubleSide }))
    tab.position.set(len + 0.01, -0.1, 0.3)
    tab.rotation.set(0, Math.PI / 2, 0)
    pivot.add(tab)
    // the dark inside
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(len, cw * 2), new THREE.MeshStandardMaterial({ color: '#170606', roughness: 0.95 }))
    pit.rotation.x = -Math.PI / 2
    pit.position.set(midX, FLOOR_Y + 0.005, 0)
    compartment.add(pit)
  }
  group.add(compartment)
  const compartmentAt = new THREE.Vector3((cx0 + cx1) / 2, cTop, 0)

  // the neck cradle at the head end: a padded block
  {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.34, 1.3, 3, 0.1), velvet)
    m.position.set(3.25, FLOOR_Y + 0.14, 0)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }

  /* ---- hardware on the near side ---- */
  {
    const latchMat = chrome(0.36)
    latchMat.color.set('#b8b4ac')
    const baseGeo = new RoundedBoxGeometry(0.34, 0.26, 0.07, 2, 0.02)
    const clasp = new RoundedBoxGeometry(0.22, 0.18, 0.05, 2, 0.02)
    for (const x of [-4.4, -1.6, 1.4, 4.4]) {
      const w = halfWidth(x)
      const g = new THREE.Group()
      const b = new THREE.Mesh(baseGeo, latchMat)
      const c = new THREE.Mesh(clasp, latchMat)
      c.position.set(0, 0.02, 0.05)
      c.rotation.x = -0.5
      g.add(b, c)
      // sit on the side wall, facing out (+z), turned to the wall's slope
      const dx = 0.12
      const slope = Math.atan2(halfWidth(x + dx) - halfWidth(x - dx), 2 * dx)
      g.position.set(x, BODY_H - 0.16, w + 0.05)
      g.rotation.y = -slope
      group.add(g)
    }
    // the handle: a leather strap on two chrome loops, near side at the balance point
    const hx = -0.9
    const hw = halfWidth(hx) + 0.1
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.06, 10, 28, Math.PI).scale(1, 0.55, 1.6),
      new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.55 }),
    )
    strap.rotation.set(Math.PI / 2 + 0.4, 0, 0)
    strap.position.set(hx, BODY_H - 0.34, hw + 0.06)
    strap.castShadow = true
    group.add(strap)
  }

  /* ---- the lid ---- */
  const zh = -(2.3 + 0.03) // the hinge line (far side)
  const lid = new THREE.Group()
  lid.name = 'lid'
  lid.position.set(0, BODY_H, zh)
  lid.rotation.x = -OPEN
  group.add(lid)
  // lid geometry built in the CLOSED pose (y from 0 up to LID_H over the body), relative to the hinge
  const inLid = new THREE.Group()
  inLid.position.set(0, 0, -zh)
  lid.add(inLid)
  {
    const sh = shapeOf(outer)
    sh.holes.push(pathOf(inner))
    const geo = new THREE.ExtrudeGeometry(sh, { depth: LID_H - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.03, 0)
    scaleUv(geo, 0.6, 0.6)
    const m = new THREE.Mesh(geo, shellMat)
    m.castShadow = true
    m.receiveShadow = true
    inLid.add(m)
    // the lid's outer skin
    const cap = new THREE.ShapeGeometry(shapeOf(outer), 1)
    cap.rotateX(-Math.PI / 2)
    cap.translate(0, LID_H, 0)
    const capM = new THREE.Mesh(cap, shellMat)
    capM.castShadow = true
    inLid.add(capM)
    // the velvet inside the lid (faces down when shut → toward the camera when open)
    const vel = new THREE.ShapeGeometry(shapeOf(inner), 1)
    vel.rotateX(Math.PI / 2)
    // rotateX(+π/2) mirrors z: flip back so it matches the outline
    vel.scale(1, 1, -1)
    vel.translate(0, LID_H - 0.08, 0)
    planarUv(vel, 0.72)
    fixWinding(vel)
    const vm = new THREE.Mesh(vel, velvet)
    vm.receiveShadow = true
    inLid.add(vm)
    const wall = wallGeometry(inset(outer, WALL + 0.012), 0.05, LID_H - 0.08)
    const wm = new THREE.Mesh(wall, velvetWall)
    wm.receiveShadow = true
    inLid.add(wm)
    const lip = new THREE.Mesh(tubeAlong(lipLine, 0.045, 0.05), velvet)
    inLid.add(lip)
    const v = new THREE.Mesh(tubeAlong(inset(outer, -0.005), 0.005, 0.03), rimMat)
    inLid.add(v)
  }
  // the lid's inside frame: at the velvet surface, facing -y (toward the camera once open)
  const inside = new THREE.Group()
  inside.position.set(0, LID_H - 0.08, 0)
  inLid.add(inside)

  // hinges (far side, behind: mostly hidden)
  {
    const hMat = chrome(0.25)
    for (const x of [-3.6, -1.4]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10).rotateZ(Math.PI / 2), hMat)
      h.position.set(x, BODY_H, zh)
      group.add(h)
    }
  }

  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
  group.updateMatrixWorld(true)
  const silhouette: THREE.Vector3[] = []
  for (let i = 0; i < outer.length; i += 8) {
    const p = outer[i]
    silhouette.push(new THREE.Vector3(p.x, 0, p.y), new THREE.Vector3(p.x, BODY_H, p.y))
    silhouette.push(new THREE.Vector3(p.x, LID_H, p.y).applyMatrix4(inLid.matrixWorld))
  }
  return {
    silhouette,
    group,
    lid,
    inside,
    compartment,
    compartmentAt,
    velvet,
    onLid(x, z, lift = 0.004, spin = 0) {
      // in `inside`: the velvet is at y = 0, the camera side is -y; a PlaneGeometry
      // rotated +π/2 about x faces -y with its +y (texture up) along +z (up the open lid)
      const q = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin))
      return { position: new THREE.Vector3(x, -lift, z), quaternion: q }
    },
  }
}

/** a thin tube along a closed (x, z) polyline at height y */
function tubeAlong(poly: THREE.Vector2[], y: number, r: number) {
  const pts = poly.map(p => new THREE.Vector3(p.x, y, p.y))
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  return new THREE.TubeGeometry(curve, poly.length, r, 8, true)
}

/** vertical walls along a closed (x, z) polyline from y0 to y1 (normals outward; use BackSide to see them from inside) */
function wallGeometry(poly: THREE.Vector2[], y0: number, y1: number) {
  const n = poly.length
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let run = 0
  for (let i = 0; i <= n; i++) {
    const p = poly[i % n]
    if (i > 0) run += p.distanceTo(poly[(i - 1) % n])
    pos.push(p.x, y0, p.y, p.x, y1, p.y)
    uv.push(run * 0.72, 0, run * 0.72, (y1 - y0) * 0.72)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** planar UVs from world x/z (a tile every 1/k units) */
function planarUv(geo: THREE.BufferGeometry, k: number) {
  const p = geo.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * k
    uv[i * 2 + 1] = p.getZ(i) * k
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** after a mirroring scale the triangles face the other way: swap two indices per triangle */
function fixWinding(geo: THREE.BufferGeometry) {
  const idx = geo.index
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, b)
    }
    idx.needsUpdate = true
  }
  geo.computeVertexNormals()
}
