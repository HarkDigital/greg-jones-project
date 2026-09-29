import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Frame } from '../core/types'
import { Strings } from './strings'
import { FONT, chrome, tile } from './materials'

/*
 * THE GUITAR — Greg's acoustic, after his Martin OMCPA4 (gregjonesproject.com
 * /gear): a 000-size body with a single (Venetian) cutaway, a solid Sitka
 * spruce top in natural gloss with a ringed rosette, solid sapele back and
 * sides, black Boltaron binding, a tortoiseshell pickguard, a black Richlite
 * bridge with a white compensated saddle and bridge pins, a black Richlite
 * board with 20 frets and white dots, a white nut, closed chrome tuners with
 * large buttons, 13-gauge phosphor-bronze strings, tuned DADGBD. The
 * headstock carries a cream "GJP" monogram where a maker's logo would be.
 *
 * Local space (1 unit = 10 cm): the guitar lies in the XY plane, face toward
 * +Z. The neck runs along +X: the SADDLE is at x = 0, the NUT at x = SCALE
 * (6.45 = 25.4"), the headstock beyond. +Y is the bass side (low D on top when
 * the neck points right); the cutaway is on -Y. The top's binding edge is at
 * z = 0 (the top domes up ~0.012); the body runs back to z ≈ -1.0 at the tail
 * and -0.84 at the neck. The soundhole is at SOUNDHOLE (x, y), radius 0.495.
 *
 * The spruce SILK (the cross-grain shimmer of quartersawn spruce) and the
 * sapele RIBBON figure are chatoyant: they swap light and dark with the view,
 * so any camera move makes the wood come alive under the gloss.
 *
 *   const g = buildGuitar()
 *   group.add(g.group)
 *   g.update(frame, ctx.camera, ctx.renderer)   // every frame (strings)
 *   g.strings.amp[i] = 0.02                     // ring a string (0 = low D)
 *   g.fretX(12), g.stringY(i, x), g.stringZ(x), g.topZ(x, y)
 *   g.finish = 0..1                             // raw wood → gloss
 */

export const SCALE = 6.45
export const FRETS = 20
/** Greg's tuning, low string first */
export const TUNING = ['D', 'A', 'D', 'G', 'B', 'D']
const BOARD_TOP = 0.072
const NUT_W = 0.445
const END_W = 0.57
const DOME = 0.012
/** fret n's distance from the saddle (n = 0 is the nut) */
export const fretX = (n: number) => SCALE * Math.pow(2, -n / 12)
/** the neck meets the body at the 14th fret */
export const NECK_JOINT = fretX(14)
const BOARD_END = fretX(FRETS) - 0.07
const TAIL = NECK_JOINT - 4.93
export const SOUNDHOLE = new THREE.Vector2(1.37, 0)
export const SOUNDHOLE_R = 0.495
const DEPTH_TAIL = 1.04
const DEPTH_NECK = 0.84
const depthAt = (x: number) => DEPTH_TAIL + (DEPTH_NECK - DEPTH_TAIL) * Math.min(1, Math.max(0, (x - TAIL) / (NECK_JOINT - TAIL)))

export interface GuitarOptions {
  mobile?: boolean
  /** top colour: 'natural' (Sitka, default) or 'aged' (a deeper amber) */
  top?: 'natural' | 'aged'
}

/* ---------------------------------------------------------------- outline */

/** The body outline (000 with a Venetian cutaway on -Y), dense, CCW, in local XY. */
export function bodyOutline(): THREE.Vector2[] {
  const P = (x: number, y: number) => new THREE.Vector3(x, y, 0)
  const bass: [number, number][] = [
    [-1.98, 0.72],
    [-1.7, 1.38],
    [-1.2, 1.8],
    [-0.6, 1.905],
    [0.0, 1.78],
    [0.55, 1.42],
    [0.95, 1.2],
    [1.35, 1.25],
    [1.8, 1.4],
    [2.2, 1.38],
    [2.55, 1.12],
    [2.78, 0.7],
    [NECK_JOINT, 0.29],
  ]
  // treble side: the mirror, then the cutaway
  const trebleBase: [number, number][] = bass.slice(0, 8).map(([x, y]) => [x, -y])
  const cut: [number, number][] = [
    [1.75, -1.38],
    [2.08, -1.32],
    [2.27, -1.08],
    [2.21, -0.82],
    [2.06, -0.62],
    [2.11, -0.42],
    [2.4, -0.31],
    [NECK_JOINT, -0.29],
  ]
  const pts = [P(TAIL, 0), ...trebleBase.map(([x, y]) => P(x, y)), ...cut.map(([x, y]) => P(x, y))]
  // across the neck joint, then back down the bass side
  pts.push(...[...bass].reverse().map(([x, y]) => P(x, y)))
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  return curve.getSpacedPoints(240).slice(0, -1).map(p => new THREE.Vector2(p.x, p.y))
}

