import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { rng } from '../../core/math'
import { FONT, chrome, rubber, tile } from '../../kit/materials'
import { cable, gaffer, scaleUv } from '../../kit/stage'

/*
 * THE CORNER STAGE — the hero's props (1 unit = 10 cm), all generic shapes,
 * no makers' marks:
 *
 *  - buildStand: a tubular guitar stand fitted to the acoustic's own
 *    transform (a U-frame behind the body, rubber-sleeved cradle arms under
 *    the lower bout, a neck yoke, a hinged rear leg).
 *  - buildStool: a wooden bar stool (a dished round seat, four splayed legs,
 *    a ring of rungs for the feet).
 *  - buildMicStand: a tripod boom stand, a dynamic vocal mic in its clip at
 *    the tip of the boom, the XLR cable looped down the pole to the floor.
 *  - buildFloorLamp: a brass floor lamp with a warm drum shade (it glows).
 *  - buildRug: a worn oriental rug (a small canvas tile, rust / cream / brown).
 *  - buildFloor: warm stained oak boards falling away into the dark.
 *  - buildSetlist: a handwritten setlist taped to the boards.
 *
 * Candidates for the kit (a stool and a boom-stand mic are shared by the
 * band / gear / contact chapters) — see the hero's coreChangeRequests.
 */

/* ------------------------------------------------------------------ helpers */

const Y = new THREE.Vector3(0, 1, 0)

/** a cylinder from a to b (radius ra at a, rb at b) */
function rod(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb = ra, seg = 12) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, false)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3().subVectors(b, a).normalize()))
  const m = a.clone().lerp(b, 0.5)
  g.translate(m.x, m.y, m.z)
  return g
}

/** a tube along a smooth curve */
function tubeAlong(pts: THREE.Vector3[], r: number, seg = 32, radial = 10) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seg, r, radial, false)
}

/** merge geometries that may differ in attributes (keeps position / normal / uv) */
function merge(geos: THREE.BufferGeometry[]) {
  const clean = geos.map(g => {
    const n = g.index ? g.toNonIndexed() : g
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', n.getAttribute('position'))
    if (!n.getAttribute('normal')) n.computeVertexNormals()
    out.setAttribute('normal', n.getAttribute('normal'))
    const uv = n.getAttribute('uv')
    out.setAttribute('uv', uv ?? new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2))
    return out
  })
  const m = mergeGeometries(clean)
  for (const g of geos) g.dispose()
  return m
}

/* ------------------------------------------------------------------ wood */

/** a small wood tile: long grain along v (tile y), tones around `base` */
function woodTile(key: string, base: [number, number, number], seed: number) {
  return tile(key, 128, 512, (g, w, h) => {
    const r = rng(seed)
    const img = g.createImageData(w, h)
    const phase = Array.from({ length: 6 }, () => r() * 6.28)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        // growth rings sliced long: wavy stripes along v
        const wav = u * 18 + Math.sin(v * 6.283 * 2 + phase[0]) * 0.9 + Math.sin(v * 6.283 * 5 + u * 3 + phase[1]) * 0.25
        const ring = Math.pow(0.5 + 0.5 * Math.sin(wav * 6.283), 3)
        const fine = 0.5 + 0.5 * Math.sin(u * 260 + Math.sin(v * 40 + phase[2]) * 2)
        const k = 1 - 0.22 * ring - 0.06 * fine
        const i = (y * w + x) * 4
        img.data[i] = Math.min(255, base[0] * k)
        img.data[i + 1] = Math.min(255, base[1] * k)
        img.data[i + 2] = Math.min(255, base[2] * k)
        img.data[i + 3] = 255
      }
    g.putImageData(img, 0, 0)
  })
}

/* ------------------------------------------------------------------ stand */

export interface StandOptions {
  /** guitar-local x of the neck yoke */
  yokeX: number
  /** guitar-local x where the cradle arms meet the lower bout */
  cradleX: number
  /** guitar-local y of the two cradle arms */
  cradleY?: number
  /** half-width of the U-frame (guitar-local y) */
  frameY?: number
  /** guitar-local z of the frame behind the body */
  frameZ?: number
  r?: number
}

/**
 * A tubular stand, built in the space the guitar's transform `M` maps into
 * (floor at y = 0 there): cradles under the lower bout, the yoke under the
 * neck, feet on the floor. Two merged meshes (tube + rubber).
 */
