import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { blackGloss, chrome, mahogany, nickel, rubber } from '../../kit/materials'
import type { Case } from './case'
import { BODY_H, FLOOR_Y } from './case'
import {
  STICKERS,
  calendarMap,
  cdInsertMap,
  cdLabelMap,
  crisp,
  postcardMap,
  reelLabelMap,
  roadMapMap,
  sheetMusicMap,
  stickerMap,
  tapeMap,
  tapePackMap,
  testCardMap,
  ticketMap,
  vhsFaceMap,
  vhsSpineMap,
} from './prints'

/*
 * THE KEEPSAKES — one per STORY beat, in the case and round it:
 *   1 a Long Island postcard, taped inside the lid
 *   2 a page of piano practice with an octave of old piano keys on it
 *   3 a VHS tape, hand-labelled, a tortoise pick left on it
 *   4 a little 1970s portable TV on the floor by the case, glowing warm
 *   5 the Like a Movie CD (our own plain typographic insert, not the art)
 *   6 a folded road map, South Jersey ringed in pen
 *   7 a wall-calendar sheet: summer 2014, 88 of 100 days struck through
 *   8 a World Cafe Live ticket stub, taped inside the lid
 *   9 a 2-inch tape reel (Volume ONE) leaning on the case
 * plus the influences as stickers inside the lid.
 *
 * Every keepsake reports its focus in world space for the camera (centre +
 * a framing radius). Units: 1 = 10 cm.
 */

export interface Keepsake {
  /** the object that bounds the keepsake (for the focus) */
  obj: THREE.Object3D
  /** framing radius (world units) */
  r: number
  /** extra offset added to the bounding-box centre (world) */
  nudge?: THREE.Vector3
}

export interface TV {
  group: THREE.Group
  screen: THREE.ShaderMaterial
  light: THREE.PointLight
  /** screen centre (world, after placement) */
  at: THREE.Vector3
}

export interface Keepsakes {
  items: Keepsake[]
  tv: TV
  /** the reel's hub (world): the out push aims into it */
  hub: THREE.Vector3
  /** press the white piano keys: depth 0..1 per key (8, low to high) */
  pressKeys(depth: number[]): void
}

const paperMat = (map: THREE.Texture, rough = 0.82) =>
  new THREE.MeshStandardMaterial({ color: '#efe7da', map: crisp(map), roughness: rough, side: THREE.DoubleSide })

/** a flat print on the lid (PlaneGeometry facing the camera), with a gentle bow */
function lidPrint(c: Case, map: THREE.Texture, w: number, h: number, x: number, z: number, spin = 0, lift = 0.01) {
  const geo = new THREE.PlaneGeometry(w, h, 6, 6)
  // bow away from the velvet a touch at the free edges
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2)
    const v = p.getY(i) / (h / 2)
    p.setZ(i, 0.018 * (u * u) + 0.012 * Math.max(0, -v))
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, paperMat(map))
  const pose = c.onLid(x, z, lift, spin)
  m.position.copy(pose.position)
  m.quaternion.copy(pose.quaternion)
  m.receiveShadow = true
  c.inside.add(m)
  return m
}

/** a strip of masking tape over a print's corner (child of the print, just in front) */
function tapeOn(print: THREE.Mesh, tape: THREE.Material, x: number, y: number, angle: number, len = 0.42) {
  const t = new THREE.Mesh(new THREE.PlaneGeometry(len, len * 0.3), tape)
  t.position.set(x, y, 0.028)
  t.rotation.z = angle
  t.receiveShadow = true
  print.add(t)
  return t
}

/* ---------------------------------------------------------------- the TV */

const SCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SCREEN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uPower;
  uniform float uLive;
  varying vec2 vUv;
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main() {
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    // a CRT's bulge: the picture bows out toward the corners
    vec2 bu = 0.5 + c * (0.94 + 0.12 * r2);
    vec3 col = texture2D(uMap, bu).rgb;
    // scanlines, a slow hum bar rolling up the picture, a quiet shimmer
    float sl = 0.84 + 0.16 * sin(bu.y * 3.14159 * 220.0);
    float bar = 1.0 + 0.07 * uLive * sin((bu.y - uTime * 0.06) * 6.28318);
    float n = (hash(floor(bu * vec2(180.0, 136.0)) + floor(uTime * 7.0)) - 0.5) * 0.05 * uLive;
    // tungsten-warm: the old phosphor glows amber
    col = col * vec3(1.08, 0.94, 0.78);
    col = col * sl * bar + n;
    // rounded-corner mask and the tube's falloff
    vec2 q = abs(c) - vec2(0.5 - 0.1);
    float d = length(max(q, 0.0)) - 0.1;
    float mask = 1.0 - smoothstep(-0.012, 0.0, d);
    float fall = 1.0 - 0.55 * smoothstep(0.06, 0.34, r2);
    vec3 glass = vec3(0.012, 0.01, 0.009);
    gl_FragColor = vec4(mix(glass, col * fall * uPower, mask), 1.0);
  }