function distToPolyline(x: number, y: number, poly: THREE.Vector2[]) {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby)))
    const dx = a.x + abx * t - x
    const dy = a.y + aby * t - y
    best = Math.min(best, dx * dx + dy * dy)
  }
  return Math.sqrt(best)
}

/** 1-to-4 midpoint subdivision of an indexed triangle mesh (positions only). */
function subdivide(geo: THREE.BufferGeometry, levels: number) {
  let pos = Array.from(geo.attributes.position.array as ArrayLike<number>)
  let idx = Array.from(geo.index!.array as ArrayLike<number>)
  for (let l = 0; l < levels; l++) {
    const mids = new Map<string, number>()
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      let m = mids.get(key)
      if (m === undefined) {
        m = pos.length / 3
        pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2)
        mids.set(key, m)
      }
      return m
    }
    const next: number[] = []
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]]
      const ab = mid(a, b)
      const bc = mid(b, c)
      const ca = mid(c, a)
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
    }
    idx = next
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setIndex(idx)
  return out
}

/** the top's gentle dome: flat at the binding, up to DOME in the lower bout */
function domeAt(d: number) {
  const t = Math.max(0, Math.min(1, (d - 0.05) / 1.2))
  return 0.0015 + DOME * t * t * (3 - 2 * t)
}

const NOISE_GLSL = /* glsl */ `
  float ghash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float gnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ghash(i), ghash(i + vec2(1, 0)), f.x), mix(ghash(i + vec2(0, 1)), ghash(i + vec2(1, 1)), f.x), f.y);
  }
`

/* ---------------------------------------------------------------- shaders */