export function buildStand(M: THREE.Matrix4, o: StandOptions) {
  const group = new THREE.Group()
  group.name = 'stand'
  const r = o.r ?? 0.07
  const cy = o.cradleY ?? 0.78
  const fy = o.frameY ?? 0.5
  const fz = o.frameZ ?? -1.3
  const X = o.yokeX
  const L = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M)
  // guitar-local x where a line along the neck at (y, z) meets the floor
  const floorX = (y: number, z: number) => {
    const a = L(0, y, z).y
    const b = L(1, y, z).y
    return -a / (b - a)
  }
  const tubes: THREE.BufferGeometry[] = []
  const rubbers: THREE.BufferGeometry[] = []
  const foot = (p: THREE.Vector3) => rubbers.push(rod(p.clone().setY(0), p.clone().setY(0.12), r * 1.5, r * 1.35, 14))

  // the front U-frame: feet on the floor, up behind the body, closed at the crown
  const top = X - 0.7
  const fx0 = floorX(fy, fz)
  for (const s of [1, -1]) {
    const f = L(fx0, s * fy * 1.5, fz)
    f.y = 0.06
    tubes.push(tubeAlong([f, L(fx0 + 0.8, s * fy * 1.2, fz), L(o.cradleX - 0.3, s * fy, fz), L(top - 0.6, s * fy, fz), L(top - 0.14, s * fy * 0.55, fz), L(top, 0, fz)], r, 56))
    foot(f)
  }
  // the yoke's stem: from the crown forward to the back of the neck
  const neckBack = -0.3
  tubes.push(tubeAlong([L(top, 0, fz), L(top + 0.3, 0, fz + 0.18), L(X - 0.1, 0, neckBack - 0.22), L(X - 0.02, 0, neckBack - 0.05)], r * 0.9, 24))
  // the yoke: a rubber-sleeved U round the back of the neck
  {
    const w = 0.3
    rubbers.push(
      tubeAlong(
        [L(X, w, 0.04), L(X, w, -0.14), L(X, w * 0.72, neckBack + 0.02), L(X, 0, neckBack - 0.04), L(X, -w * 0.72, neckBack + 0.02), L(X, -w, -0.14), L(X, -w, 0.04)],
        r * 0.95,
        40,
      ),
    )
    for (const s of [1, -1]) {
      const g = new THREE.SphereGeometry(r * 1.02, 12, 8)
      const p = L(X, s * w, 0.04)
      g.translate(p.x, p.y, p.z)
      rubbers.push(g)
    }
  }
  // the rear leg: hinged under the crown, splayed back to the floor
  {
    const hx = top - 1.5
    const back = new THREE.Vector3().subVectors(L(0, 0, -1), L(0, 0, 0)).setY(0).normalize()
    const side = new THREE.Vector3().subVectors(L(0, 1, 0), L(0, 0, 0)).setY(0).normalize()
    for (const s of [1, -1]) {
      const h = L(hx, s * fy * 0.9, fz - 0.1)
      const f = h.clone().addScaledVector(back, 4.2).addScaledVector(side, s * 0.9)
      f.y = 0.06
      const mid = h.clone().lerp(f, 0.5).addScaledVector(back, 0.12)
      tubes.push(tubeAlong([h, mid, f], r, 16))
      foot(f)
    }
    tubes.push(tubeAlong([L(hx, fy * 0.98, fz - 0.06), L(hx, 0, fz - 0.08), L(hx, -fy * 0.98, fz - 0.06)], r * 0.8, 6))
  }
  // the cradle arms: off the frame, forward under the bottom edge, a lip in front
  for (const s of [1, -1]) {
    const y = s * cy
    const u = o.cradleX
    tubes.push(tubeAlong([L(u - 0.35, s * fy, fz), L(u - 0.22, y * 0.95, fz + 0.2), L(u - 0.02, y, -0.9), L(u, y, -0.2), L(u + 0.04, y, 0.1), L(u + 0.32, y, 0.22)], r, 36))
    rubbers.push(tubeAlong([L(u - 0.01, y, -1.12), L(u, y, -0.5), L(u + 0.01, y, 0.06), L(u + 0.24, y, 0.2)], r * 1.45, 24))
  }
  const tubeMat = new THREE.MeshStandardMaterial({ color: '#15110f', roughness: 0.36, metalness: 0.5 })
  const rubberMat = new THREE.MeshStandardMaterial({ color: '#1c1715', roughness: 0.8 })
  for (const [geos, mat] of [
    [tubes, tubeMat],
    [rubbers, rubberMat],
  ] as const) {
    const m = new THREE.Mesh(merge(geos), mat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }
  return group
}

