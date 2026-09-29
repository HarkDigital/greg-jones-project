import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { rng } from '../../core/math'
import { tile } from '../../kit/materials'
import { scaleUv } from '../../kit/stage'

/*
 * FRONT ROW · the room: the back wall of a small bar after dark — old brick,
 * sooty and warm, lit in scallops by a festoon strand of bulbs hung across it
 * (their light on the brick and on the sheet is analytic: no extra lights),
 * worn oak floorboards, and the front row: three bentwood café chairs facing
 * the sheet. Units: 1 = 10 cm. The wall is the plane z = WALL_Z facing +z.
 */

export const WALL_Z = -0.7
/** the festoon strand: one swag across the sheet, one off to each side */
export const SPANS: [number, number, number, number][] = [
  // x0, x1, hook height, sag
  [-44, -13, 26.2, 3.2],
  [-13, 13, 25.0, 2.2],
  [13, 44, 26.2, 3.2],
]
export const STRAND_Z = 1.6
export const NB = 16

/** the wire's height at x */
export function strandY(x: number) {
  for (const [x0, x1, y0, sag] of SPANS) {
    if (x >= x0 && x <= x1) {
      const t = ((x - x0) / (x1 - x0)) * 2 - 1
      return y0 - sag * (1 - t * t)
    }
  }
  return SPANS[0][2]
}

/** positions of the NB bulbs nearest the sheet (they light the wall and the cloth analytically) */
/** the strand's bulbs sit on one grid along x */
const bulbX = (m: number) => 1.575 + m * 2.35

export function bulbPositions(): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < NB; i++) {
    const x = bulbX(i - NB / 2)
    out.push(new THREE.Vector3(x, strandY(x) - 0.62, STRAND_Z))
  }
  return out
}

/** GLSL: the bulbs' light on a surface (p world, n world normal) */
export const BULB_GLSL = /* glsl */ `
  uniform vec3 uBulbs[${NB}];
  uniform vec3 uBulbC;
  uniform float uBulbI;
  vec3 bulbLight(vec3 p, vec3 n) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < ${NB}; i++) {
      vec3 d = uBulbs[i] - p;
      float r2 = dot(d, d);
      float lam = max(dot(n, d) * inversesqrt(r2 + 1e-4), 0.0);
      s += (0.2 + 0.8 * lam) / (1.0 + r2 * 0.6);
    }
    return uBulbC * s * uBulbI;
  }
`

/** shared uniforms for every surface the bulbs light */
export const bulbUniforms = {
  uBulbs: { value: bulbPositions() },
  uBulbC: { value: new THREE.Color('#ffb45e') },
  uBulbI: { value: 1 },
}

/* ------------------------------------------------------------ textures */

/** old brick, running bond: 2 bricks × 6 courses per tile (≈ 4.6 × 4.6 units) */
function brickMap(bump: boolean) {
  return tile(
    bump ? 'watch-brick-bump' : 'watch-brick',
    256,
    256,
    (g, w, h) => {
      const r = rng(bump ? 71 : 71)
      const rows = 6
      const ch = h / rows
      const bw = w / 2
      const mortar = 5
      g.fillStyle = bump ? '#3a3a3a' : '#2b221c'
      g.fillRect(0, 0, w, h)
      const tones = ['#55291d', '#613022', '#6a3826', '#4a251a', '#5c2f21', '#70402b', '#43231a', '#633a2b']
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? bw / 2 : 0
        for (let k = -1; k < 3; k++) {
          const x = k * bw + off
          const y = row * ch
          const c = tones[Math.floor(r() * tones.length)]
          const dark = r()
          if (bump) {
            const v = 170 + Math.floor(r() * 50)
            g.fillStyle = `rgb(${v},${v},${v})`
          } else g.fillStyle = c
          g.fillRect(x + mortar / 2, y + mortar / 2, bw - mortar, ch - mortar)
          // speckle, soot and chipped edges
          for (let s = 0; s < 40; s++) {
            const sx = x + mortar / 2 + r() * (bw - mortar)
            const sy = y + mortar / 2 + r() * (ch - mortar)
            if (bump) g.fillStyle = `rgba(${r() > 0.5 ? 255 : 90},${r() > 0.5 ? 255 : 90},${r() > 0.5 ? 255 : 90},0.25)`
            else g.fillStyle = r() > 0.5 ? `rgba(20,10,6,${0.15 + r() * 0.25})` : `rgba(160,90,60,${0.08 + r() * 0.12})`
            g.fillRect(sx, sy, 1 + r() * 4, 1 + r() * 2)
          }
          if (!bump && dark > 0.72) {
            g.fillStyle = `rgba(12,6,4,${0.25 + r() * 0.3})`
            g.fillRect(x + mortar / 2, y + mortar / 2, bw - mortar, ch - mortar)
          }
        }
      }
    },
    { srgb: !bump },
  )
}