/** The spruce top: grain, silk, rosette, binding; gloss that follows `finish`. */
function topMaterial(tone: 'natural' | 'aged') {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03 })
  const uniforms = {
    uSpruce: { value: new THREE.Color(tone === 'aged' ? '#dcaa66' : '#e8c890') },
    uLate: { value: new THREE.Color(tone === 'aged' ? '#a8703a' : '#b98a52') },
    uFinish: { value: 1 },
    uHole: { value: SOUNDHOLE.clone() },
  }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aEdge;\nvarying float vEdge;\nvarying vec3 vObj;\nvarying vec3 vWPos;\nvarying vec3 vAcrossW;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvEdge = aEdge;\nvObj = position;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvAcrossW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSpruce, uLate;
        uniform float uFinish;
        uniform vec2 uHole;
        varying float vEdge;
        varying vec3 vObj;
        varying vec3 vWPos;
        varying vec3 vAcrossW;
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 q = vObj.xy;
          // GRAIN: bookmatched quartersawn Sitka — straight lines along the length,
          // tight at the centre seam, a touch wider toward the edges, a slight wander
          float ay = abs(q.y);
          float lines = ay * (46.0 - 8.0 * ay) + 0.8 * gnoise(vec2(q.x * 0.6, ay * 3.0)) + 0.18 * gnoise(q * vec2(0.2, 30.0));
          float g = fract(lines);
          float late = 1.0 - smoothstep(0.0, 0.16, g) * smoothstep(0.38, 0.2, g);
          late = smoothstep(0.55, 1.0, late) * (0.55 + 0.45 * gnoise(vec2(floor(lines), 3.1)));
          vec3 wood = mix(uSpruce, uLate, late * 0.55);
          // SILK: short cross-grain flecks that shimmer with the view (chatoyance)
          vec3 V = normalize(cameraPosition - vWPos);
          float chat = dot(V, vAcrossW);
          float fleck = gnoise(vec2(q.x * 26.0, ay * 3.2 + floor(lines) * 0.37));
          float silk = smoothstep(0.62, 0.9, fleck) * (0.5 + 0.5 * sin(chat * 7.0 + q.x * 3.0));
          wood *= 1.0 + 0.09 * silk * uFinish - 0.03 * (1.0 - uFinish);
          wood *= mix(0.92, 1.0, uFinish);
          // ROSETTE: rings round the soundhole (black / white purfling, a herringbone band)
          float r = length(q - uHole);
          float ro = r - ${SOUNDHOLE_R.toFixed(3)};
          float ring = 0.0;
          vec3 rc = wood;
          if (ro > 0.0 && ro < 0.2) {
            float ang = atan(q.y - uHole.y, q.x - uHole.x);
            // outer + inner black rings with white lines
            float blk = step(0.014, ro) * (1.0 - step(0.03, ro)) + step(0.12, ro) * (1.0 - step(0.14, ro)) + step(0.17, ro) * (1.0 - step(0.182, ro));
            float wht = step(0.03, ro) * (1.0 - step(0.036, ro)) + step(0.114, ro) * (1.0 - step(0.12, ro)) + step(0.14, ro) * (1.0 - step(0.146, ro));
            // the herringbone band
            float band = step(0.036, ro) * (1.0 - step(0.114, ro));
            float hb = fract(ang * 38.0 + (ro - 0.075) * (ro < 0.075 ? 14.0 : -14.0) * 6.0);
            vec3 herring = mix(vec3(0.06, 0.05, 0.045), vec3(0.93, 0.9, 0.84), step(0.5, hb));
            rc = mix(rc, vec3(0.03, 0.028, 0.026), blk);
            rc = mix(rc, vec3(0.94, 0.92, 0.86), wht);
            rc = mix(rc, herring, band * 0.92);
            ring = 1.0;
          }
          wood = mix(wood, rc, ring);
          // the soundhole's own edge: a hint of end grain
          wood *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.01, ro)) * step(0.0, ro);
          // BINDING: black Boltaron, a white purfling line inside it
          float bindB = 1.0 - smoothstep(0.032, 0.036, vEdge);
          float purf = smoothstep(0.036, 0.039, vEdge) * (1.0 - smoothstep(0.044, 0.047, vEdge));
          wood = mix(wood, vec3(0.94, 0.92, 0.86), purf);
          wood = mix(wood, vec3(0.022, 0.02, 0.02), bindB);
          diffuseColor.rgb *= wood;
        }`,
      )
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\nmaterial.clearcoat *= uFinish;`)
  }
  return { mat, uniforms }
}

/** Sapele back and sides: a warm red-brown with a chatoyant ribbon stripe; black binding bands. */
function sapeleMaterial(opts: { bands: boolean }) {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 })
  const uniforms = { uFinish: { value: 1 } }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\nvarying vec3 vWPos;\nvarying vec3 vAcrossW;\nattribute float aDepth;\nvarying float vDepth;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvObj = position;\nvDepth = aDepth;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvAcrossW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uFinish;\nvarying vec3 vObj;\nvarying vec3 vWPos;\nvarying vec3 vAcrossW;\nvarying float vDepth;\n${NOISE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 q = vObj.xy;
          vec3 base = vec3(0.26, 0.105, 0.05);
          // interlocked grain: ribbon stripes along the length, chatoyant
          vec3 V = normalize(cameraPosition - vWPos);
          float chat = dot(V, vAcrossW);
          float s = q.y * 7.0 + (vObj.z) * 3.0 + 0.6 * gnoise(q * vec2(0.8, 2.0));
          float rib = 0.5 + 0.5 * sin(s * 6.2831853 + chat * 4.0);
          vec3 wood = base * (0.86 + 0.2 * rib);
          wood *= 1.0 + 0.06 * (gnoise(vec2(q.x * 2.0, q.y * 90.0)) - 0.5);
          wood = mix(vec3(0.58, 0.34, 0.2), wood, uFinish);
          ${
            opts.bands
              ? `// black binding round the top and back edges of the side wall
          float b = step(vDepth, 0.035) + step(0.965, vDepth);
          wood = mix(wood, vec3(0.022, 0.02, 0.02), clamp(b, 0.0, 1.0));`
              : ''
          }
          diffuseColor.rgb *= wood;
        }`,
      )
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\nmaterial.clearcoat *= uFinish;`)
  }
  return { mat, uniforms }
}