/* ------------------------------------------------------------------ stool */

/** A wooden bar stool: seat top at `seatH`. Origin on the floor at its centre. */
export function buildStool(seatH = 7.3) {
  const group = new THREE.Group()
  group.name = 'stool'
  const wood = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: woodTile('gjp-hero-oak', [150, 92, 50], 5),
    roughness: 0.5,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
  })
  // the seat: a dished disc with a rounded edge (lathe profile)
  const R = 1.72
  const T = 0.38
  const prof = [
    [0, T - 0.035],
    [0.9, T - 0.03],
    [1.4, T - 0.012],
    [R - 0.1, T],
    [R - 0.02, T - 0.06],
    [R, T - 0.16],
    [R - 0.02, 0.07],
    [R - 0.1, 0.01],
    [R - 0.25, 0],
    [0, 0],
  ].map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y))
  const seatGeo = new THREE.LatheGeometry(prof, 48)
  scaleUv(seatGeo, 3, 0.4)
  const seat = new THREE.Mesh(seatGeo, wood)
  seat.position.y = seatH - T
  seat.castShadow = true
  seat.receiveShadow = true
  group.add(seat)
  // legs + rungs, merged
  const parts: THREE.BufferGeometry[] = []
  const legTop = (a: number) => new THREE.Vector3(Math.cos(a) * 1.02, seatH - T, Math.sin(a) * 1.02)
  const legBot = (a: number) => new THREE.Vector3(Math.cos(a) * 1.72, 0, Math.sin(a) * 1.72)
  const at = (a: number, y: number) => {
    const t = legTop(a)
    const b = legBot(a)
    return b.clone().lerp(t, y / (seatH - T))
  }
  const angles = [0.25, 0.25 + Math.PI / 2, 0.25 + Math.PI, 0.25 + (3 * Math.PI) / 2]
  for (const a of angles) {
    const g = rod(legBot(a), legTop(a), 0.13, 0.17, 12)
    scaleUv(g, 1, 3)
    parts.push(g)
  }
  // an apron ring under the seat (a thin torus) and the foot rungs
  const apron = new THREE.TorusGeometry(1.08, 0.08, 8, 40).rotateX(Math.PI / 2)
  apron.translate(0, seatH - T - 0.35, 0)
  parts.push(apron)
  for (let k = 0; k < 4; k++) {
    const a = angles[k]
    const b = angles[(k + 1) % 4]
    const h = k % 2 ? 2.5 : 2.2
    parts.push(rod(at(a, h), at(b, h), 0.075, 0.075, 10))
  }
  const legs = new THREE.Mesh(merge(parts), wood)
  legs.castShadow = true
  legs.receiveShadow = true
  group.add(legs)
  return group
}

/* ------------------------------------------------------------------ mic stand */

/** a fine woven mesh for the mic grille */
function grilleMesh() {
  return tile('gjp-hero-grille', 64, 64, (g, w, h) => {
    g.fillStyle = '#1a1a1c'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#c9cbd0'
    g.lineWidth = 1.6
    const n = 8
    for (let i = -n; i <= 2 * n; i++) {
      g.beginPath()
      g.moveTo((i * w) / n, 0)
      g.lineTo((i * w) / n + h, h)
      g.stroke()
      g.beginPath()
      g.moveTo((i * w) / n, 0)
      g.lineTo((i * w) / n - h, h)
      g.stroke()
    }
  })
}

export interface MicStand {
  group: THREE.Group
  /** world-space centre of the mic's grille (in the stand's parent space) */
  grille: THREE.Vector3
  /** the clutch at the top of the pole */
  clutch: THREE.Vector3
}

/**
 * A tripod boom stand at `base` (floor), its boom reaching toward `grille`
 * (where the mic's ball should be) with the mic aimed at `aim` (a mouth).
 */
