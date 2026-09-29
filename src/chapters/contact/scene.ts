import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { bodyOutline, buildGuitar, SOUNDHOLE, type Guitar } from '../../kit/guitar'
import { cable, gaffer, scaleUv } from '../../kit/stage'
import { FONT, chrome, fontsReady, glow, rubber, tile } from '../../kit/materials'
import { rng, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { ALBUMS } from '../../content'

/*
 * LAST CALL — the set. The room has emptied. On the little corner stage (a
 * worn rug on the floorboards) the guitar leans on the bar stool, its neck
 * resting on the seat's rim; the boom-stand mic still hangs where the singer's
 * mouth was; the setlist is taped to the rug at the stool's feet; a pick lies
 * on the seat. One enamel pendant lamp hangs over it all — the last lamp —
 * and it is the world's spot (the only shadow caster), so the stool legs, the
 * guitar and the stand throw long shadows across the rug.
 *
 * World space (1 unit = 10 cm): the floor is y = 0, the stool stands at
 * STOOL (its seat top SEAT_H up), the audience is toward +Z. The guitar is
 * placed first (standing on the back edge of its tail block, leaning back
 * LEAN rad, turned YAW toward camera-right); the stool is then put where its
 * seat rim meets the back of the neck, so the contact is exact.
 */

export interface LastCallSet {
  group: THREE.Group
  guitar: Guitar
  /** the pendant bulb (the spot hangs here) */
  lampAt: THREE.Vector3
  /** where the lamp aims: the guitar's body */
  heart: THREE.Vector3
  /** the soundhole, world, and the top's outward normal */
  hole: THREE.Vector3
  holeN: THREE.Vector3
  /** framing boxes (centre, half width, half height), world */
  subject: Box
  corner: Box
  /** 0..1: the bulb's glow (the copy "answer" nudges it) */
  setLamp(v: number): void
  /** fade the far boards with the room (0 = dark room, 1 = house lights) */
  setRoom(v: number): void
  /** the festoon strands: chapter progress (they dim) and px per unit at distance 1 */
  setFestoon(local: number, px: number): void
  /** the lamp's cone in the haze: amount, haze time, the camera (the cone fades out round it) */
  setHaze(amount: number, time: number, cam: THREE.Vector3): void
}

export interface Box {
  c: THREE.Vector3
  hw: number
  hh: number
}

const GEL_BULB = '#ffb45e'
const _rel = new THREE.Vector3()
const SEAT_H = 7.4
const SEAT_R = 1.75
/** the guitar tips sideways onto the stool (in the picture plane), and back a little */
const TIP = 0.27
const LEAN = 0.2
const YAW = 0.14

/* ------------------------------------------------------------------ helpers */

/** a tapered tube between two points (for merging); keeps uv so wood maps */
function rodGeo(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 12) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false)
  g.translate(0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(b, a).normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}

/** strip to position + normal (+ uv when asked) so unlike pieces merge */
function clean(g: THREE.BufferGeometry, uv = false) {
  const n = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(uv && k === 'uv')) n.deleteAttribute(k)
  return n
}

/** black powder-coated steel (the mic stand) */
const steel = () => new THREE.MeshStandardMaterial({ color: '#141110', metalness: 0.6, roughness: 0.4 })

/* ------------------------------------------------------------------ textures */

/** warm, varnished floorboards (x along the boards): six boards across the tile */
function floorMap() {
  return tile('lc-floor', 512, 512, (g, w, h) => {
    const r = rng(77)
    const boards = 6
    const bh = h / boards
    for (let i = 0; i < boards; i++) {
      const y0 = i * bh
      const tone = 0.78 + r() * 0.34
      g.fillStyle = `rgb(${Math.round(70 * tone)},${Math.round(44 * tone)},${Math.round(27 * tone)})`
      g.fillRect(0, y0, w, bh)
      // grain: long wandering lines along the board
      for (let k = 0; k < 46; k++) {
        const yy = y0 + r() * bh
        const a = 0.05 + r() * 0.16
        g.strokeStyle = r() > 0.45 ? `rgba(22,12,6,${a})` : `rgba(150,96,56,${a * 0.6})`
        g.lineWidth = 0.5 + r() * 1.6
        g.beginPath()
        g.moveTo(0, yy)
        const ph = r() * 6
        for (let x = 0; x <= w; x += 16) g.lineTo(x, yy + Math.sin(x * 0.011 + ph) * (1 + r() * 1.5))
        g.stroke()
      }
      // a knot or two
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) {
        const kx = r() * w
        const ky = y0 + bh * (0.3 + r() * 0.4)
        for (let q = 5; q > 0; q--) {
          g.strokeStyle = `rgba(24,12,6,${0.12 + q * 0.03})`
          g.lineWidth = 1
          g.beginPath()
          g.ellipse(kx, ky, q * 3.2, q * 1.3, 0, 0, Math.PI * 2)
          g.stroke()
        }
      }
      // worn varnish down the middle of the board
      const wear = g.createLinearGradient(0, y0, 0, y0 + bh)
      wear.addColorStop(0, 'rgba(0,0,0,0.18)')
      wear.addColorStop(0.5, 'rgba(255,200,140,0.03)')
      wear.addColorStop(1, 'rgba(0,0,0,0.2)')
      g.fillStyle = wear
      g.fillRect(0, y0, w, bh)
      // the seam, and a butt joint
      g.fillStyle = 'rgba(6,3,2,0.9)'
      g.fillRect(0, y0, w, 2)
      const jx = r() * w
      g.fillRect(jx, y0, 2, bh)
    }
  })
}

/**
 * The stage rug: an old wool rug, deep madder red gone brown with age, an
 * amber-and-cream border, a lozenge medallion. Non-repeating; fringed ends.
 */
