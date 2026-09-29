import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { rng } from '../../core/math'
import { tile } from '../../kit/materials'

/*
 * THE BAND — small shared helpers for the band set: rods between two
 * points, a merge that tolerates mixed (non-)indexed geometry, a "plate"
 * (a polar-gridded outline with an edge attribute, for instrument tops and
 * backs), and the burst finish (sunburst / aged paint) that reads that edge.
 * Units: 1 = 10 cm.
 */

const _Y = new THREE.Vector3(0, 1, 0)
const _d = new THREE.Vector3()
const _m = new THREE.Vector3()
const _q = new THREE.Quaternion()

/** a cylinder from a to b (radius r at a, r2 at b), ready to merge */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 8, r2 = r, open = false): THREE.BufferGeometry {
  _d.subVectors(b, a)
  const len = Math.max(1e-4, _d.length())
  const g = new THREE.CylinderGeometry(r2, r, len, radial, 1, open)
  _q.setFromUnitVectors(_Y, _d.normalize())
  g.applyQuaternion(_q)
  _m.lerpVectors(a, b, 0.5)
  g.translate(_m.x, _m.y, _m.z)
  return g
}

/** a box centred at (x, y, z) */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z)
}

/** merge geometries (position/normal/uv only), converting to non-indexed when they mix */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const mixed = geos.some(g => !g.index) && geos.some(g => !!g.index)
  const clean = geos.map(g0 => {
    let g = mixed && g0.index ? g0.toNonIndexed() : g0
    if (g !== g0) g0.dispose()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    if (!g.attributes.uv) {
      const n = g.attributes.position.count
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    return g
  })
  const out = mergeGeometries(clean, false)
  for (const g of clean) g.dispose()
  return out ?? new THREE.BufferGeometry()
}

/** a mesh with shadows set */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

/** a smooth closed outline through control points (CCW), sampled evenly */
export function outline(points: [number, number][], samples = 120): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    true,
    'centripetal',
  )
  return curve.getSpacedPoints(samples).slice(0, samples).map(p => new THREE.Vector2(p.x, p.y))
}

/** mirror a half outline given from the tail (y = 0) round the -y side to the tip (y = 0) */
export function mirrored(half: [number, number][]): [number, number][] {
  const back = half
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [x, -y] as [number, number])
  return [...half, ...back]
}

/**
 * A plate over a star-shaped outline (seen from its centre): rings of the
 * outline scaled toward the centre, z from `height(t)` (t = 0 centre → 1
 * rim). Carries `aEdge` = t for the burst / binding. Faces +z (flip for a back).
 */