export function buildMicStand(base: THREE.Vector3, grilleAt: THREE.Vector3, aim: THREE.Vector3, poleH = 10.6): MicStand {
  const group = new THREE.Group()
  group.name = 'mic-stand'
  const black = new THREE.MeshStandardMaterial({ color: '#141212', roughness: 0.42, metalness: 0.45 })
  const ch = chrome(0.14)
  const tubes: THREE.BufferGeometry[] = []
  const metal: THREE.BufferGeometry[] = []
  const rub: THREE.BufferGeometry[] = []

  // tripod: a collar on the pole, three legs down and out
  const collarY = 2.3
  const b = base.clone().setY(0)
  for (let k = 0; k < 3; k++) {
    const a = 0.5 + (k * Math.PI * 2) / 3
    const f = b.clone().add(new THREE.Vector3(Math.cos(a) * 3.1, 0.08, Math.sin(a) * 3.1))
    const c = b.clone().add(new THREE.Vector3(Math.cos(a) * 0.14, collarY, Math.sin(a) * 0.14))
    tubes.push(tubeAlong([c, c.clone().lerp(f, 0.5).add(new THREE.Vector3(0, 0.25, 0)), f], 0.075, 20, 8))
    rub.push(rod(f.clone().setY(0), f.clone().setY(0.1), 0.13, 0.11, 10))
    // a brace from the leg to the lower pole
    tubes.push(rod(c.clone().lerp(f, 0.45).add(new THREE.Vector3(0, 0.18, 0)), b.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.035, 0.035, 6))
  }
  metal.push(rod(b.clone().add(new THREE.Vector3(0, collarY - 0.35, 0)), b.clone().add(new THREE.Vector3(0, collarY + 0.25, 0)), 0.2, 0.2, 16))
  // the pole: a fat lower tube, a clutch, a slim upper tube
  const clutchY = 6.4
  tubes.push(rod(b.clone().add(new THREE.Vector3(0, 0.9, 0)), b.clone().add(new THREE.Vector3(0, clutchY, 0)), 0.12, 0.12, 14))
  tubes.push(rod(b.clone().add(new THREE.Vector3(0, clutchY - 0.12, 0)), b.clone().add(new THREE.Vector3(0, clutchY + 0.22, 0)), 0.17, 0.15, 16))
  tubes.push(rod(b.clone().add(new THREE.Vector3(0, clutchY, 0)), b.clone().add(new THREE.Vector3(0, poleH, 0)), 0.085, 0.085, 12))
  // the boom clutch: a drum with a T-knob
  const clutch = b.clone().add(new THREE.Vector3(0, poleH + 0.12, 0))
  const boomDir = new THREE.Vector3()
  // the boom runs from the clutch to just behind the mic's clip
  const axis = new THREE.Vector3().subVectors(grilleAt, aim).normalize() // grille → tail, away from the mouth
  const clip = grilleAt.clone().addScaledVector(axis, 0.75)
  const tip = clip.clone().addScaledVector(axis, 0.28)
  boomDir.subVectors(tip, clutch).normalize()
  const boomEnd = tip
  const boomBack = clutch.clone().addScaledVector(boomDir, -2.3)
  tubes.push(rod(clutch.clone().add(new THREE.Vector3(0, -0.18, 0)), clutch.clone().add(new THREE.Vector3(0, 0.18, 0)), 0.2, 0.2, 16))
  {
    // T-knob off the side of the clutch, perpendicular to the boom
    const side = new THREE.Vector3().crossVectors(boomDir, Y).normalize()
    const k0 = clutch.clone().addScaledVector(side, 0.2)
    const k1 = clutch.clone().addScaledVector(side, 0.55)
    tubes.push(rod(k0, k1, 0.04, 0.04, 8))
    tubes.push(rod(k1.clone().add(new THREE.Vector3(0, -0.22, 0)), k1.clone().add(new THREE.Vector3(0, 0.22, 0)), 0.07, 0.07, 10))
  }
  tubes.push(rod(boomBack, boomEnd, 0.07, 0.06, 12))
  // the counterweight on the back end
  tubes.push(rod(boomBack.clone().addScaledVector(boomDir, -0.1), boomBack.clone().addScaledVector(boomDir, 0.55), 0.2, 0.2, 18))
  // the clip: a short cradle from the boom tip to the handle
  tubes.push(rod(tip, clip, 0.07, 0.09, 10))

  const tm = new THREE.Mesh(merge(tubes), black)
  const mm = new THREE.Mesh(merge(metal), ch)
  const rm = new THREE.Mesh(merge(rub), rubber())
  for (const m of [tm, mm]) {
    m.castShadow = true
    m.receiveShadow = true
  }
  group.add(tm, mm, rm)

  // the mic: a tapered black handle, a chrome ring, a woven ball grille
  const mic = new THREE.Group()
  {
    const handle = new THREE.LatheGeometry(
      [
        [0.0001, 1.62],
        [0.08, 1.62],
        [0.085, 1.5],
        [0.1, 0.9],
        [0.128, 0.42],
        [0.14, 0.34],
        [0.0001, 0.34],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      28,
    )
    const hm = new THREE.Mesh(handle, new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.38, metalness: 0.35 }))
    hm.castShadow = true
    mic.add(hm)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.15, 0.08, 28), ch)
    ring.position.y = 0.32
    mic.add(ring)
    const gg = new THREE.SphereGeometry(0.27, 32, 20)
    gg.scale(1, 0.92, 1)
    const grille = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: '#d8dade', map: grilleMesh(), metalness: 0.85, roughness: 0.42 }))
    grille.position.y = 0.1
    grille.castShadow = true
    mic.add(grille)
    // the XLR end
    const xlr = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 18), ch)
    xlr.position.y = 1.7
    mic.add(xlr)
  }
  // local +Y of the mic runs grille → tail; place the grille's centre at grilleAt
  mic.quaternion.setFromUnitVectors(Y, axis)
  mic.position.copy(grilleAt).addScaledVector(axis, -0.1)
  group.add(mic)

  // the XLR cable: from the tail, a loose loop under the boom, down the pole, off across the floor
  {
    const tail = grilleAt.clone().addScaledVector(axis, 1.85)
    const below = (p: THREE.Vector3, dy: number) => p.clone().add(new THREE.Vector3(0, dy, 0))
    const alongBoom = (t: number) => boomEnd.clone().lerp(clutch, t)
    const pole = (y: number, a: number) => b.clone().add(new THREE.Vector3(Math.cos(a) * 0.28, y, Math.sin(a) * 0.28))
    const away = new THREE.Vector3().subVectors(b, grilleAt).setY(0).normalize()
    const route = [
      tail,
      tail.clone().addScaledVector(axis, 0.35).add(new THREE.Vector3(0, -0.2, 0)),
      below(alongBoom(0.3), -0.9),
      below(alongBoom(0.72), -1.2),
      pole(poleH - 1.8, 0.4),
      pole(8.4, 2.4),
      pole(6.9, 4.4),
      pole(4.8, 0.9),
      pole(3.0, 3.0),
      b.clone().add(new THREE.Vector3(0.5, 0.4, -0.2)).addScaledVector(away, 0.6),
      b.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(away, 2.2),
      b.clone().add(new THREE.Vector3(-1.4, 0.05, -0.6)).addScaledVector(away, 5.4),
      b.clone().add(new THREE.Vector3(-0.5, 0.05, -2.6)).addScaledVector(away, 9),
    ]
    const cord = cable(route, 0.045)
    group.add(cord)
  }
  return { group, grille: grilleAt.clone(), clutch }
}