/** worn oak floorboards: 4 boards per tile, grain along x */
function boardMap() {
  return tile('watch-boards', 256, 256, (g, w, h) => {
    const r = rng(33)
    const n = 4
    const bh = h / n
    const tones: [number, number, number][] = [
      [112, 70, 40],
      [124, 80, 46],
      [100, 62, 34],
      [118, 76, 44],
    ]
    for (let i = 0; i < n; i++) {
      const [cr, cg, cb] = tones[i]
      g.fillStyle = `rgb(${cr},${cg},${cb})`
      g.fillRect(0, i * bh, w, bh)
      for (let k = 0; k < 26; k++) {
        const y = i * bh + r() * bh
        g.strokeStyle = r() > 0.5 ? `rgba(30,16,8,${0.12 + r() * 0.2})` : `rgba(140,96,60,${0.06 + r() * 0.1})`
        g.lineWidth = 0.5 + r() * 1.5
        g.beginPath()
        g.moveTo(0, y)
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 1.2)
        g.stroke()
      }
      // the gap between boards + a butt joint
      g.fillStyle = 'rgba(8,4,2,0.9)'
      g.fillRect(0, i * bh, w, 2)
      g.fillRect(Math.floor(r() * w), i * bh, 2, bh)
      // wear: lighter scuffs
      for (let k = 0; k < 10; k++) {
        g.fillStyle = `rgba(170,120,80,${0.05 + r() * 0.07})`
        g.fillRect(r() * w, i * bh + r() * bh, 20 + r() * 50, 1 + r() * 2)
      }
    }
  })
}

/* ------------------------------------------------------------ builders */