function rugMap() {
  return tile(
    'lc-rug',
    512,
    352,
    (g, w, h) => {
      const r = rng(5)
      const fr = 18 // fringe zone at the short ends
      const x0 = fr
      const x1 = w - fr
      g.clearRect(0, 0, w, h)
      // fringe: cream threads, a little uneven
      g.lineCap = 'round'
      for (let y = 6; y < h - 6; y += 3) {
        for (const side of [0, 1]) {
          const len = fr - 2 - r() * 5
          g.strokeStyle = `rgba(${210 + r() * 20},${192 + r() * 16},${160 + r() * 16},0.95)`
          g.lineWidth = 1.2
          g.beginPath()
          if (side === 0) {
            g.moveTo(x0, y)
            g.lineTo(x0 - len, y + (r() - 0.5) * 2)
          } else {
            g.moveTo(x1, y)
            g.lineTo(x1 + len, y + (r() - 0.5) * 2)
          }
          g.stroke()
        }
      }
      const W = x1 - x0
      const H = h
      // abrash: horizontal bands of slightly different dye lots in the field
      g.fillStyle = '#4a1710'
      g.fillRect(x0, 0, W, H)
      // borders (outside in)
      const band = (inset: number, width: number, color: string) => {
        g.fillStyle = color
        g.fillRect(x0 + inset, inset, W - inset * 2, width)
        g.fillRect(x0 + inset, H - inset - width, W - inset * 2, width)
        g.fillRect(x0 + inset, inset, width, H - inset * 2)
        g.fillRect(x1 - inset - width, inset, width, H - inset * 2)
      }
      band(0, 10, '#24120b')
      band(10, 3, '#d8c49c')
      band(13, 26, '#7c3a1c')
      band(39, 3, '#d8c49c')
      band(42, 6, '#24120b')
      // the main border's motif: little stepped diamonds, cream and dark
      const motif = (cx: number, cy: number, s: number, a: string, b: string) => {
        g.fillStyle = a
        g.beginPath()
        g.moveTo(cx, cy - s)
        g.lineTo(cx + s, cy)
        g.lineTo(cx, cy + s)
        g.lineTo(cx - s, cy)
        g.closePath()
        g.fill()
        g.fillStyle = b
        g.fillRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6)
      }
      for (let x = x0 + 30; x < x1 - 20; x += 22) {
        motif(x, 26, 8, '#d8c49c', '#24120b')
        motif(x, H - 26, 8, '#d8c49c', '#24120b')
      }
      for (let y = 48; y < H - 40; y += 22) {
        motif(x0 + 26, y, 8, '#d8c49c', '#24120b')
        motif(x1 - 26, y, 8, '#d8c49c', '#24120b')
      }
      // the field
      const fx0 = x0 + 48
      const fx1 = x1 - 48
      const fy0 = 48
      const fy1 = H - 48
      const fcx = (fx0 + fx1) / 2
      const fcy = (fy0 + fy1) / 2
      for (let y = fy0; y < fy1; y += 6) {
        g.fillStyle = `rgba(${90 + r() * 30},${20 + r() * 8},${12 + r() * 6},${0.25 + r() * 0.2})`
        g.fillRect(fx0, y, fx1 - fx0, 6)
      }
      // corner spandrels
      g.fillStyle = '#2a140c'
      for (const [cx, cy, sx, sy] of [
        [fx0, fy0, 1, 1],
        [fx1, fy0, -1, 1],
        [fx0, fy1, 1, -1],
        [fx1, fy1, -1, -1],
      ]) {
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + sx * 86, cy)
        g.quadraticCurveTo(cx + sx * 40, cy + sy * 20, cx, cy + sy * 62)
        g.closePath()
        g.fill()
      }
      // the medallion: nested lozenges with pendants
      const loz = (s: number, t: number, color: string) => {
        g.fillStyle = color
        g.beginPath()
        g.moveTo(fcx, fcy - t)
        g.lineTo(fcx + s, fcy)
        g.lineTo(fcx, fcy + t)
        g.lineTo(fcx - s, fcy)
        g.closePath()
        g.fill()
      }
      loz(150, 104, '#d8c49c')
      loz(144, 98, '#2a140c')
      loz(118, 80, '#8e4420')
      loz(96, 64, '#2a140c')
      loz(70, 46, '#c07a38')
      loz(44, 28, '#4a1710')
      loz(16, 10, '#e2cfa4')
      // pendants at the lozenge's tips
      for (const s of [-1, 1]) {
        g.fillStyle = '#d8c49c'
        g.fillRect(fcx + s * 150 + (s < 0 ? -18 : 0), fcy - 5, 18, 10)
        g.fillStyle = '#2a140c'
        g.fillRect(fcx + s * 168 + (s < 0 ? -10 : 0), fcy - 12, 10, 24)
      }
      // a scatter of small stars in the field
      for (let k = 0; k < 90; k++) {
        const x = fx0 + 8 + r() * (fx1 - fx0 - 16)
        const y = fy0 + 8 + r() * (fy1 - fy0 - 16)
        const dx = Math.abs(x - fcx) / 160
        const dy = Math.abs(y - fcy) / 112
        if (dx + dy < 1.1) continue
        g.fillStyle = r() > 0.5 ? 'rgba(216,196,156,0.7)' : 'rgba(192,122,56,0.7)'
        g.fillRect(x - 3, y - 1, 6, 2)
        g.fillRect(x - 1, y - 3, 2, 6)
      }
      // wear: a fine noise over the pile, and a worn patch where the stool stands
      const img = g.getImageData(x0, 0, W, H)
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (r() - 0.5) * 26
        img.data[i] = Math.max(0, Math.min(255, img.data[i] + n))
        img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n * 0.8))
        img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.6))
      }
      g.putImageData(img, x0, 0)
      const worn = g.createRadialGradient(fcx + 20, fcy - 10, 10, fcx + 20, fcy - 10, 150)
      worn.addColorStop(0, 'rgba(120,80,52,0.22)')
      worn.addColorStop(1, 'rgba(120,80,52,0)')
      g.fillStyle = worn
      g.fillRect(x0, 0, W, H)
    },
    { repeat: false },
  )
}

/** the setlist: a sheet of cream paper, Volume ONE's songs in marker */
function setlistMap() {
  const songs = ALBUMS[0].tracks.map(t => t.title)
  return tile(
    'lc-setlist',
    256,
    364,
    (g, w, h) => {
      g.fillStyle = '#efe4cc'
      g.fillRect(0, 0, w, h)
      // a little grime and a fold
      const r = rng(19)
      for (let k = 0; k < 400; k++) {
        g.fillStyle = `rgba(90,60,30,${r() * 0.05})`
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3)
      }
      g.fillStyle = 'rgba(80,50,20,0.08)'
      g.fillRect(0, h * 0.5 - 1, w, 2)
      g.fillStyle = '#17110c'
      g.textBaseline = 'alphabetic'
      g.font = FONT.script(40, 700)
      g.fillText('GJP', 22, 50)
      g.fillRect(22, 58, 70, 2.5)
      g.font = FONT.script(29, 600)
      songs.forEach((s, i) => {
        g.save()
        g.translate(24, 100 + i * 40)
        g.rotate(-0.02 + (i % 3) * 0.012)
        g.fillText(s, 0, 0)
        g.restore()
      })
      // ticks beside the ones already played (all of them: it's last call)
      g.strokeStyle = '#17110c'
      g.lineWidth = 2.4
      songs.forEach((_, i) => {
        const y = 92 + i * 40
        g.beginPath()
        g.moveTo(w - 40, y - 4)
        g.lineTo(w - 33, y + 3)
        g.lineTo(w - 20, y - 12)
        g.stroke()
      })
    },
    { repeat: false },
  )
}