/* ------------------------------------------------------------------ floor lamp */

export interface FloorLamp {
  group: THREE.Group
  /** where the bulb is (for a light) */
  bulb: THREE.Vector3
  /** 0..1 how warm / lit the shade is */
  setGlow(v: number): void
}

/** A brass floor lamp with a fabric drum shade. Origin on the floor. */
export function buildFloorLamp(height = 14.4): FloorLamp {
  const group = new THREE.Group()
  group.name = 'floor-lamp'
  const brass = new THREE.MeshStandardMaterial({ color: '#b98a4a', metalness: 1, roughness: 0.38 })
  const parts: THREE.BufferGeometry[] = []
  parts.push(new THREE.CylinderGeometry(1.05, 1.18, 0.16, 36).translate(0, 0.08, 0))
  parts.push(new THREE.CylinderGeometry(0.28, 0.5, 0.3, 24).translate(0, 0.3, 0))
  parts.push(new THREE.CylinderGeometry(0.055, 0.055, height - 1.2, 10).translate(0, (height - 1.2) / 2 + 0.3, 0))
  // the socket under the shade + the harp
  parts.push(new THREE.CylinderGeometry(0.16, 0.12, 0.5, 16).translate(0, height - 1.0, 0))
  const base = new THREE.Mesh(merge(parts), brass)
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)
  // the shade: fabric lit from inside — brighter toward its lower rim, a faint weave
  const shadeTex = tile(
    'gjp-hero-shade',
    64,
    256,
    (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h)
      gr.addColorStop(0, '#6a3a18')
      gr.addColorStop(0.35, '#d08a44')
      gr.addColorStop(0.8, '#ffc27a')
      gr.addColorStop(1, '#ffdca8')
      g.fillStyle = gr
      g.fillRect(0, 0, w, h)
      g.globalAlpha = 0.08
      g.fillStyle = '#000'
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1)
      for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h)
    },
    { repeat: false },
  )
  const shadeMat = new THREE.MeshStandardMaterial({
    color: '#e4c8a0',
    emissive: new THREE.Color('#ffb870'),
    emissiveMap: shadeTex,
    emissiveIntensity: 1,
    roughness: 0.92,
    side: THREE.DoubleSide,
  })
  const shadeH = 2.0
  const shadeGeo = new THREE.CylinderGeometry(1.2, 1.55, shadeH, 48, 1, true)
  // the gradient runs down the shade: v = 1 at the top → flip so the rim is bright
  const uv = shadeGeo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
  const shade = new THREE.Mesh(shadeGeo, shadeMat)
  shade.position.y = height - 0.55
  group.add(shade)
  // the diffuser disc seen from below (hot)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd49a').multiplyScalar(2.2), toneMapped: false }))
  disc.position.y = height - 0.55 - shadeH / 2 + 0.25
  group.add(disc)
  const bulb = new THREE.Vector3(0, height - 0.8, 0)
  const discMat = disc.material as THREE.MeshBasicMaterial
  return {
    group,
    bulb,
    setGlow(v) {
      shadeMat.emissiveIntensity = 0.03 + 1.55 * v
      discMat.color.set('#ffd49a').multiplyScalar(0.05 + 2.55 * v)
    },
  }
}