/** Black Richlite (board, bridge, headstock face): dense, satin-to-gloss black. */
const richlite = (rough = 0.45) => new THREE.MeshPhysicalMaterial({ color: '#141211', roughness: rough, clearcoat: 0.35, clearcoatRoughness: 0.25 })
/** White Tusq / Corian (saddle, nut, bridge pins). */
const bone = () => new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.32 })

/** Tortoiseshell celluloid: a small cached tile. */
function tortoiseMap() {
  return tile('tortoise', 256, 256, (g, w, h) => {
    g.fillStyle = '#2a1206'
    g.fillRect(0, 0, w, h)
    let seed = 7
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 90; i++) {
      const x = r() * w
      const y = r() * h
      const rad = 6 + r() * 30
      const grad = g.createRadialGradient(x, y, 0, x, y, rad)
      const c = r() > 0.4 ? '180,92,28' : '120,48,14'
      grad.addColorStop(0, `rgba(${c},${0.55 + r() * 0.3})`)
      grad.addColorStop(1, `rgba(${c},0)`)
      g.fillStyle = grad
      g.beginPath()
      g.ellipse(x, y, rad, rad * (0.4 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** The headstock monogram: "GJP" in cream, drawn once. */
function monogramMap() {
  return tile(
    'gjp-monogram',
    512,
    256,
    (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#efe4c8'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = FONT.displayItalic(150, 640)
      g.fillText('GJP', w / 2, h * 0.5)
    },
    { repeat: false },
  )
}

/* ---------------------------------------------------------------- build */

export interface Guitar {
  group: THREE.Group
  strings: Strings
  parts: {
    body: THREE.Group
    top: THREE.Mesh
    /** back cap + side wall */
    shell: THREE.Mesh[]
    neck: THREE.Group
    headstock: THREE.Group
    logo: THREE.Mesh
    bridge: THREE.Group
    pickguard: THREE.Mesh
    frets: THREE.InstancedMesh
    inlays: THREE.Mesh
    tuners: THREE.Group
    /** the static string runs (saddle → pins, nut → posts) */
    runs: THREE.Mesh
  }
  finish: number
  fretX: (n: number) => number
  /** string i's y at x (i = 0 low D) */
  stringY: (i: number, x: number) => number
  stringZ: (x: number) => number
  /** top height at (x, y) on the body */
  topZ: (x: number, y: number) => number
  /** headstock monogram centre in local space */
  logoAt: THREE.Vector3
  update(frame: Frame, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void
}

const STRING_NUT = 0.183
const STRING_BRIDGE = 0.28
const Z_NUT = BOARD_TOP + 0.03
const Z_SADDLE = 0.118
/** 13-gauge set (.056 .045 .035 .026 .017 .013), radius in units */
const GAUGE = [0.056, 0.045, 0.035, 0.026, 0.017, 0.013].map(d => d * 0.127)
/** phosphor bronze wound strings, plain steel B and D */
const WOUND = [true, true, true, true, false, false]

export function buildGuitar(opts: GuitarOptions = {}): Guitar {
  const mobile = !!opts.mobile
  const group = new THREE.Group()
  group.name = 'guitar'

  const stringY = (i: number, x: number) => {
    const t = x / SCALE
    const spread = STRING_BRIDGE + (STRING_NUT - STRING_BRIDGE) * t
    return spread * (1 - (2 * i) / 5)
  }
  const stringZ = (x: number) => Z_SADDLE + (Z_NUT - Z_SADDLE) * (x / SCALE)
  const boardW = (x: number) => END_W + (NUT_W - END_W) * ((x - BOARD_END) / (SCALE - BOARD_END))

  /* ---- body ---- */
  const outline = bodyOutline()
  const body = new THREE.Group()
  body.name = 'body'
  const topZ = (x: number, y: number) => domeAt(distToPolyline(x, y, outline))

  // side wall: extruded, split off, smooth normals, tapered depth
  {
    const shape = new THREE.Shape(outline)
    const ex = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1, steps: 3 })
    const g0 = ex.groups[0]
    const capHalf = g0.count / 2
    const wallStart = ex.groups[1].start
    const pick = (name: string, from: number, to: number) => {
      const a = ex.getAttribute(name) as THREE.BufferAttribute
      return new THREE.BufferAttribute((a.array as Float32Array).slice(from * a.itemSize, to * a.itemSize), a.itemSize)
    }
    // the back (the first cap is z = 0 → after the transform it's the back)
    const back = new THREE.BufferGeometry()
    back.setAttribute('position', pick('position', 0, capHalf))
    let wall = new THREE.BufferGeometry()
    wall.setAttribute('position', pick('position', wallStart, ex.attributes.position.count))
    ex.dispose()
    wall = mergeVertices(wall, 1e-5)
    const taper = (geo: THREE.BufferGeometry, isWall: boolean) => {
      const p = geo.attributes.position
      const depth = new Float32Array(p.count)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const e = p.getZ(i) // 0 at the back, 1 at the top
        const d = depthAt(x)
        depth[i] = 1 - e
        p.setZ(i, -d * (1 - e) + (isWall && e > 0.999 ? 0.0015 : 0))
      }
      geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
      geo.computeVertexNormals()
    }
    taper(back, false)
    taper(wall, true)
    const sideMat = sapeleMaterial({ bands: true })
    const backMat = sapeleMaterial({ bands: false })
    const backMesh = new THREE.Mesh(back, backMat.mat)
    const wallMesh = new THREE.Mesh(wall, sideMat.mat)
    backMesh.name = 'shell-back'
    wallMesh.name = 'shell-wall'
    for (const m of [backMesh, wallMesh]) {
      m.castShadow = true
      m.receiveShadow = true
      body.add(m)
    }
    ;(body.userData as { shellMats: { value: number }[] }).shellMats = [sideMat.uniforms.uFinish, backMat.uniforms.uFinish]
  }

  // the top: outline with the soundhole, subdivided, domed; aEdge for the binding
  const topTone = opts.top ?? 'natural'
  const top = topMaterial(topTone)
  let topMesh: THREE.Mesh
  {
    const shape = new THREE.Shape(outline)
    const hole = new THREE.Path()
    hole.absarc(SOUNDHOLE.x, SOUNDHOLE.y, SOUNDHOLE_R, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const flat = new THREE.ShapeGeometry(shape, 64)
    const geo = subdivide(flat, mobile ? 3 : 4)
    flat.dispose()
    const p = geo.attributes.position
    const edge = new Float32Array(p.count)
    for (let i = 0; i < p.count; i++) {
      const d = distToPolyline(p.getX(i), p.getY(i), outline)
      edge[i] = d
      p.setZ(i, domeAt(d))
    }
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1))
    geo.computeVertexNormals()
    topMesh = new THREE.Mesh(geo, top.mat)
    topMesh.castShadow = true
    topMesh.receiveShadow = true
    body.add(topMesh)
    // inside the soundhole: the top's edge (a short spruce wall) and the dark interior
    const edgeRing = new THREE.Mesh(
      new THREE.CylinderGeometry(SOUNDHOLE_R, SOUNDHOLE_R, 0.03, 64, 1, true).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#b98c55', roughness: 0.8, side: THREE.BackSide }),
    )
    edgeRing.position.set(SOUNDHOLE.x, SOUNDHOLE.y, -0.013)
    body.add(edgeRing)
    const inside = new THREE.Mesh(
      new THREE.CircleGeometry(SOUNDHOLE_R * 1.02, 48),
      new THREE.MeshStandardMaterial({ color: '#1c0e07', roughness: 0.9 }),
    )
    inside.position.set(SOUNDHOLE.x, SOUNDHOLE.y, -depthAt(SOUNDHOLE.x) + 0.04)
    body.add(inside)
    // two braces glimpsed through the hole
    const brace = new THREE.MeshStandardMaterial({ color: '#8c6236', roughness: 0.85 })
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.1), brace)
      b.position.set(SOUNDHOLE.x - 0.62, 0, -0.07)
      b.rotation.z = s * 0.52
      body.add(b)
    }
  }

  // tortoiseshell pickguard (a teardrop hugging the soundhole, treble side)
  let pickguard: THREE.Mesh
  {
    const pg = new THREE.Shape()
    const c = SOUNDHOLE
    const R = SOUNDHOLE_R + 0.215
    // hug the rosette from the bridge side (180°) round to the treble side
    // (~290°), then sweep out and down toward the bridge: a Martin teardrop
    const a0 = Math.PI
    const a1 = (292 * Math.PI) / 180
    pg.moveTo(c.x + Math.cos(a0) * R, c.y + Math.sin(a0) * R)
    pg.absarc(c.x, c.y, R, a0, a1, false)
    pg.bezierCurveTo(c.x + 0.1, c.y - 1.12, c.x - 0.5, c.y - 1.32, c.x - 0.98, c.y - 1.0)
    pg.bezierCurveTo(c.x - 1.22, c.y - 0.62, c.x - 1.02, c.y - 0.1, c.x + Math.cos(a0) * R, c.y + Math.sin(a0) * R)
    const g = new THREE.ShapeGeometry(pg, 48)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 0.9)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setZ(i, topZ(p.getX(i), p.getY(i)) + 0.0025)
    g.computeVertexNormals()
    pickguard = new THREE.Mesh(
      g,
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: tortoiseMap(), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08, transparent: true, opacity: 0.96 }),
    )
    pickguard.receiveShadow = true
    body.add(pickguard)
  }

  /* ---- bridge (black Richlite belly bridge, white saddle and pins) ---- */
  const bridge = new THREE.Group()
  {
    const bw = 1.52
    const bs = new THREE.Shape()
    // a belly bridge: straight front (toward the soundhole), wings tapering, a belly behind the pins
    bs.moveTo(0.075, -bw / 2)
    bs.lineTo(0.075, bw / 2)
    bs.quadraticCurveTo(-0.05, bw / 2 + 0.01, -0.12, bw / 2 - 0.06)
    bs.lineTo(-0.2, 0.42)
    bs.quadraticCurveTo(-0.32, 0.3, -0.33, 0)
    bs.quadraticCurveTo(-0.32, -0.3, -0.2, -0.42)
    bs.lineTo(-0.12, -bw / 2 + 0.06)
    bs.quadraticCurveTo(-0.05, -bw / 2 - 0.01, 0.075, -bw / 2)
    const g = new THREE.ExtrudeGeometry(bs, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 3, curveSegments: 8 })
    const m = new THREE.Mesh(g, richlite(0.35))
    m.position.z = topZ(-0.1, 0)
    m.castShadow = true
    m.receiveShadow = true
    bridge.add(m)
    // the compensated saddle: slanted (bass further back), protruding above the bridge
    const saddle = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.64, 0.06, 2, 0.01), bone())
    saddle.position.set(-0.012, 0, Z_SADDLE - 0.03)
    saddle.rotation.z = 0.045
    bridge.add(saddle)
    // six bridge pins: white with a black dot
    const pin = new THREE.CylinderGeometry(0.03, 0.028, 0.025, 16).rotateX(Math.PI / 2)
    const dot = new THREE.CircleGeometry(0.011, 12)
    const dotMat = new THREE.MeshBasicMaterial({ color: '#141211' })
    for (let i = 0; i < 6; i++) {
      const y = stringY(i, 0) * 0.98
      const p = new THREE.Mesh(pin, bone())
      p.position.set(-0.155, y, topZ(-0.1, 0) + 0.087 + 0.012)
      const d = new THREE.Mesh(dot, dotMat)
      d.position.set(-0.155, y, topZ(-0.1, 0) + 0.087 + 0.0255)
      bridge.add(p, d)
    }
    body.add(bridge)
  }
  group.add(body)

  /* ---- neck + fingerboard ---- */
  const neck = new THREE.Group()
  neck.name = 'neck'
  {
    // the neck shaft: a C-shape section under the board, the heel into the body
    const nx = 28
    const na = 12
    const x0 = NECK_JOINT - 0.06
    const x1 = SCALE + 0.06
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx
      const w = boardW(Math.max(x, BOARD_END)) * 0.5
      const u = (x - x0) / (x1 - x0)
      // a deep heel near the body, a slim C at the nut
      const dep = 0.26 + 0.55 * Math.pow(1 - Math.min(1, u * 6), 2)
      for (let j = 0; j <= na; j++) {
        const a = Math.PI + (Math.PI * j) / na
        pos.push(x, Math.cos(a) * w, BOARD_TOP - 0.06 + Math.sin(a) * dep)
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < na; j++) {
        const a = i * (na + 1) + j
        const b = a + na + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#7a4424', roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.3 }))
    m.castShadow = true
    m.receiveShadow = true
    neck.add(m)
  }
  {
    // the board: black Richlite, tapered, over the body to the soundhole
    const g = new THREE.BoxGeometry(1, 1, 0.06, 1, 1, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = BOARD_END + (p.getX(i) + 0.5) * (SCALE - BOARD_END)
      p.setXYZ(i, x, p.getY(i) * boardW(x), BOARD_TOP - 0.03 + p.getZ(i))
    }
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, richlite(0.5))
    m.receiveShadow = true
    neck.add(m)
  }
  // frets: nickel half-rounds
  const fretGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 10, 1, false, 0, Math.PI)
  fretGeo.rotateY(-Math.PI / 2)
  const frets = new THREE.InstancedMesh(fretGeo, new THREE.MeshStandardMaterial({ color: '#d8d3c8', metalness: 1, roughness: 0.16 }), FRETS)
  {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    for (let n = 1; n <= FRETS; n++) {
      const x = fretX(n)
      s.set(1, boardW(x), 1)
      m.compose(new THREE.Vector3(x, 0, BOARD_TOP), q, s)
      frets.setMatrixAt(n - 1, m)
    }
    frets.instanceMatrix.needsUpdate = true
  }
  neck.add(frets)
  // white dots at 3 5 7 9 12 15
  const dotGeos: THREE.BufferGeometry[] = []
  for (const n of [3, 5, 7, 9, 12, 15]) {
    const cx = (fretX(n) + fretX(n - 1)) / 2
    const ys = n === 12 ? [-0.1, 0.1] : [0]
    for (const y of ys) {
      const d = new THREE.CircleGeometry(0.034, 20)
      d.translate(cx, y, BOARD_TOP + 0.0008)
      dotGeos.push(d)
    }
  }
  const inlays = new THREE.Mesh(mergeGeometries(dotGeos), new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.3 }))
  neck.add(inlays)
  // the white Corian nut
  const nut = new THREE.Mesh(new THREE.BoxGeometry(0.05, NUT_W, 0.07), bone())
  nut.position.set(SCALE + 0.025, 0, BOARD_TOP + 0.005)
  neck.add(nut)
  group.add(neck)

  /* ---- headstock: solid, black face, closed chrome tuners, GJP monogram ---- */
  const headstock = new THREE.Group()
  headstock.name = 'headstock'
  headstock.position.set(SCALE + 0.05, 0, BOARD_TOP - 0.02)
  headstock.rotation.y = 0.26
  const tuners = new THREE.Group()
  let logo: THREE.Mesh
  {
    const hs = new THREE.Shape()
    const pts: [number, number][] = [
      [0, -0.24],
      [0.25, -0.33],
      [1.65, -0.4],
      [1.74, -0.38],
      [1.76, 0],
      [1.74, 0.38],
      [1.65, 0.4],
      [0.25, 0.33],
      [0, 0.24],
    ]
    hs.moveTo(pts[0][0], pts[0][1])
    for (const [x, y] of pts.slice(1)) hs.lineTo(x, y)
    hs.closePath()
    const g = new THREE.ExtrudeGeometry(hs, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1 })
    g.translate(0, 0, -0.14)
    const face = new THREE.Mesh(g, [richlite(0.3), new THREE.MeshPhysicalMaterial({ color: '#7a4424', roughness: 0.5, clearcoat: 0.3 })])
    face.castShadow = true
    face.receiveShadow = true
    headstock.add(face)
    // the monogram decal
    logo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.31),
      new THREE.MeshStandardMaterial({
        map: monogramMap(),
        emissiveMap: monogramMap(),
        emissive: new THREE.Color('#6b5a3c'),
        transparent: true,
        roughness: 0.35,
        metalness: 0,
        depthWrite: false,
      }),
    )
    logo.rotation.z = -Math.PI / 2
    logo.position.set(1.38, 0, 0.0135)
    headstock.add(logo)
    // closed chrome tuners: posts + nuts on the face, sealed housings on the back, large buttons
    const ch = chrome(0.24)
    const post = new THREE.CylinderGeometry(0.03, 0.034, 0.1, 12).rotateX(Math.PI / 2)
    const nutG = new THREE.CylinderGeometry(0.055, 0.055, 0.022, 6).rotateX(Math.PI / 2)
    const housing = new RoundedBoxGeometry(0.2, 0.2, 0.13, 3, 0.05)
    const shaft = new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8)
    const btn = new THREE.SphereGeometry(0.12, 18, 12)
    btn.scale(1, 0.34, 0.82)
    for (let k = 0; k < 6; k++) {
      const side = k < 3 ? 1 : -1
      const u = [0.52, 0.98, 1.44][k % 3]
      const v = side * 0.29
      const t = new THREE.Group()
      const p = new THREE.Mesh(post, ch)
      p.position.set(u, v, 0.05)
      const n = new THREE.Mesh(nutG, ch)
      n.position.set(u, v, 0.012)
      const h = new THREE.Mesh(housing, ch)
      h.position.set(u, v + side * 0.08, -0.22)
      const s = new THREE.Mesh(shaft, ch)
      s.position.set(u, v + side * 0.25, -0.22)
      const b = new THREE.Mesh(btn, ch)
      b.position.set(u, v + side * 0.38, -0.22)
      b.castShadow = true
      t.add(p, n, h, s, b)
      tuners.add(t)
    }
    headstock.add(tuners)
  }
  group.add(headstock)

  /* ---- strings ---- */
  const from: THREE.Vector3[] = []
  const to: THREE.Vector3[] = []
  for (let i = 0; i < 6; i++) {
    // the compensated saddle: the bass strings break a little further back
    from.push(new THREE.Vector3(-0.03 + 0.009 * i, stringY(i, 0), Z_SADDLE))
    to.push(new THREE.Vector3(SCALE + 0.02, stringY(i, SCALE), Z_NUT))
  }
  const bronze = new THREE.Color('#d4a266')
  const steel = new THREE.Color('#e4e0d8')
  const strings = new Strings({
    from,
    to,
    radius: GAUGE,
    wound: WOUND,
    tints: WOUND.map(w => (w ? bronze.clone() : steel.clone())),
    swing: new THREE.Vector3(0, 1, 0.3),
  })
  group.add(strings.group)
  // the short runs: saddle → bridge pin, nut → tuner post
  let runs: THREE.Mesh
  {
    const g: THREE.BufferGeometry[] = []
    const seg = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const c = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 5, 1, true)
      c.rotateZ(Math.PI / 2)
      c.applyMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3().subVectors(b, a).normalize()),
        ),
      )
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.5)
      c.translate(mid.x, mid.y, mid.z)
      g.push(c)
    }
    const hsM = new THREE.Matrix4().compose(headstock.position, new THREE.Quaternion().setFromEuler(headstock.rotation), new THREE.Vector3(1, 1, 1))
    for (let i = 0; i < 6; i++) {
      const r = Math.max(0.0035, GAUGE[i])
      seg(from[i], new THREE.Vector3(-0.155, stringY(i, 0) * 0.98, topZ(-0.1, 0) + 0.1), r)
      const u = [0.52, 0.98, 1.44][i % 3]
      const side = i < 3 ? 1 : -1
      const postTop = new THREE.Vector3(u, side * 0.29, 0.08).applyMatrix4(hsM)
      seg(to[i], postTop, r)
    }
    runs = new THREE.Mesh(mergeGeometries(g), new THREE.MeshStandardMaterial({ color: '#c9975c', metalness: 1, roughness: 0.3 }))
    runs.name = 'string-runs'
    group.add(runs)
  }

  const logoAt = new THREE.Vector3(1.38, 0, 0.02).applyMatrix4(
    new THREE.Matrix4().compose(headstock.position, new THREE.Quaternion().setFromEuler(headstock.rotation), new THREE.Vector3(1, 1, 1)),
  )

  const shellMats = (body.userData as { shellMats: { value: number }[] }).shellMats
  const shell = body.children.filter(c => c.name === 'shell-back' || c.name === 'shell-wall') as THREE.Mesh[]
  const guitar: Guitar = {
    group,
    strings,
    parts: { body, top: topMesh!, shell, neck, headstock, logo: logo!, bridge, pickguard: pickguard!, frets, inlays, tuners, runs: runs! },
    finish: 1,
    fretX,
    stringY,
    stringZ,
    topZ,
    logoAt,
    update(frame, camera, renderer) {
      top.uniforms.uFinish.value = guitar.finish
      for (const u of shellMats) u.value = guitar.finish
      strings.update(frame, camera, renderer)
    },
  }
  return guitar
}