/** the stool's wood: a mid-brown stained oak, open grain along u */
function oakMap() {
  return tile('lc-oak', 256, 256, (g, w, h) => {
    const r = rng(33)
    g.fillStyle = '#7a4f31'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) {
      const y = r() * h
      const a = 0.06 + r() * 0.2
      g.strokeStyle = r() > 0.4 ? `rgba(40,20,10,${a})` : `rgba(170,120,76,${a * 0.7})`
      g.lineWidth = 0.6 + r() * 2.2
      g.beginPath()
      g.moveTo(0, y)
      const ph = r() * 6
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 + ph) * (1.5 + r()))
      g.stroke()
    }
    // open pores
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(30,14,6,${0.1 + r() * 0.2})`
      g.fillRect(r() * w, r() * h, 1.5 + r() * 3, 0.8)
    }
  })
}

/** a soft out-of-focus bulb: a disc with a brighter rim and a warm core (alpha) */
function bokehMap() {
  return tile(
    'lc-bokeh',
    64,
    64,
    (g, w) => {
      const c = w / 2
      const grad = g.createRadialGradient(c, c, 0, c, c, c)
      grad.addColorStop(0, 'rgba(255,255,255,0.95)')
      grad.addColorStop(0.3, 'rgba(255,255,255,0.62)')
      grad.addColorStop(0.72, 'rgba(255,255,255,0.46)')
      grad.addColorStop(0.86, 'rgba(255,255,255,0.4)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, w)
    },
    { repeat: false },
  )
}

/**
 * FESTOON strands behind the stage, out of focus (camera-facing bokeh
 * discs). Each bulb dims with `uLocal` on its own stagger — the room is
 * closing, strand by strand — but never goes all the way out.
 */
function buildFestoon(centre: THREE.Vector3) {
  const pos: number[] = []
  const at: number[] = []
  const tone: number[] = []
  const size: number[] = []
  const r = rng(12)
  const strands: [number, number, number, number, number][] = [
    // z, y at the posts, sag, x span, bulb spacing
    [-24, 17.2, 2.4, 46, 2.3],
    [-38, 21.5, 3.0, 70, 2.9],
    [-14, 22.5, 1.6, 30, 2.0],
  ]
  strands.forEach(([z, y0, sag, span, sp], s) => {
    const n = Math.floor(span / sp)
    const swag = s === 1 ? 16 : 11
    for (let i = 0; i <= n; i++) {
      const x = -span / 2 + i * sp + (r() - 0.5) * 0.3
      const u = ((x + span / 2) % swag) / swag - 0.5
      const y = y0 - sag * (1 - 4 * u * u)
      pos.push(centre.x + x, y - 0.35, centre.z + z)
      // the far end of each strand goes first
      at.push(0.22 + 0.42 * (1 - (x + span / 2) / span) + (r() - 0.5) * 0.08 + s * 0.04)
      tone.push(0.55 + r() * 0.55)
      size.push((s === 2 ? 1.0 : s === 1 ? 1.45 : 1.2) * (0.8 + r() * 0.4))
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aAt', new THREE.Float32BufferAttribute(at, 1))
  geo.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1))
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1))
  const uniforms = {
    uMap: { value: bokehMap() },
    uColor: { value: new THREE.Color('#ffb45e') },
    uLocal: { value: 0 },
    uAmount: { value: 1 },
    uPx: { value: 600 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aAt;
      attribute float aTone;
      attribute float aSize;
      uniform float uLocal;
      uniform float uPx;
      varying float vB;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // a bulb seen out of focus: its disc grows with the blur, not the distance
        gl_PointSize = clamp(aSize * uPx / max(1.0, -mv.z), 2.0, 160.0);
        float off = smoothstep(aAt, aAt + 0.24, uLocal);
        vB = aTone * mix(1.0, 0.2, off);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uAmount;
      varying float vB;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(uColor * a * vB * uAmount * 0.58, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = -5
  return { points, uniforms }
}

/*
 * THE LAMP'S CONE in the haze: the pendant's light made visible where it
 * falls through the smoke onto the stool. Shaded analytically (no additive
 * shell seams): the front faces of a bounding cone start each view ray; the
 * ray's closest approach to the cone's axis (clipped to the floor) gives a
 * soft falloff across the cone, brighter near the bulb; slow noise at that
 * point is the haze drifting through it.
 */
const CONE_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const CONE_FRAG = /* glsl */ `
  uniform vec3 uApex;
  uniform vec3 uAxis;
  uniform vec3 uColor;
  uniform float uTan;
  uniform float uLen;
  uniform float uAmount;
  uniform float uTime;
  varying vec3 vW;

  float chash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float cnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(chash(i), chash(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(chash(i + vec3(0.0, 1.0, 0.0)), chash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(chash(i + vec3(0.0, 0.0, 1.0)), chash(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(chash(i + vec3(0.0, 1.0, 1.0)), chash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vW - ro);
    float tIn = length(vW - ro);
    float tFloor = rd.y < -1e-4 ? -ro.y / rd.y : 1e6;
    vec3 w0 = ro - uApex;
    float b = dot(rd, uAxis);
    float d = dot(rd, w0);
    float e = dot(uAxis, w0);
    float den = max(1.0 - b * b, 1e-4);
    float t = clamp((b * e - d) / den, tIn, max(tIn, tFloor));
    vec3 P = ro + rd * t;
    float s = dot(P - uApex, uAxis);
    float r = length(P - uApex - uAxis * s);
    float R = max(s, 0.05) * uTan;
    float q = r / R;
    float across = exp(-2.4 * q * q);
    float along = smoothstep(0.0, 0.1 * uLen, s) * (0.45 + 0.55 * (1.0 - smoothstep(0.05 * uLen, uLen, s)));
    float fade = 1.0 - smoothstep(0.8 * uLen, 1.0 * uLen, s);
    vec3 np = P * 0.2 + vec3(uTime * 0.04, -uTime * 0.03, uTime * 0.02);
    float n = cnoise(np) * 0.62 + cnoise(np * 2.3 + 7.0) * 0.38;
    float haze = 0.45 + 1.0 * n;
    float v = uAmount * across * along * fade * haze;
    gl_FragColor = vec4(uColor * v, 1.0);
  }
`

function buildCone(apex: THREE.Vector3, to: THREE.Vector3, angle: number, color: THREE.ColorRepresentation) {
  const axis = new THREE.Vector3().subVectors(to, apex)
  const len = axis.length()
  axis.normalize()
  const tanA = Math.tan(angle)
  const geo = new THREE.ConeGeometry(len * tanA * 1.8, len * 1.04, 40, 1, true)
  geo.translate(0, -len * 0.52, 0)
  const uniforms = {
    uApex: { value: apex.clone() },
    uAxis: { value: axis.clone() },
    uColor: { value: new THREE.Color(color) },
    uTan: { value: tanA },
    uLen: { value: len },
    uAmount: { value: 0 },
    uTime: { value: 0 },
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      side: THREE.FrontSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  )
  mesh.position.copy(apex)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis)
  mesh.frustumCulled = false
  mesh.renderOrder = 4
  return { mesh, uniforms }
}

/** the mic's ball grille: fine woven steel mesh */
function grilleMap() {
  return tile('lc-grille', 64, 64, (g, w, h) => {
    g.fillStyle = '#9c978f'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#1c1a18'
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) g.fillRect(x, y, 2, 2)
  })
}

/* ------------------------------------------------------------------ props */

/** a tavern bar stool: a turned, dished walnut seat, four splayed legs, a worn brass footrest */
function buildStool() {
  const group = new THREE.Group()
  group.name = 'stool'
  const wood = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: oakMap(),
    roughness: 0.5,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  })
  // turned parts: the grain runs along the piece (swap the cylinder's u/v)
  const alongGrain = (geo: THREE.BufferGeometry, len: number) => {
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      uv.setXY(i, v * len * 0.2, u * 0.35)
    }
    return geo
  }
  // the seat: a lathe profile (a slight dish, a rounded bullnose edge)
  const prof: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -0.035),
    new THREE.Vector2(0.8, -0.025),
    new THREE.Vector2(1.45, 0.0),
    new THREE.Vector2(1.66, -0.03),
    new THREE.Vector2(SEAT_R, -0.12),
    new THREE.Vector2(SEAT_R - 0.01, -0.26),
    new THREE.Vector2(1.66, -0.36),
    new THREE.Vector2(1.3, -0.4),
    new THREE.Vector2(0.001, -0.4),
  ]
  const seatGeo = new THREE.LatheGeometry(prof, 48)
  // planar uv: the grain runs straight across the seat
  {
    const p = seatGeo.attributes.position
    const uv = seatGeo.attributes.uv
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.28 + 0.5, p.getZ(i) * 0.12 + 0.5 + p.getY(i) * 0.4)
  }
  seatGeo.translate(0, SEAT_H, 0)
  // legs: from under the seat, splayed to the floor
  const parts: THREE.BufferGeometry[] = [seatGeo]
  const legTop: THREE.Vector3[] = []
  const legFoot: THREE.Vector3[] = []
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const top = new THREE.Vector3(Math.cos(a) * 1.08, SEAT_H - 0.36, Math.sin(a) * 1.08)
    const foot = new THREE.Vector3(Math.cos(a) * 1.92, 0, Math.sin(a) * 1.92)
    legTop.push(top)
    legFoot.push(foot)
    parts.push(alongGrain(rodGeo(foot, top, 0.14, 0.17, 14), foot.distanceTo(top)))
  }
  // a ring of rungs halfway up
  const at = (k: number, y: number) => legFoot[k].clone().lerp(legTop[k], y / (SEAT_H - 0.36))
  for (let k = 0; k < 4; k++) {
    const a = at(k, 4.6)
    const b = at((k + 1) % 4, 4.6)
    parts.push(alongGrain(rodGeo(a, b, 0.07, 0.07, 10), a.distanceTo(b)))
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(parts.map(p => clean(p, true))), wood)
  woodMesh.castShadow = true
  woodMesh.receiveShadow = true
  group.add(woodMesh)
  // the footrest: a worn brass ring round the legs
  const ringY = 2.5
  const ringR = at(0, ringY).setY(0).length()
  const brass = new THREE.MeshStandardMaterial({ color: '#c79a58', metalness: 1, roughness: 0.34 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.075, 10, 64), brass)
  ring.rotation.x = Math.PI / 2
  ring.position.y = ringY
  ring.castShadow = true
  ring.receiveShadow = true
  group.add(ring)
  // small brass collars where the ring meets each leg
  const collar = new THREE.CylinderGeometry(0.19, 0.19, 0.16, 14)
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(collar, brass)
    c.position.copy(at(k, ringY))
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), legTop[k].clone().sub(legFoot[k]).normalize())
    group.add(c)
  }
  return group
}

/**
 * Closing time: café tables at the edge of the light, their chairs turned
 * up onto them (seats down on the tops, legs in the air, backs hanging over
 * the edge). One merged mesh per material; they only receive shadows.
 */
function buildTables(spots: { at: THREE.Vector3; turn: number }[]) {
  const woods: THREE.BufferGeometry[] = []
  const irons: THREE.BufferGeometry[] = []
  const TOP_H = 7.3
  const TOP_R = 2.7
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)
  // a café chair (seat top at 4.5, back to -z), built once and placed per use
  const chair: THREE.BufferGeometry[] = []
  {
    const seat = new THREE.BoxGeometry(3.8, 0.24, 3.6)
    seat.translate(0, 4.38, 0)
    chair.push(seat)
    for (const [x, z] of [
      [-1.6, -1.5],
      [1.6, -1.5],
      [-1.6, 1.5],
      [1.6, 1.5],
    ]) {
      const back = z < 0
      const top = new THREE.Vector3(x, back ? 8.6 : 4.3, z)
      const foot = new THREE.Vector3(x * 1.08, 0, z * 1.1)
      chair.push(rodGeo(foot, top, 0.13, 0.15, 8))
    }
    const rail = new THREE.BoxGeometry(3.4, 0.7, 0.16)
    rail.translate(0, 8.1, -1.5)
    chair.push(rail)
    const mid = new THREE.BoxGeometry(3.3, 0.22, 0.12)
    mid.translate(0, 6.6, -1.5)
    chair.push(mid)
    for (const x of [-1, 1]) {
      const rung = rodGeo(new THREE.Vector3(x * 1.66, 1.6, -1.6), new THREE.Vector3(x * 1.66, 1.6, 1.6), 0.07, 0.07, 6)
      chair.push(rung)
    }
  }
  const chairGeo = mergeGeometries(chair.map(c => clean(c)))
  for (const { at, turn } of spots) {
    // the table: a round top on an iron pedestal and a cross foot
    const top = new THREE.CylinderGeometry(TOP_R, TOP_R, 0.28, 40)
    top.translate(at.x, TOP_H - 0.14, at.z)
    woods.push(clean(top))
    const col = new THREE.CylinderGeometry(0.3, 0.36, TOP_H - 0.5, 14)
    col.translate(at.x, (TOP_H - 0.5) / 2 + 0.2, at.z)
    irons.push(clean(col))
    for (const a of [turn, turn + Math.PI / 2]) {
      const foot = new THREE.BoxGeometry(4.2, 0.22, 0.4)
      foot.rotateY(a)
      foot.translate(at.x, 0.11, at.z)
      irons.push(clean(foot))
    }
    // two chairs up on it, back to back, their backs hanging over the edge
    for (const s of [1, -1]) {
      const g = chairGeo.clone()
      q.setFromEuler(new THREE.Euler(Math.PI, turn + (s > 0 ? 0 : Math.PI), 0, 'YXZ'))
      const off = new THREE.Vector3(0, 0, 1.15 * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn)
      m.compose(new THREE.Vector3(at.x + off.x, TOP_H + 4.5, at.z + off.z), q, one)
      g.applyMatrix4(m)
      woods.push(g)
    }
  }
  // flat stained wood (the merged pieces carry no uvs)
  const wood = new THREE.MeshPhysicalMaterial({ color: '#5a3a26', roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 })
  const group = new THREE.Group()
  group.name = 'tables'
  const w = new THREE.Mesh(mergeGeometries(woods), wood)
  const i = new THREE.Mesh(mergeGeometries(irons), new THREE.MeshStandardMaterial({ color: '#16110e', metalness: 0.5, roughness: 0.5 }))
  w.receiveShadow = i.receiveShadow = true
  group.add(w, i)
  return group
}

/** a tortoise celluloid pick */
function buildPick() {
  const s = new THREE.Shape()
  const r = 0.15
  s.moveTo(0, -r * 1.25)
  s.bezierCurveTo(r * 0.55, -r * 0.7, r * 1.2, r * 0.25, r * 0.95, r * 0.72)
  s.bezierCurveTo(r * 0.7, r * 1.08, -r * 0.7, r * 1.08, -r * 0.95, r * 0.72)
  s.bezierCurveTo(-r * 1.2, r * 0.25, -r * 0.55, -r * 0.7, 0, -r * 1.25)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false, curveSegments: 10 })
  geo.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#7a3514', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }))
  m.receiveShadow = true
  return m
}

/**
 * The boom stand and its dynamic vocal mic. The tripod stands at `base`;
 * the boom pivots at the top of the upright and reaches to `mic`, where the
 * mic hangs in its clip pointing at `aim` (where the singer's mouth was).
 * Returns the group and the point the XLR cable leaves the mic.
 */
function buildMicStand(base: THREE.Vector3, mic: THREE.Vector3, aim: THREE.Vector3) {
  const group = new THREE.Group()
  group.name = 'mic-stand'
  const tubes: THREE.BufferGeometry[] = []
  const blk: THREE.BufferGeometry[] = []
  const hub = base.clone().add(new THREE.Vector3(0, 1.45, 0))
  // tripod legs
  for (let k = 0; k < 3; k++) {
    const a = 0.5 + (k * Math.PI * 2) / 3
    const foot = base.clone().add(new THREE.Vector3(Math.cos(a) * 3.0, 0.07, Math.sin(a) * 3.0))
    tubes.push(rodGeo(hub.clone().add(new THREE.Vector3(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14)), foot, 0.065, 0.065, 8))
    // a brace from the leg's middle up to a collar on the upright
    const mid = hub.clone().lerp(foot, 0.5)
    tubes.push(rodGeo(mid, hub.clone().add(new THREE.Vector3(0, 1.3, 0)), 0.035, 0.035, 6))
    const f = new THREE.SphereGeometry(0.11, 10, 6)
    f.scale(1.3, 0.6, 1.3)
    f.translate(foot.x, 0.06, foot.z)
    blk.push(f)
  }
  const upTop = base.clone().add(new THREE.Vector3(0, 11.9, 0))
  const clutchY = base.y + 8.6
  tubes.push(rodGeo(hub.clone().add(new THREE.Vector3(0, -0.25, 0)), new THREE.Vector3(base.x, clutchY, base.z), 0.11, 0.11, 14))
  tubes.push(rodGeo(new THREE.Vector3(base.x, clutchY, base.z), upTop, 0.075, 0.075, 12))
  // the height clutch and the boom clutch (black knurled plastic)
  const clutch = new THREE.CylinderGeometry(0.17, 0.17, 0.5, 16)
  clutch.translate(base.x, clutchY + 0.1, base.z)
  blk.push(clutch)
  const hubG = new THREE.CylinderGeometry(0.22, 0.26, 0.55, 16)
  hubG.translate(hub.x, hub.y, hub.z)
  blk.push(hubG)
  // the boom: through the pivot, a counterweight behind
  const pivot = upTop.clone().add(new THREE.Vector3(0, 0.14, 0))
  const clip = mic.clone()
  const dir = new THREE.Vector3().subVectors(clip, pivot).normalize()
  const back = pivot.clone().addScaledVector(dir, -2.1)
  tubes.push(rodGeo(back, clip.clone().addScaledVector(dir, -0.18), 0.06, 0.06, 10))
  const pv = new THREE.CylinderGeometry(0.2, 0.2, 0.46, 16)
  pv.rotateX(Math.PI / 2)
  pv.lookAt(dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize())
  pv.translate(pivot.x, pivot.y, pivot.z)
  blk.push(pv)
  // the pivot's T-knob
  const knob = new THREE.BoxGeometry(0.08, 0.5, 0.12)
  const side = dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
  knob.translate(pivot.x + side.x * 0.32, pivot.y, pivot.z + side.z * 0.32)
  blk.push(knob)
  const cw = new THREE.CylinderGeometry(0.21, 0.21, 0.62, 16)
  cw.translate(0, 0.31, 0)
  cw.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()))
  cw.translate(back.x + dir.x * 0.25, back.y + dir.y * 0.25, back.z + dir.z * 0.25)
  blk.push(cw)

  const st = new THREE.Mesh(mergeGeometries(tubes.map(t => clean(t))), steel())
  st.castShadow = true
  st.receiveShadow = true
  const plastic = new THREE.MeshStandardMaterial({ color: '#0d0c0b', roughness: 0.55, metalness: 0.1 })
  const bk = new THREE.Mesh(mergeGeometries(blk.map(t => clean(t))), plastic)
  bk.castShadow = true
  bk.receiveShadow = true
  group.add(st, bk)

  // the mic: a tapered handle, a grille band, the ball grille; its axis → aim
  const micG = new THREE.Group()
  const axis = new THREE.Vector3().subVectors(aim, clip).normalize()
  micG.position.copy(clip)
  micG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  const handle = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -0.95),
      new THREE.Vector2(0.12, -0.95),
      new THREE.Vector2(0.13, -0.88),
      new THREE.Vector2(0.14, -0.4),
      new THREE.Vector2(0.18, 0.2),
      new THREE.Vector2(0.2, 0.34),
      new THREE.Vector2(0.2, 0.38),
    ],
    24,
  )
  const body = new THREE.Mesh(handle, new THREE.MeshPhysicalMaterial({ color: '#1b1a19', roughness: 0.42, metalness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 }))
  body.castShadow = true
  micG.add(body)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.205, 0.1, 24), chrome(0.18))
  band.position.y = 0.43
  micG.add(band)
  const grille = new THREE.Mesh(
    new THREE.SphereGeometry(0.265, 28, 18),
    new THREE.MeshStandardMaterial({ color: '#ffffff', map: grilleMap(), metalness: 0.85, roughness: 0.45 }),
  )
  grille.scale.set(1, 1.05, 1)
  grille.position.y = 0.66
  grille.castShadow = true
  micG.add(grille)
  // the clip: a black cradle round the handle, a short swivel to the boom
  const cradle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 16, 1, true, -1.9, 3.8), plastic)
  cradle.position.y = -0.25
  micG.add(cradle)
  const swivel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), plastic)
  swivel.position.set(0, -0.25, 0)
  micG.add(swivel)
  group.add(micG)
  const xlr = new THREE.Vector3(0, -1.0, 0).applyQuaternion(micG.quaternion).add(clip)
  return { group, xlr, pivot, base, upTop, hub }
}

/** the enamel pendant: a dark dome shade, a warm-lit inside, a bare bulb */
function buildLamp(at: THREE.Vector3) {
  const group = new THREE.Group()
  group.name = 'lamp'
  group.position.copy(at)
  const prof = [
    new THREE.Vector2(0.2, 0.9),
    new THREE.Vector2(0.28, 0.82),
    new THREE.Vector2(0.4, 0.62),
    new THREE.Vector2(0.78, 0.3),
    new THREE.Vector2(1.25, -0.02),
    new THREE.Vector2(1.52, -0.3),
    new THREE.Vector2(1.6, -0.42),
  ]
  const geo = new THREE.LatheGeometry(prof, 40)
  const outer = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#2a1a13', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.12, side: THREE.FrontSide }))
  // the inside: white enamel lit by the bulb — hot round the socket, falling
  // off toward the rim (an emissive gradient along the lathe's v; no light)
  const falloff = tile(
    'lc-shade',
    8,
    64,
    (g, _w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.35, '#b0b0b0')
      grad.addColorStop(0.75, '#484848')
      grad.addColorStop(1, '#262626')
      g.fillStyle = grad
      g.fillRect(0, 0, 8, h)
    },
    { repeat: false },
  )
  falloff.flipY = false
  const inner = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: '#3a2c20',
      emissive: new THREE.Color('#ffb466'),
      emissiveMap: falloff,
      emissiveIntensity: 1.4,
      roughness: 0.5,
      side: THREE.BackSide,
    }),
  )
  // a rolled rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.035, 8, 48), new THREE.MeshStandardMaterial({ color: '#c79a58', metalness: 1, roughness: 0.35 }))
  rim.rotation.x = Math.PI / 2
  rim.position.y = -0.42
  // socket + cord
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 16), new THREE.MeshStandardMaterial({ color: '#c79a58', metalness: 1, roughness: 0.38 }))
  socket.position.y = 0.6
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 40, 6), rubber())
  cord.position.y = 20.9
  // the bulb: a warm glow (the bloom takes it), a hotter filament core
  // an Edison globe hanging just below the rim; a hotter filament core
  const BY = -0.46
  const bulbMat = glow('#ffa850', 1.6) as THREE.MeshBasicMaterial
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), bulbMat)
  bulb.scale.set(1, 1.25, 1)
  bulb.position.y = BY
  const coreMat = glow('#ffd49a', 4) as THREE.MeshBasicMaterial
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), coreMat)
  core.scale.set(1, 1.9, 1)
  core.position.y = BY + 0.02
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 14), new THREE.MeshStandardMaterial({ color: '#c79a58', metalness: 1, roughness: 0.38 }))
  neck.position.y = BY + 0.55
  group.add(outer, inner, rim, socket, cord, bulb, core, neck)
  const base = { bulb: new THREE.Color('#ffa850').multiplyScalar(1.6), core: new THREE.Color('#ffd49a').multiplyScalar(4), inner: 1.4 }
  return {
    group,
    bulbAt: at.clone().add(new THREE.Vector3(0, BY, 0)),
    set(v: number) {
      bulbMat.color.copy(base.bulb).multiplyScalar(v)
      coreMat.color.copy(base.core).multiplyScalar(v)
      ;(inner.material as THREE.MeshStandardMaterial).emissiveIntensity = base.inner * v
    },
  }
}

/**
 * The boards fall away into the dark round the lamp's pool: no far edge, no
 * horizon line. `uRoom` lifts the far boards a little (the room is dimming).
 */
function fadeFloor(mat: THREE.MeshStandardMaterial, centre: THREE.Vector2) {
  const uniforms = { uRoom: { value: 1 }, uCentre: { value: centre } }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloorXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorXZ = (modelMatrix * vec4(position, 1.0)).xz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloorXZ;\nuniform float uRoom;\nuniform vec2 uCentre;')
      .replace(
        '#include <dithering_fragment>',
        `{
          vec2 fd = (vFloorXZ - uCentre) * vec2(0.9, 1.15);
          float keep = 1.0 - smoothstep(6.0 + 6.0 * uRoom, 26.0 + 10.0 * uRoom, length(fd));
          gl_FragColor.rgb *= 0.3 + 0.7 * keep;
          gl_FragColor.a *= keep;
        }
        #include <dithering_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'lastcall-floor'
  mat.transparent = true
  return uniforms
}

/* ------------------------------------------------------------------ build */

export async function buildSet(mobile: boolean): Promise<LastCallSet> {
  const group = new THREE.Group()
  group.name = 'last-call'

  // ---- the guitar: standing on the rim of its tail, tipped sideways onto
  // the stool (so the lean reads in the picture) and back a little
  const guitar = buildGuitar({ mobile })
  // the kit's interior is a small disc under the soundhole: the close-up
  // looks in at an angle, past it, and saw the rug through the (one-sided)
  // back. A dark floor under the whole body keeps the inside a guitar.
  {
    const inner = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(bodyOutline().map(p => p.clone().multiplyScalar(0.97))), 1),
      new THREE.MeshStandardMaterial({ color: '#241308', roughness: 0.92 }),
    )
    inner.position.z = -0.8
    guitar.parts.body.add(inner)
  }
  // the closed chrome tuners, a little satined: under the bare bulb their
  // mirror buttons threw bloom-sized sparks above the headstock
  guitar.parts.tuners.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m && m.isMeshStandardMaterial) m.roughness = Math.max(m.roughness, 0.36)
  })
  const lean = new THREE.Group()
  lean.name = 'lean'
  // R = Ry(yaw) · Rx(-lean) · Rz(-tip): tip toward +X, then back, then turn
  lean.rotation.order = 'YXZ'
  lean.rotation.set(-LEAN, YAW, -TIP)
  // local: the neck up (+X → +Y), the bass side to the left (−X), face +Z
  guitar.group.rotation.set(0, 0, Math.PI / 2)
  lean.add(guitar.group)
  group.add(lean)
  group.updateMatrixWorld(true)
  const G = guitar.group
  // stand it on the floor: the lowest point of the body's rim (top or back edge)
  {
    let minY = Infinity
    const v = new THREE.Vector3()
    for (const p of bodyOutline()) {
      if (p.x > 0.5) continue
      for (const z of [0, -1.0]) {
        v.set(p.x, p.y, z).applyMatrix4(G.matrixWorld)
        minY = Math.min(minY, v.y)
      }
    }
    lean.position.set(-2.4, -minY, 1.4)
    group.updateMatrixWorld(true)
  }
  // the treble edge of the neck (it's tipped toward the stool) at the height of the seat rim
  const neckEdge = (x: number) => new THREE.Vector3(x, -0.25, -0.12).applyMatrix4(G.matrixWorld)
  let lo = 2.5
  let hi = 6.4
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    if (neckEdge(m).y < SEAT_H + 0.03) lo = m
    else hi = m
  }
  const contact = neckEdge(lo)
  // the stool sits so its rim meets the neck there: the neck crosses the rim
  // on its left side, a little off the seat's centre line
  const along = new THREE.Vector3().subVectors(neckEdge(lo + 1), contact).setY(0).normalize()
  const across = new THREE.Vector3(-along.z, 0, along.x)
  const phi = -0.5
  const stoolAt = contact
    .clone()
    .setY(0)
    .addScaledVector(along, Math.cos(phi) * (SEAT_R - 0.05))
    .addScaledVector(across, Math.sin(phi) * (SEAT_R - 0.05))
  const stool = buildStool()
  stool.position.copy(stoolAt)
  // turn the stool so no leg stands in the guitar's lap
  stool.rotation.y = Math.atan2(along.x, along.z) + Math.PI / 4
  group.add(stool)
  await nextFrame()

  // a pick left on the seat
  const pick = buildPick()
  pick.position.set(stoolAt.x + 0.55, SEAT_H + 0.005, stoolAt.z - 0.35)
  pick.rotation.y = 2.2
  group.add(pick)

  // ---- the mic stand, to the stool's right; the mic where the singer's mouth was
  const mouth = stoolAt.clone().add(new THREE.Vector3(-0.1, 14.1, 0.35))
  const micAt = stoolAt.clone().add(new THREE.Vector3(0.25, 14.25, 1.75))
  const standAt = stoolAt.clone().add(new THREE.Vector3(3.9, 0, 1.5))
  const stand = buildMicStand(standAt, micAt, mouth)
  group.add(stand.group)
  // the XLR cable: down from the mic, along the boom back to the upright,
  // down it, across the rug and off into the dark behind the stool
  {
    const x = stand.xlr
    const up = stand.upTop
    const pts = [
      x,
      x.clone().add(new THREE.Vector3(0.2, -0.9, 0.3)),
      x.clone().lerp(stand.pivot, 0.45).add(new THREE.Vector3(0, -1.3, 0.1)),
      stand.pivot.clone().add(new THREE.Vector3(0.05, -0.9, 0.22)),
      up.clone().add(new THREE.Vector3(0.14, -2.2, 0.12)),
      up.clone().add(new THREE.Vector3(-0.13, -5.4, 0.12)),
      up.clone().add(new THREE.Vector3(0.13, -8.4, 0.1)),
      new THREE.Vector3(standAt.x + 0.15, 1.2, standAt.z + 0.2),
      new THREE.Vector3(standAt.x + 0.4, 0.05, standAt.z + 0.9),
      new THREE.Vector3(standAt.x + 1.4, 0.05, standAt.z + 0.6),
      new THREE.Vector3(standAt.x + 1.7, 0.05, standAt.z - 1.4),
      new THREE.Vector3(standAt.x + 0.9, 0.05, standAt.z - 4.4),
      new THREE.Vector3(standAt.x - 2.4, 0.05, standAt.z - 8.0),
      new THREE.Vector3(standAt.x - 6.5, 0.05, standAt.z - 12),
    ]
    group.add(cable(pts, 0.042))
  }
  await nextFrame()

  // ---- the rug, the setlist, the floorboards
  const rugW = 15
  const rugD = 10.3
  const rugAt = stoolAt.clone().add(new THREE.Vector3(-0.9, 0, 1.5))
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(rugW, rugD),
    new THREE.MeshStandardMaterial({ color: '#d9cbc2', map: rugMap(), roughness: 0.95, alphaTest: 0.5 }),
  )
  rug.rotation.set(-Math.PI / 2, 0, 0.06)
  rug.position.set(rugAt.x, 0.02, rugAt.z)
  rug.receiveShadow = true
  group.add(rug)

  await fontsReady()
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.97), new THREE.MeshStandardMaterial({ color: '#ffffff', map: setlistMap(), roughness: 0.85 }))
  sheet.rotation.set(-Math.PI / 2, 0, 0.32)
  sheet.position.set(stoolAt.x + 0.9, 0.035, stoolAt.z + 4.6)
  sheet.receiveShadow = true
  group.add(sheet)
  for (const [dx, dz, a] of [
    [-0.02, -1.42, 0.32],
    [0.02, 1.42, 0.32],
  ]) {
    const t = gaffer(1.1, 0.34, '#24201c')
    const off = new THREE.Vector3(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
    t.position.set(sheet.position.x + off.x, 0.04, sheet.position.z + off.z)
    t.rotation.z = a
    group.add(t)
  }
  await nextFrame()

  const floorGeo = new THREE.PlaneGeometry(160, 160)
  scaleUv(floorGeo, 160 / 9, 160 / 9)
  const floorMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: floorMap(), roughness: 0.52, metalness: 0 })
  const room = fadeFloor(floorMat, new THREE.Vector2(stoolAt.x, stoolAt.z + 1))
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.rotation.z = 0.06
  floor.receiveShadow = true
  group.add(floor)

  // ---- the last lamp, hung low over the gap between the guitar and the stool
  const lampAt = stoolAt.clone().add(new THREE.Vector3(-1.9, 17.8, 2.6))
  const lamp = buildLamp(lampAt)
  group.add(lamp.group)
  // the bare bulb spills a little light round the whole room (no shadows:
  // the spot is the only caster); present from init, never toggled
  const spill = new THREE.PointLight(GEL_BULB, 28, 0, 2)
  spill.position.copy(lamp.bulbAt)
  group.add(spill)
  // ---- closing time: café tables at the edge of the light, chairs up
  group.add(
    buildTables([
      { at: stoolAt.clone().add(new THREE.Vector3(-16, 0, -4)), turn: 0.5 },
      { at: stoolAt.clone().add(new THREE.Vector3(13.8, 0, 3.2)), turn: -0.35 },
      { at: stoolAt.clone().add(new THREE.Vector3(-23, 0, -15)), turn: 1.1 },
    ]),
  )
  // ---- the lamp's light made visible in the haze, down onto the stool
  const coneAxis = new THREE.Vector3().subVectors(new THREE.Vector3(stoolAt.x - 1.2, 3.2, stoolAt.z + 0.9), lamp.bulbAt).normalize()
  const coneTo = lamp.bulbAt.clone().addScaledVector(coneAxis, lamp.bulbAt.y / -coneAxis.y)
  const CONE_A = 0.36
  const cone = buildCone(lamp.bulbAt, coneTo, CONE_A, '#ffc27a')
  group.add(cone.mesh)
  // ---- the festoon strands at the back of the room (they dim at closing time)
  const festoon = buildFestoon(stoolAt)
  group.add(festoon.points)
  await nextFrame()

  // ---- reference points
  group.updateMatrixWorld(true)
  const hole = new THREE.Vector3(SOUNDHOLE.x, SOUNDHOLE.y, 0.02).applyMatrix4(G.matrixWorld)
  const holeN = new THREE.Vector3(0, 0, 1).transformDirection(G.matrixWorld)
  // the lamp aims between the guitar's body and the stool's seat
  const heart = new THREE.Vector3(1.4, -0.4, 0).applyMatrix4(G.matrixWorld).lerp(stoolAt.clone().setY(SEAT_H * 0.55), 0.3)
  // the subject: the guitar, the stool and the stand (the floor to the mic)
  const bb = new THREE.Box3().setFromObject(lean).union(new THREE.Box3().setFromObject(stool)).union(new THREE.Box3().setFromObject(stand.group))
  const size = bb.getSize(new THREE.Vector3())
  const subject: Box = {
    c: new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, stoolAt.z + 0.6),
    hw: size.x / 2 + 0.2,
    hh: size.y / 2 + 0.25,
  }
  // the corner: the whole stage from the rug to the lamp's shade
  const top = lampAt.y + 1.1
  // (a margin below the floor line: the rug's front edge and the setlist
  // lie toward the camera, lower in the picture than the box's plane)
  const corner: Box = {
    c: new THREE.Vector3(subject.c.x - 0.2, top / 2 - 1.2, stoolAt.z + 0.8),
    hw: subject.hw + 1.6,
    hh: top / 2 + 1.5,
  }
  return {
    group,
    guitar,
    lampAt: lamp.bulbAt,
    heart,
    hole,
    holeN,
    subject,
    corner,
    setLamp: v => lamp.set(v),
    setRoom: v => (room.uRoom.value = v),
    setFestoon: (local, px) => {
      festoon.uniforms.uLocal.value = local
      festoon.uniforms.uPx.value = px
    },
    setHaze: (amount, time, cam) => {
      // the bounding cone's front faces start each ray: with the camera inside
      // it (the close-up) there are none, so fade the cone out round the camera
      const rel = _rel.copy(cam).sub(lamp.bulbAt)
      const sAx = rel.dot(coneAxis)
      const rAx = rel.addScaledVector(coneAxis, -sAx).length()
      const qCam = sAx <= 0.05 ? 9 : rAx / (sAx * Math.tan(CONE_A) * 1.8)
      const a = amount * smoothstep(1.05, 1.6, qCam)
      cone.uniforms.uAmount.value = a
      cone.uniforms.uTime.value = time
      cone.mesh.visible = a > 0.002
    },
  }
}