/* ------------------------------------------------------------------ rug */

/** A worn oriental rug (w × d units), lying on y = 0. */
export function buildRug(w = 11, d = 15) {
  const tex = tile(
    'gjp-hero-rug',
    256,
    352,
    (g, W, H) => {
      const r = rng(23)
      const rust = '#6e2616'
      const brick = '#8a3a1e'
      const cream = '#d9c29a'
      const brown = '#2e1a10'
      const umber = '#4a2a16'
      const amber = '#b87a36'
      g.fillStyle = brown
      g.fillRect(0, 0, W, H)
      // borders: nested bands
      const band = (inset: number, color: string) => {
        g.fillStyle = color
        g.fillRect(inset, inset, W - inset * 2, H - inset * 2)
      }
      band(6, umber)
      band(10, cream)
      band(13, rust)
      band(34, cream)
      band(37, brown)
      band(40, brick)
      // the main border's motifs: little diamonds + rosettes on the rust band
      g.fillStyle = cream
      const motif = (x: number, y: number, s: number, c: string) => {
        g.fillStyle = c
        g.beginPath()
        g.moveTo(x, y - s)
        g.lineTo(x + s, y)
        g.lineTo(x, y + s)
        g.lineTo(x - s, y)
        g.closePath()
        g.fill()
      }
      for (let x = 24; x < W - 16; x += 16) {
        motif(x, 23.5, 6, amber)
        motif(x, H - 23.5, 6, amber)
        motif(x, 23.5, 2.5, brown)
        motif(x, H - 23.5, 2.5, brown)
      }
      for (let y = 24; y < H - 16; y += 16) {
        motif(23.5, y, 6, amber)
        motif(W - 23.5, y, 6, amber)
        motif(23.5, y, 2.5, brown)
        motif(W - 23.5, y, 2.5, brown)
      }
      // the field: a lattice of small motifs
      for (let y = 52; y < H - 44; y += 18)
        for (let x = 52 + ((y / 18) % 2) * 9; x < W - 44; x += 18) motif(x, y, 3.2, (x + y) % 36 ? '#5a2414' : umber)
      // the central medallion: stacked lozenges
      const cx = W / 2
      const cy = H / 2
      const loz = (sx: number, sy: number, c: string) => {
        g.fillStyle = c
        g.beginPath()
        g.moveTo(cx, cy - sy)
        g.lineTo(cx + sx, cy)
        g.lineTo(cx, cy + sy)
        g.lineTo(cx - sx, cy)
        g.closePath()
        g.fill()
      }
      loz(78, 110, cream)
      loz(72, 102, umber)
      loz(64, 92, rust)
      loz(44, 64, cream)
      loz(40, 58, '#27140c')
      loz(30, 44, amber)
      loz(18, 26, brick)
      loz(8, 12, cream)
      // corner spandrels
      g.fillStyle = umber
      for (const [x, y] of [
        [44, 44],
        [W - 44, 44],
        [44, H - 44],
        [W - 44, H - 44],
      ]) {
        g.beginPath()
        g.arc(x, y, 26, 0, Math.PI * 2)
        g.fill()
      }
      // wear: pale scuffs and dark grime, and a nap
      // an old rug: dusty, a little faded (desaturated, darker), the nap speckled
      const img = g.getImageData(0, 0, W, H)
      for (let i = 0; i < img.data.length; i += 4) {
        const n = r()
        const k = 0.6 + n * 0.16
        const l = img.data[i] * 0.3 + img.data[i + 1] * 0.55 + img.data[i + 2] * 0.15
        img.data[i] = (img.data[i] * 0.72 + l * 0.28) * k
        img.data[i + 1] = (img.data[i + 1] * 0.72 + l * 0.28) * k
        img.data[i + 2] = (img.data[i + 2] * 0.72 + l * 0.28) * k
      }
      g.putImageData(img, 0, 0)
      g.globalAlpha = 0.16
      for (let k = 0; k < 40; k++) {
        g.fillStyle = r() > 0.5 ? '#e8d4b0' : '#120804'
        g.beginPath()
        g.ellipse(r() * W, r() * H, 6 + r() * 26, 3 + r() * 10, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    },
    { repeat: false },
  )
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.96 })
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  rug.rotation.x = -Math.PI / 2
  rug.position.y = 0.025
  rug.receiveShadow = true
  group.add(rug)
  // fringe at both ends: a comb of short cream threads (one merged mesh)
  const threads: THREE.BufferGeometry[] = []
  for (const s of [1, -1])
    for (let i = 0; i < 44; i++) {
      const x = -w / 2 + 0.2 + ((w - 0.4) * i) / 43
      const g = new THREE.PlaneGeometry(0.06, 0.55)
      g.rotateX(-Math.PI / 2)
      g.translate(x, 0.02, s * (d / 2 + 0.27))
      threads.push(g)
    }
  const fringe = new THREE.Mesh(merge(threads), new THREE.MeshStandardMaterial({ color: '#b8a07a', roughness: 1 }))
  fringe.receiveShadow = true
  group.add(fringe)
  return group
}