`

function buildTV(mobile: boolean): TV {
  const group = new THREE.Group()
  group.name = 'tv'
  const W = 2.0
  const H = 1.56
  const D = 1.5
  // a walnut-grain cabinet (it recedes into the dark until its own beat)
  const plastic = mahogany()
  plastic.color.set('#e2b89a')
  plastic.clearcoat = 0.5
  plastic.clearcoatRoughness = 0.25
  const bezel = new THREE.MeshStandardMaterial({ color: '#191512', roughness: 0.5, metalness: 0.1 })
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.2), plastic)
  body.position.y = H / 2 + 0.06
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  // the dark front panel
  const panel = new THREE.Mesh(new RoundedBoxGeometry(W - 0.16, H - 0.16, 0.06, 3, 0.06), bezel)
  panel.position.set(0, H / 2 + 0.06, D / 2 - 0.01)
  panel.receiveShadow = true
  group.add(panel)
  // the tube's face: a bulging, rounded screen
  const sw = 1.26
  const sh = 0.96
  const sg = new THREE.PlaneGeometry(sw, sh, 16, 12)
  const p = sg.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (sw / 2)
    const v = p.getY(i) / (sh / 2)
    p.setZ(i, 0.055 * (1 - u * u * 0.8) * (1 - v * v * 0.8))
  }
  sg.computeVertexNormals()
  const screen = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: testCardMap(mobile ? 0.5 : 1) },
      uTime: { value: 0 },
      uPower: { value: 0.5 },
      uLive: { value: 1 },
    },
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
  })
  const scr = new THREE.Mesh(sg, screen)
  const sx = -0.22
  const sy = H / 2 + 0.08
  scr.position.set(sx, sy, D / 2 + 0.025)
  group.add(scr)
  // a chrome trim round the tube
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 6, 48), chrome(0.2))
  trim.scale.set(sw / 2 + 0.03, sh / 2 + 0.03, 1)
  trim.position.set(sx, sy, D / 2 + 0.03)
  group.add(trim)
  // the control strip: a channel dial, a volume knob, speaker slots
  const kx = W / 2 - 0.3
  const knobMat = new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.4, metalness: 0.2 })
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.1, 12).rotateX(Math.PI / 2), knobMat)
  dial.position.set(kx, sy + 0.3, D / 2 + 0.07)
  dial.castShadow = true
  group.add(dial)
  const dialCap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20).rotateX(Math.PI / 2), nickel(0.25))
  dialCap.position.set(kx, sy + 0.3, D / 2 + 0.125)
  group.add(dialCap)
  const vol = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 16).rotateX(Math.PI / 2), knobMat)
  vol.position.set(kx, sy - 0.02, D / 2 + 0.06)
  group.add(vol)
  const slot = new THREE.BoxGeometry(0.26, 0.022, 0.02)
  const slotMat = new THREE.MeshStandardMaterial({ color: '#070605', roughness: 0.9 })
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(slot, slotMat)
    s.position.set(kx, sy - 0.24 - i * 0.055, D / 2 + 0.03)
    group.add(s)
  }
  // carry handle on top
  const handle = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.55, 0, 0),
        new THREE.Vector3(-0.5, 0.16, 0),
        new THREE.Vector3(0, 0.2, 0),
        new THREE.Vector3(0.5, 0.16, 0),
        new THREE.Vector3(0.55, 0, 0),
      ]),
      24,
      0.03,
      8,
    ),
    chrome(0.15),
  )
  handle.position.set(0, H + 0.06, 0.15)
  handle.castShadow = true
  group.add(handle)
  // rabbit ears
  const earMat = chrome(0.32)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 16), earMat)
  base.position.set(0.2, H + 0.08, -0.4)
  group.add(base)
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 1.05, 6), earMat)
    rod.geometry.translate(0, 0.525, 0)
    rod.position.copy(base.position)
    rod.rotation.set(-0.06, 0, s * 0.5)
    group.add(rod)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), earMat)
    tip.position.set(0, 1.05, 0)
    rod.add(tip)
  }
  // feet
  const foot = new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10)
  const fm = rubber()
  for (const [x, z] of [
    [-0.8, 0.55],
    [0.8, 0.55],
    [-0.8, -0.55],
    [0.8, -0.55],
  ]) {
    const f = new THREE.Mesh(foot, fm)
    f.position.set(x, 0.03, z)
    group.add(f)
  }
  // the glow the screen throws into the room (driven by intensity only)
  const light = new THREE.PointLight('#ffbf86', 0, 9, 2)
  light.position.set(sx, sy, D / 2 + 0.6)
  group.add(light)
  return { group, screen, light, at: new THREE.Vector3(sx, sy, D / 2 + 0.06) }
}

/* ---------------------------------------------------------------- the reel */

function buildReel(mobile: boolean) {
  const group = new THREE.Group()
  group.name = 'reel'
  const R = 1.335
  // a flange: a disc with three windows and the hub hole
  const flange = new THREE.Shape()
  flange.absarc(0, 0, R, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, 0.4, 0, Math.PI * 2, true)
  flange.holes.push(hole)
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2 + 0.36 + Math.PI / 2
    const a1 = a0 + Math.PI * 2 * 0.2
    const w = new THREE.Path()
    const r0 = 0.62
    const r1 = 1.12
    w.absarc(0, 0, r1, a1, a0, true)
    w.absarc(0, 0, r0, a0, a1, false)
    w.closePath()
    flange.holes.push(w)
  }
  const fg = new THREE.ExtrudeGeometry(flange, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: mobile ? 32 : 48 })
  fg.translate(0, 0, -0.011)
  const alu = new THREE.MeshStandardMaterial({ color: '#d6d2ca', metalness: 1, roughness: 0.4 })
  for (const z of [0.27, -0.27]) {
    const f = new THREE.Mesh(fg, alu)
    f.position.z = z
    f.castShadow = true
    f.receiveShadow = true
    group.add(f)
  }
  // the wound tape and the hub
  const packMap = tapePackMap(mobile ? 0.5 : 1)
  const side = new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.32, metalness: 0.1 })
  const face = new THREE.MeshStandardMaterial({ color: '#ffffff', map: packMap, roughness: 0.42 })
  const pack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 64, 1, false).rotateX(Math.PI / 2), [side, face, face])
  pack.castShadow = true
  pack.receiveShadow = true
  group.add(pack)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.56, 40, 1, true).rotateX(Math.PI / 2), nickel(0.3))
  group.add(hub)
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.58, 32, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0c0908', roughness: 0.8, side: THREE.BackSide }))
  group.add(pit)
  // the hub's keyways
  for (let k = 0; k < 3; k++) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.56), nickel(0.3))
    const a = (k / 3) * Math.PI * 2
    key.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0)
    key.rotation.z = a + Math.PI / 2
    group.add(key)
  }
  // masking tape on the front flange, in marker
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.37), new THREE.MeshStandardMaterial({ color: '#ffffff', map: crisp(reelLabelMap(mobile ? 0.5 : 1)), roughness: 0.8, alphaTest: 0.5 }))
  label.position.set(-0.05, -0.86, 0.29)
  label.rotation.z = 0.04
  label.receiveShadow = true
  group.add(label)
  return group
}

/* ---------------------------------------------------------------- the rest */

function buildKeys() {
  const group = new THREE.Group() as THREE.Group & { press?: (d: number[]) => void }
  group.name = 'keys'
  const pitch = 0.236
  const ivory = new THREE.MeshPhysicalMaterial({ color: '#efe4cc', roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.2 })
  const white = new THREE.InstancedMesh(new RoundedBoxGeometry(pitch - 0.014, 0.2, 1.48, 2, 0.02), ivory, 8)
  const m = new THREE.Matrix4()
  for (let i = 0; i < 8; i++) {
    m.makeTranslation((i - 3.5) * pitch, 0.1, 0)
    white.setMatrixAt(i, m)
  }
  white.castShadow = true
  white.receiveShadow = true
  group.add(white)
  // a key goes down at the front, pivoting near the back rail
  const r = new THREE.Matrix4()
  const last = new Float32Array(8)
  group.press = (d: number[]) => {
    let changed = false
    for (let i = 0; i < 8; i++) {
      const v = d[i] ?? 0
      if (Math.abs(v - last[i]) < 1e-4) continue
      last[i] = v
      changed = true
      r.makeRotationX(v * 0.045)
      m.makeTranslation((i - 3.5) * pitch, 0.1 - v * 0.012, -0.72).multiply(r).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.72))
      white.setMatrixAt(i, m)
    }
    if (changed) white.instanceMatrix.needsUpdate = true
  }
  const black = new THREE.InstancedMesh(new RoundedBoxGeometry(0.13, 0.14, 0.9, 2, 0.02), blackGloss(), 5)
  let k = 0
  for (const i of [0, 1, 3, 4, 5]) {
    m.makeTranslation((i + 0.5 - 3.5) * pitch, 0.25, -0.29)
    black.setMatrixAt(k++, m)
  }
  black.castShadow = true
  black.receiveShadow = true
  group.add(black)
  const wood = mahogany()
  const rail = new THREE.Mesh(new RoundedBoxGeometry(8 * pitch + 0.26, 0.3, 0.24, 2, 0.03), wood)
  rail.position.set(0, 0.15, -0.86)
  rail.castShadow = true
  rail.receiveShadow = true
  group.add(rail)
  const felt = new THREE.Mesh(new THREE.BoxGeometry(8 * pitch, 0.03, 0.05), new THREE.MeshStandardMaterial({ color: '#8e2c1c', roughness: 0.95 }))
  felt.position.set(0, 0.21, -0.74)
  group.add(felt)
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.3, 1.74, 2, 0.03), wood)
    cheek.position.set(s * (4 * pitch + 0.07), 0.15, -0.13)
    cheek.castShadow = true
    cheek.receiveShadow = true
    group.add(cheek)
  }
  return group
}

/** a 351-shaped pick (flat), celluloid tortoise */
function buildPick(color = '#7a3212') {
  const s = new THREE.Shape()
  s.moveTo(0, -0.17)
  s.bezierCurveTo(0.07, -0.1, 0.16, 0.02, 0.15, 0.1)
  s.bezierCurveTo(0.14, 0.17, 0.06, 0.18, 0, 0.18)
  s.bezierCurveTo(-0.06, 0.18, -0.14, 0.17, -0.15, 0.1)
  s.bezierCurveTo(-0.16, 0.02, -0.07, -0.1, 0, -0.17)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false, curveSegments: 10 })
  g.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }))
  m.receiveShadow = true
  return m
}

function buildVHS(mobile: boolean) {
  const group = new THREE.Group()
  const s = mobile ? 0.5 : 1
  const shell = new THREE.MeshStandardMaterial({ color: '#141211', roughness: 0.5 })
  const face = new THREE.MeshStandardMaterial({ color: '#ffffff', map: crisp(vhsFaceMap(s)), roughness: 0.5 })
  const spine = new THREE.MeshStandardMaterial({ color: '#ffffff', map: crisp(vhsSpineMap(s)), roughness: 0.6 })
  const box = new THREE.Mesh(new RoundedBoxGeometry(1.87, 0.25, 1.03, 2, 0.025), [shell, shell, face, shell, spine, shell])
  box.position.y = 0.125
  box.castShadow = true
  box.receiveShadow = true
  group.add(box)
  const pick = buildPick()
  pick.position.set(0.55, 0.252, 0.22)
  pick.rotation.y = 0.9
  group.add(pick)
  return group
}

function buildCD(mobile: boolean) {
  const group = new THREE.Group()
  const s = mobile ? 0.5 : 1
  const tray = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.05, 1.25, 2, 0.01), new THREE.MeshStandardMaterial({ color: '#0e0c0b', roughness: 0.35 }))
  tray.position.y = 0.025
  tray.castShadow = true
  tray.receiveShadow = true
  group.add(tray)
  const insert = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2 * (264 / 300)).rotateX(-Math.PI / 2), paperMat(cdInsertMap(s), 0.7))
  insert.position.set(0.06, 0.056, 0)
  insert.receiveShadow = true
  group.add(insert)
  const lid = new THREE.Mesh(
    new RoundedBoxGeometry(1.42, 0.045, 1.25, 2, 0.01),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
  )
  lid.position.y = 0.08
  group.add(lid)
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 1.25), new THREE.MeshStandardMaterial({ color: '#0e0c0b', roughness: 0.35 }))
  spine.position.set(-0.71, 0.05, 0)
  group.add(spine)
  // the disc, out of its case, lying across it
  const disc = new THREE.Group()
  const metal = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.012, 64), new THREE.MeshStandardMaterial({ color: '#d8d6d2', metalness: 1, roughness: 0.16 }))
  disc.add(metal)
  const label = new THREE.Mesh(new THREE.RingGeometry(0.21, 0.585, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', map: crisp(cdLabelMap(s)), roughness: 0.55 }))
  label.position.y = 0.0065
  label.receiveShadow = true
  disc.add(label)
  const hubRing = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.21, 48, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b8b4ac', roughness: 0.25, metalness: 0.4 }))
  hubRing.position.y = 0.0066
  disc.add(hubRing)
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#060504' }))
  hole.position.y = 0.0067
  disc.add(hole)
  disc.position.set(0.5, 0.115, -0.12)
  disc.rotation.set(0.03, 0.4, -0.02)
  disc.traverse(o => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh && o === metal))
  group.add(disc)
  return group
}

function buildMap(mobile: boolean) {
  const W = 2.0
  const H = 2.0 * (380 / 560)
  const geo = new THREE.PlaneGeometry(W, H, 4, 6)
  geo.rotateX(-Math.PI / 2)
  // accordion folds: ridges at the 1st and 3rd creases
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const col = Math.round(((p.getX(i) + W / 2) / W) * 4)
    const v = p.getZ(i) / (H / 2)
    // accordion ridges, and a gentle sag where it bridges the neck channel
    p.setY(i, (col % 2 === 1 ? 0.07 : 0.004) - 0.1 * (1 - v * v))
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, paperMat(roadMapMap(mobile ? 0.5 : 1)))
  m.castShadow = true
  m.receiveShadow = true
  const g = new THREE.Group()
  g.add(m)
  return g
}

function buildSheet(mobile: boolean) {
  const W = 2.2
  const H = 2.8
  const geo = new THREE.PlaneGeometry(W, H, 10, 10)
  geo.rotateX(-Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (W / 2)
    const v = p.getZ(i) / (H / 2)
    // a soft curl at the far edge and the fold's gentle tent
    p.setY(i, 0.004 + 0.05 * Math.max(0, -v - 0.6) * Math.max(0, -v - 0.6) * 4 + 0.03 * (1 - Math.abs(u)))
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, paperMat(sheetMusicMap(mobile ? 0.5 : 1)))
  m.receiveShadow = true
  return m
}

/* ---------------------------------------------------------------- build */

export function buildKeepsakes(c: Case, mobile: boolean): Keepsakes {
  const s = mobile ? 0.5 : 1
  const group = c.group
  const tapeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tapeMap(s), roughness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide })
  const items: Keepsake[] = []

  // 1 · the postcard, taped inside the lid (lower bout)
  const postcard = lidPrint(c, postcardMap(s), 1.4, 0.9, -4.05, 0.62, -0.07)
  tapeOn(postcard, tapeMat, -0.62, 0.4, 0.5)
  tapeOn(postcard, tapeMat, 0.62, 0.4, -0.45)
  items.push({ obj: postcard, r: 1.3 })

  // 2 · piano: a page of practice, an octave of keys on it (lower bout)
  const piano = new THREE.Group()
  const sheet = buildSheet(mobile)
  sheet.rotation.y = 0.12
  piano.add(sheet)
  const keys = buildKeys()
  keys.position.set(0.35, 0.03, 0.92)
  keys.rotation.y = -0.22
  piano.add(keys)
  piano.position.set(-4.05, FLOOR_Y + 0.004, -0.42)
  group.add(piano)
  items.push({ obj: piano, r: 1.55 })

  // 3 · the VHS (waist, far side)
  const vhs = buildVHS(mobile)
  vhs.position.set(-2.05, FLOOR_Y + 0.004, -0.62)
  vhs.rotation.y = 0.32
  group.add(vhs)
  items.push({ obj: vhs, r: 1.2 })

  // 4 · the TV, on the floor off the case's tail, turned toward the room
  const tv = buildTV(mobile)
  tv.group.position.set(-7.75, 0.01, 0.2)
  tv.group.rotation.y = 0.38
  group.add(tv.group)
  items.push({ obj: tv.group, r: 1.3, nudge: new THREE.Vector3(0, -0.05, 0) })

  // 5 · the CD (upper bout, near side)
  const cd = buildCD(mobile)
  cd.position.set(-1.35, FLOOR_Y + 0.004, 0.62)
  cd.rotation.y = -0.28
  group.add(cd)
  items.push({ obj: cd, r: 1.1 })

  // 6 · the road map, folded, lying across the neck channel on the shut compartment
  const map = buildMap(mobile)
  map.position.set(1.2, BODY_H + 0.035, 0.02)
  map.rotation.y = 0.08
  group.add(map)
  items.push({ obj: map, r: 1.25 })

  // 7 · the calendar sheet, taped inside the lid (upper bout)
  const cal = lidPrint(c, calendarMap(s), 1.5, 2.0, -1.12, 0.12, 0.04)
  tapeOn(cal, tapeMat, -0.66, 0.96, 0.6)
  tapeOn(cal, tapeMat, 0.66, 0.96, -0.55)
  {
    // the spiral binding along the top
    const n = 15
    const coil = new THREE.InstancedMesh(new THREE.TorusGeometry(0.036, 0.009, 6, 14).rotateY(Math.PI / 2), nickel(0.25), n)
    const m = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      m.makeTranslation(-0.66 + (i / (n - 1)) * 1.32, 0.965, 0.0)
      coil.setMatrixAt(i, m)
    }
    cal.add(coil)
  }
  items.push({ obj: cal, r: 1.5 })

  // 8 · the ticket stub, taped inside the lid (the neck)
  const ticket = lidPrint(c, ticketMap(s), 1.5, 0.6, 1.55, 0.02, 0.06)
  tapeOn(ticket, tapeMat, -0.66, 0.02, 1.35, 0.38)
  items.push({ obj: ticket, r: 0.95 })

  // 9 · the reel, standing on its edge on the floor, leaning on the case's neck
  const reel = buildReel(mobile)
  const lean = 0.24
  reel.rotation.set(-lean, -0.12, 0)
  reel.position.set(3.05, 1.335 * Math.cos(lean) + 0.02, 0.86 + 0.3 + 1.335 * Math.sin(lean) * 0.2)
  group.add(reel)
  items.push({ obj: reel, r: 1.45 })

  // the influences, stuck inside the lid
  const place = [
    { x: -4.72, z: -1.05, w: 0.78, spin: -0.12 },
    { x: -2.95, z: 1.48, w: 1.02, spin: 0.1 },
    { x: -2.85, z: -1.12, w: 1.16, spin: -0.06 },
  ]
  STICKERS.forEach((d, i) => {
    const at = place[i]
    const h = (at.w * d.H) / d.W
    const m = new THREE.Mesh(new THREE.PlaneGeometry(at.w, h), new THREE.MeshStandardMaterial({ color: '#ffffff', map: crisp(stickerMap(d, s)), roughness: 0.45, alphaTest: 0.5 }))
    const pose = c.onLid(at.x, at.z, 0.006, at.spin)
    m.position.copy(pose.position)
    m.quaternion.copy(pose.quaternion)
    m.receiveShadow = true
    c.inside.add(m)
  })

  group.updateMatrixWorld(true)
  tv.at.applyMatrix4(tv.group.matrixWorld)
  const hub = new THREE.Vector3(0, 0, 0.29).applyMatrix4(reel.matrixWorld)
  return { items, tv, hub, pressKeys: d => keys.press?.(d) }
}