export function plate(line: THREE.Vector2[], centre: THREE.Vector2, rings: number, height: (t: number) => number, flip = false) {
  const n = line.length
  const pos: number[] = []
  const edge: number[] = []
  const uv: number[] = []
  pos.push(centre.x, centre.y, height(0))
  edge.push(0)
  uv.push(centre.x * 0.25, centre.y * 0.25)
  for (let r = 1; r <= rings; r++) {
    // rings bunch toward the rim (where the edge roll and binding live)
    const t = 1 - Math.pow(1 - r / rings, 1.6)
    for (let i = 0; i < n; i++) {
      const x = centre.x + (line[i].x - centre.x) * t
      const y = centre.y + (line[i].y - centre.y) * t
      pos.push(x, y, height(t))
      edge.push(t)
      uv.push(x * 0.25, y * 0.25)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const a = 1 + i
    const b = 1 + ((i + 1) % n)
    if (flip) idx.push(0, b, a)
    else idx.push(0, a, b)
  }
  for (let r = 1; r < rings; r++) {
    const o = 1 + (r - 1) * n
    const p = 1 + r * n
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      if (flip) idx.push(o + i, p + i2, p + i, o + i, o + i2, p + i2)
      else idx.push(o + i, p + i, p + i2, o + i, p + i2, o + i2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** the side wall of an outline, from z0 (top rim) down to z1 */
export function wall(line: THREE.Vector2[], z0: number, z1: number) {
  const n = line.length
  const pos: number[] = []
  const uv: number[] = []
  let run = 0
  for (let i = 0; i <= n; i++) {
    const p = line[i % n]
    if (i > 0) run += p.distanceTo(line[(i - 1) % n])
    pos.push(p.x, p.y, z0, p.x, p.y, z1)
    uv.push(run * 0.3, 0, run * 0.3, (z0 - z1) * 0.3)
  }
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export interface BurstOptions {
  /** centre colour, mid, rim */
  inner: THREE.ColorRepresentation
  mid: THREE.ColorRepresentation
  outer: THREE.ColorRepresentation
  /** where the burst starts darkening, and where it's fully `outer` (in aEdge) */
  from?: number
  to?: number
  /** binding colour and where it starts (aEdge); > 1 for none */
  bind?: THREE.ColorRepresentation
  bindAt?: number
  map?: THREE.Texture | null
  roughness?: number
  clearcoat?: number
}

/**
 * A lacquered finish that darkens toward the rim (a sunburst, or aged paint
 * with a darker edge) and draws a binding line — read from the plate's aEdge.
 */
export function burst(o: BurstOptions): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: o.map ?? null,
    roughness: o.roughness ?? 0.38,
    clearcoat: o.clearcoat ?? 0.75,
    clearcoatRoughness: 0.18,
    // a point lamp on a sharp lacquer arch makes a glint that blooms into a "bulb": keep it modest
    specularIntensity: 0.6,
  })
  const u = {
    uInner: { value: new THREE.Color(o.inner) },
    uMid: { value: new THREE.Color(o.mid) },
    uOuter: { value: new THREE.Color(o.outer) },
    uBind: { value: new THREE.Color(o.bind ?? '#000000') },
    uFrom: { value: o.from ?? 0.45 },
    uTo: { value: o.to ?? 0.97 },
    uBindAt: { value: o.bindAt ?? 2 },
  }
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vEdge;\nuniform vec3 uInner, uMid, uOuter, uBind;\nuniform float uFrom, uTo, uBindAt;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float mid = mix(uFrom, uTo, 0.5);
          vec3 bc = mix(uInner, uMid, smoothstep(uFrom, mid, vEdge));
          bc = mix(bc, uOuter, smoothstep(mid, uTo, vEdge));
          float bd = smoothstep(uBindAt, uBindAt + 0.004, vEdge);
          diffuseColor.rgb = mix(diffuseColor.rgb * bc, uBind, bd);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'band-burst'
  return m
}

/* ------------------------------------------------------------------ tiles */

/** faint straight grain (spruce / maple tops): a pale tile the burst tints */
export function grainMap(kind: 'spruce' | 'maple') {
  return tile('band-grain-' + kind, 256, 256, (g, w, h) => {
    g.fillStyle = '#f4f0ea'
    g.fillRect(0, 0, w, h)
    const r = rng(kind === 'spruce' ? 5 : 8)
    if (kind === 'spruce') {
      for (let i = 0; i < 110; i++) {
        const y = r() * h
        g.strokeStyle = `rgba(120,80,40,${0.05 + r() * 0.12})`
        g.lineWidth = 0.6 + r() * 1.3
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(w, y + (r() - 0.5) * 2)
        g.stroke()
      }
    } else {
      // curly flame: soft bands across the grain
      for (let x = 0; x < w; x += 2) {
        const v = 0.5 + 0.5 * Math.sin(x * 0.19 + Math.sin(x * 0.05) * 2)
        g.fillStyle = `rgba(140,90,40,${0.04 + v * 0.1})`
        g.fillRect(x, 0, 2, h)
      }
      for (let i = 0; i < 60; i++) {
        const y = r() * h
        g.strokeStyle = `rgba(120,80,40,${0.04 + r() * 0.06})`
        g.lineWidth = 0.6
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(w, y + (r() - 0.5) * 3)
        g.stroke()
      }
    }
  })
}

/** tortoiseshell (pickguards) */
export function tortoiseMap() {
  return tile('band-tortoise', 128, 128, (g, w, h) => {
    g.fillStyle = '#1e0a05'
    g.fillRect(0, 0, w, h)
    const r = rng(31)
    for (let i = 0; i < 70; i++) {
      const x = r() * w
      const y = r() * h
      const s = 4 + r() * 16
      const grad = g.createRadialGradient(x, y, 0, x, y, s)
      const c = r() > 0.4 ? '150,62,18' : '96,30,10'
      grad.addColorStop(0, `rgba(${c},${0.5 + r() * 0.35})`)
      grad.addColorStop(1, `rgba(${c},0)`)
      g.fillStyle = grad
      g.beginPath()
      g.ellipse(x, y, s, s * (0.5 + r() * 0.6), r() * 3, 0, Math.PI * 2)
      g.fill()
    }
  })
}