/* ------------------------------------------------------------------ floor */

/** warm stained oak boards (along x), a small tile */
function boardsTile() {
  return tile('gjp-hero-boards', 512, 512, (g, w, h) => {
    const r = rng(41)
    const rows = 8
    const img = g.createImageData(w, h)
    // per-board tone + per-plank segment offsets
    const tones = Array.from({ length: rows * 3 }, () => 0.72 + r() * 0.42)
    // one butt joint per board at most (long boards): -1 = none in this tile
    const joints = Array.from({ length: rows }, () => [r() > 0.3 ? r() * w : -99, -99])
    for (let y = 0; y < h; y++) {
      const row = Math.floor((y / h) * rows)
      const fy = (y / h) * rows - row
      for (let x = 0; x < w; x++) {
        const [j0, j1] = joints[row]
        const seg = j0 > 0 && x > j0 ? 1 : 0
        const t = tones[row * 3 + seg]
        const u = x / w
        const grain = 0.5 + 0.5 * Math.sin((fy * 7 + Math.sin(u * 6.283 * 2 + row) * 0.8 + seg) * 6.283)
        const fine = 0.5 + 0.5 * Math.sin(fy * 90 + Math.sin(u * 40 + row * 3) * 1.5)
        let k = t * (1 - 0.18 * Math.pow(grain, 3) - 0.07 * fine)
        // seams: dark gaps between boards and at the butt joints
        if (fy < 0.025 || fy > 0.985) k *= 0.25
        if (Math.abs(x - j0) < 1.2 || Math.abs(x - j1) < 1.2) k *= 0.3
        const i = (y * w + x) * 4
        img.data[i] = Math.min(255, 104 * k)
        img.data[i + 1] = Math.min(255, 64 * k)
        img.data[i + 2] = Math.min(255, 36 * k)
        img.data[i + 3] = 255
      }
    }
    g.putImageData(img, 0, 0)
    // scuffs: worn paler streaks along the boards, a few dark marks
    for (let k = 0; k < 60; k++) {
      g.fillStyle = r() > 0.3 ? `rgba(190,140,90,${0.05 + r() * 0.07})` : `rgba(10,5,2,${0.1 + r() * 0.15})`
      g.fillRect(r() * w, r() * h, 20 + r() * 90, 0.8 + r() * 2.2)
    }
  })
}