/** the back wall: brick, lit by the bulbs in front of it (analytic) plus the scene's lights */
export function buildWall(): THREE.Mesh {
  const W = 130
  const H = 62
  const geo = new THREE.PlaneGeometry(W, H)
  scaleUv(geo, W / 4.6, H / 4.6)
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: brickMap(false),
    bumpMap: brickMap(true),
    bumpScale: 2.2,
    roughness: 0.92,
  })
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, bulbUniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\n${BULB_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * bulbLight(vWP, vec3(0.0, 0.0, 1.0)) * 0.42;`,
      )
  }
  const m = new THREE.Mesh(geo, mat)
  m.position.set(0, H / 2 - 1, WALL_Z)
  m.receiveShadow = true
  return m
}

export function buildFloor(): THREE.Mesh {
  const S = 160
  const geo = new THREE.PlaneGeometry(S, S)
  scaleUv(geo, S / 5.6, S / 5.6)
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: boardMap(), roughness: 0.62, metalness: 0 }))
  m.rotation.x = -Math.PI / 2
  m.position.z = S / 2 + WALL_Z
  m.receiveShadow = true
  return m
}

/** the festoon strand: a black wire in swags, sockets and warm globe bulbs (instanced) */
export function buildStrand(): { group: THREE.Group; bulbMat: THREE.MeshBasicMaterial } {
  const group = new THREE.Group()
  const wireMat = new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 0.5 })
  const pts: THREE.Vector3[] = []
  for (let x = -44; x <= 44; x += 0.5) pts.push(new THREE.Vector3(x, strandY(x), STRAND_Z))
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.035, 5, false), wireMat)
  group.add(wire)
  // bulbs every 2.35 units along the whole strand
  const xs: number[] = []
  for (let m = -20; m <= 20; m++) if (Math.abs(bulbX(m)) <= 43) xs.push(bulbX(m))
  const socketGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.42, 10)
  const bulbGeo = new THREE.SphereGeometry(0.3, 16, 12)
  const sockets = new THREE.InstancedMesh(socketGeo, new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.45 }), xs.length)
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb45e').multiplyScalar(4.2), toneMapped: false })
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, xs.length)
  const m = new THREE.Matrix4()
  xs.forEach((x, i) => {
    const y = strandY(x)
    m.makeTranslation(x, y - 0.23, STRAND_Z)
    sockets.setMatrixAt(i, m)
    m.makeTranslation(x, y - 0.62, STRAND_Z)
    bulbs.setMatrixAt(i, m)
  })
  group.add(sockets, bulbs)
  return { group, bulbMat }
}

/**
 * A bentwood café chair (after the classic No. 14 shape, generic): a round
 * seat, one bent piece forming the back legs and the backrest loop, an inner
 * loop, two front legs and a leg ring. Faces -z (the back toward +z).
 * Seat top at y = 4.6.
 */
export function chairGeometry(): THREE.BufferGeometry {
  const tube = (pts: [number, number, number][], r: number, seg = 60) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        pts.map(p => new THREE.Vector3(...p)),
        false,
        'centripetal',
      ),
      seg,
      r,
      8,
      false,
    )
  const parts: THREE.BufferGeometry[] = []
  // the back legs + backrest: one bent piece, floor → seat → over the top → seat → floor
  parts.push(
    tube(
      [
        [-1.45, 0, 2.2],
        [-1.52, 2.3, 1.75],
        [-1.56, 4.5, 1.4],
        [-1.5, 6.4, 1.7],
        [-1.2, 8.35, 2.0],
        [-0.6, 9.05, 2.1],
        [0, 9.2, 2.12],
        [0.6, 9.05, 2.1],
        [1.2, 8.35, 2.0],
        [1.5, 6.4, 1.7],
        [1.56, 4.5, 1.4],
        [1.52, 2.3, 1.75],
        [1.45, 0, 2.2],
      ],
      0.15,
      140,
    ),
  )
  // the inner loop
  parts.push(
    tube(
      [
        [-1.0, 4.62, 1.45],
        [-1.05, 6.2, 1.72],
        [-0.7, 7.3, 1.86],
        [0, 7.55, 1.9],
        [0.7, 7.3, 1.86],
        [1.05, 6.2, 1.72],
        [1.0, 4.62, 1.45],
      ],
      0.1,
      70,
    ),
  )
  // front legs
  for (const s of [-1, 1]) parts.push(tube([[s * 1.62, 0, -1.95], [s * 1.5, 2.3, -1.6], [s * 1.36, 4.4, -1.3]], 0.15, 16))
  // seat: a disc with a rolled rim, and a leg ring below
  const seat = new THREE.CylinderGeometry(2.05, 2.0, 0.22, 40)
  seat.translate(0, 4.5, 0.05)
  parts.push(seat)
  const rim = new THREE.TorusGeometry(2.05, 0.12, 8, 40).rotateX(Math.PI / 2)
  rim.translate(0, 4.46, 0.05)
  parts.push(rim)
  const ring = new THREE.TorusGeometry(1.62, 0.08, 6, 40).rotateX(Math.PI / 2)
  ring.translate(0, 1.95, 0.02)
  parts.push(ring)
  // strip to position + normal (+uv) so the merge is consistent
  const clean = parts.map(p => {
    const g = p.index ? p.toNonIndexed() : p
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', g.getAttribute('position'))
    out.setAttribute('normal', g.getAttribute('normal'))
    return out
  })
  return mergeGeometries(clean, false)!
}

export function chairMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: '#3b1c0f', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22 })
}