/** The boards: a big plane that falls away into the dark past the stage. */
export function buildFloor(center: THREE.Vector3, size = 220) {
  const geo = new THREE.PlaneGeometry(size, size)
  // boards ~1.1 units wide (the 8-board tile spans 8.8 units across), the tile 24 long
  scaleUv(geo, size / 24, size / 8.8)
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: boardsTile(), roughness: 0.58, metalness: 0 })
  mat.transparent = true
  mat.onBeforeCompile = sh => {
    sh.uniforms.uFloorC = { value: new THREE.Vector2(center.x, center.z) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloorW;\nuniform vec2 uFloorC;').replace(
      '#include <dithering_fragment>',
      `float floorR = length((vFloorW.xz - uFloorC) * vec2(0.8, 1.0));
      gl_FragColor.rgb *= 1.0 - 0.75 * smoothstep(10.0, 34.0, floorR);
      // near the horizon the boards thin into the haze (a soft band at any distance)
      vec3 floorV = vFloorW - cameraPosition;
      float floorDep = -floorV.y / max(length(floorV.xz), 0.001);
      float floorKeep = 1.0 - smoothstep(14.0, 30.0, floorR);
      gl_FragColor.a *= max(floorKeep, smoothstep(0.02, 0.2, floorDep));
      #include <dithering_fragment>`,
    )
  }
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(center.x, 0, center.z)
  m.receiveShadow = true
  m.renderOrder = -1
  return m
}

/* ------------------------------------------------------------------ setlist */

/** A handwritten setlist on cream paper, taped to the boards (text reads toward +z). */
export function buildSetlist(songs: string[], note: string) {
  const group = new THREE.Group()
  const tex = tile(
    'gjp-hero-setlist',
    256,
    336,
    (g, w, h) => {
      g.fillStyle = '#efe4cc'
      g.fillRect(0, 0, w, h)
      // faint ruled lines
      g.strokeStyle = 'rgba(120,140,170,0.18)'
      g.lineWidth = 1
      for (let y = 58; y < h - 10; y += 28) {
        g.beginPath()
        g.moveTo(10, y)
        g.lineTo(w - 10, y)
        g.stroke()
      }
      g.fillStyle = '#1d1712'
      g.textBaseline = 'alphabetic'
      g.font = FONT.script(34, 700)
      g.fillText(note, 20, 44)
      g.font = FONT.script(27, 600)
      songs.forEach((s, i) => {
        g.save()
        g.translate(22, 84 + i * 28)
        g.rotate((i % 2 ? -1 : 1) * 0.012)
        g.fillText(s, 0, 0)
        g.restore()
      })
    },
    { repeat: false },
  )
  const geo = new THREE.PlaneGeometry(2.16, 2.84, 6, 1)
  // a slight curl along the long edges
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.03 * Math.pow(Math.abs(p.getX(i)) / 1.08, 3))
  geo.computeVertexNormals()
  const sheet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.85 }))
  sheet.rotation.x = -Math.PI / 2
  sheet.position.y = 0.035
  sheet.receiveShadow = true
  group.add(sheet)
  // two strips of gaffer at the top corners
  for (const s of [1, -1]) {
    const t = gaffer(0.7, 0.3, '#1d1c1b')
    t.position.set(s * 1.0, 0.045, -1.35)
    t.rotation.z = s * 0.7
    group.add(t)
  }
  return group
}
