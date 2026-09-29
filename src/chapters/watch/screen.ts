import * as THREE from 'three'
import type { Video } from '../../content'
import { FONT } from '../../kit/materials'
import { BULB_GLSL, bulbUniforms } from './room'

/*
 * THE SHEET — a plain cotton bedsheet pegged to a wire with wooden
 * clothespins, hung against the brick under the festoon strand: gentle
 * drape folds between the pegs, two broad folds down its length, a curl at
 * the hem. The projector throws each video's thumbnail onto it.
 *
 *  - The picture is mapped onto the cloth (its folds shade it a little: a
 *    Lambert term against the lens), with the projector's soft hot spot and
 *    a faint scatter halo round the frame on the cloth.
 *  - A change of video CROSS-FADES (never through black) and the incoming
 *    frame arrives a touch soft and racks into focus (~0.55 s of TIME).
 *    Calm (reduced motion / Motion off): a plain cross-fade.
 *  - The picture is self-lit, so its light is pre-compensated for the ACES
 *    tone map in the output pass (invAces): the thumbnails land true, capped
 *    below the bloom threshold (no glow veil over the titles).
 *  - The cloth itself is lit by the room (a warm ambient + the bulbs above,
 *    analytic) so a dark picture never reads as a black hole.
 */

export const SHEET_W = 20
export const SHEET_H = 12.4
/** the projected picture (world): centre and size, 16:9 */
export const IMG_C = new THREE.Vector3(0, 15.4, 0)
export const IMG_W = 15.6
export const IMG_H = (IMG_W * 9) / 16
/** the wire the sheet hangs from */
export const SHEET_TOP = 21.6

const FADE = 0.42
const FOCUS = 0.6

/** the drape: offsets (dy, dz) at sheet-local (x, y), y = 0 at the top edge, negative downward */
function drape(x: number, y: number): [number, number] {
  const t = -y / SHEET_H // 0 at the top → 1 at the hem
  const pitch = SHEET_W / 6
  const f = ((x + SHEET_W / 2) / pitch) % 1
  const between = Math.sin(Math.PI * f)
  const dy = -0.3 * between * Math.exp(-t * 14)
  let dz = 0.13 * Math.cos(2 * Math.PI * f) * Math.exp(-t * 6) * between
  dz += 0.12 * Math.sin(x * 0.52 + 0.8) * (0.35 + 0.65 * t)
  dz += 0.05 * Math.sin(x * 1.25 + 2.1) * t
  dz += 0.1 * Math.pow(t, 7) * Math.sin(x * 0.9 + 1.3)
  return [dy, dz]
}

const VERT = /* glsl */ `
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vP = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const FRAG = /* glsl */ `
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uMix;
  uniform float uBlur;
  uniform float uLevel;
  uniform float uExposure;
  uniform vec4 uImg;
  uniform vec3 uProj;
  uniform vec3 uAmb;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vW;
  ${BULB_GLSL}

  // three's ACESFilmicToneMapping, inverted (the output pass lands on the thumbnail's own values)
  const mat3 IOUT = mat3(vec3(0.64304, 0.05927, 0.00596), vec3(0.31119, 0.93144, 0.06393), vec3(0.04578, 0.00929, 0.93012));
  const mat3 IIN = mat3(vec3(1.76474, -0.14703, -0.03634), vec3(-0.67578, 1.16025, -0.16244), vec3(-0.08896, -0.01322, 1.19877));
  vec3 ifit(vec3 u) {
    u = clamp(u, 0.0, 0.97);
    vec3 A = 1.0 - 0.983729 * u;
    vec3 B = 0.0245786 - 0.432951 * u;
    vec3 C = -(0.000090537 + 0.238081 * u);
    return (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  }
  vec3 invAces(vec3 y) {
    vec3 u = max(IOUT * y, 0.0);
    return max(IIN * ifit(u), 0.0) * 0.6 / max(uExposure, 0.05);
  }
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    // derivatives first, never inside a branch
    vec2 iuv = (vP.xy - uImg.xy) / (2.0 * uImg.zw) + 0.5;
    vec2 fw = max(fwidth(iuv), vec2(1e-5));
    vec2 inE = smoothstep(vec2(0.0), fw * 1.6, iuv) * smoothstep(vec2(0.0), fw * 1.6, vec2(1.0) - iuv);
    float inside = inE.x * inE.y;
    vec2 cuv = clamp(iuv, vec2(0.001), vec2(0.999));
    vec3 n = normalize(vN);

    // the incoming frame racks into focus (a ring of taps whose radius shrinks to 0)
    float r = uBlur;
    vec2 ra = vec2(r, r * 1.7778);
    vec3 b = texture2D(tB, cuv).rgb * 0.28;
    b += texture2D(tB, cuv + vec2(ra.x, 0.0)).rgb * 0.09;
    b += texture2D(tB, cuv - vec2(ra.x, 0.0)).rgb * 0.09;
    b += texture2D(tB, cuv + vec2(0.0, ra.y)).rgb * 0.09;
    b += texture2D(tB, cuv - vec2(0.0, ra.y)).rgb * 0.09;
    b += texture2D(tB, cuv + ra * 0.7071).rgb * 0.09;
    b += texture2D(tB, cuv - ra * 0.7071).rgb * 0.09;
    b += texture2D(tB, cuv + vec2(ra.x, -ra.y) * 0.7071).rgb * 0.09;
    b += texture2D(tB, cuv + vec2(-ra.x, ra.y) * 0.7071).rgb * 0.09;
    vec3 img = mix(texture2D(tA, cuv).rgb, b, uMix);

    // the projector: a soft hot spot, and the folds turning toward / away from the lens
    vec2 q = cuv - 0.5;
    float hot = 1.0 - 0.5 * dot(q, q);
    vec3 L = normalize(uProj - vW);
    float lam = clamp(dot(n, L) / max(L.z, 0.2), 0.0, 1.15);
    vec3 proj = (img * 0.965 + 0.016) * hot * lam * inside * uLevel;
    // lens scatter: a faint glow on the cloth just outside the frame
    vec2 o = max(abs(iuv - 0.5) - 0.5, 0.0) * vec2(uImg.z / uImg.w, 1.0);
    float halo = exp(-length(o) * 7.0) * (1.0 - inside) * 0.035 * uLevel;

    // the cloth in the room's light: a faint weave, the folds catching the bulbs
    float weave = 0.95 + 0.05 * vnoise(vP.xy * vec2(26.0, 30.0));
    vec3 albedo = vec3(0.84, 0.78, 0.68) * weave;
    float wrap = 0.55 + 0.45 * clamp(n.z, 0.0, 1.0);
    // under the picture the cloth's own room light reads far dimmer (the eye adapts to the picture)
    vec3 cloth = albedo * (uAmb * wrap + bulbLight(vW, n) * 0.3) * (1.0 - 0.6 * inside);

    vec3 col = cloth + invAces(min(proj + vec3(1.0, 0.86, 0.66) * halo, vec3(0.86)));
    gl_FragColor = vec4(col, 1.0);
  }
`

/* ------------------------------------------------------------ images */

/** a texture's average colour (linear) — measured before the upload frees its canvas */
export const averages = new WeakMap<THREE.Texture, THREE.Color>()

function measure(c: HTMLCanvasElement, tex: THREE.Texture) {
  const m = document.createElement('canvas')
  m.width = m.height = 6
  const g = m.getContext('2d', { willReadFrequently: true })
  const col = new THREE.Color('#5a4a3a')
  if (g) {
    try {
      g.drawImage(c, 0, 0, 6, 6)
      const d = g.getImageData(0, 0, 6, 6).data
      let r = 0
      let gg = 0
      let b = 0
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]
        gg += d[i + 1]
        b += d[i + 2]
      }
      const n = d.length / 4
      col.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace)
    } catch {
      /* tainted: keep the neutral */
    }
  }
  averages.set(tex, col)
}

function toTexture(c: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  measure(c, tex)
  // once on the GPU the canvas is dead weight: shrink it (a lost context reloads the page)
  tex.onUpdate = () => {
    c.width = c.height = 1
    tex.onUpdate = null
  }
  return tex
}

export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

/**
 * A video's YouTube thumbnail as a 16:9 texture. hqdefault is 480×360 (4:3)
 * with a 16:9 frame letterboxed in it: take the centre band. Decoded off the
 * main thread where createImageBitmap exists. Rejects on network errors.
 */
export async function loadThumb(id: string): Promise<THREE.Texture> {
  const W = 480
  const H = 270
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const url = thumbUrl(id)
  let src: CanvasImageSource
  let sw: number
  let sh: number
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(String(res.status))
    const bmp = await createImageBitmap(await res.blob())
    src = bmp
    sw = bmp.width
    sh = bmp.height
  } catch {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    src = img
    sw = img.naturalWidth
    sh = img.naturalHeight
  }
  if (!(sw > 1 && sh > 1)) throw new Error('empty thumbnail')
  const band = Math.min(sh, (sw * 9) / 16)
  g.drawImage(src, 0, (sh - band) / 2, sw, band, 0, 0, W, H)
  if ('close' in src && typeof (src as ImageBitmap).close === 'function') (src as ImageBitmap).close()
  return toTexture(c)
}

const KIND: Record<Video['kind'], string> = {
  'Music video': 'Music video',
  Live: 'Live',
  Original: 'Original',
  Cover: 'Cover',
  Audio: 'Audio',
}

/**
 * A title card for a video (shown until its thumbnail arrives, or if it
 * never does): the title in Fraunces on a warm dark field, the kind in mono,
 * a play mark. Real text, so the card always names what's on the sheet.
 */
export function titleCard(v: Video): THREE.Texture {
  const W = 480
  const H = 270
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H / 2, W * 0.62)
  grad.addColorStop(0, '#3a2414')
  grad.addColorStop(0.6, '#1a0f09')
  grad.addColorStop(1, '#0a0605')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(244,232,210,0.35)'
  g.lineWidth = 1.5
  g.strokeRect(14, 14, W - 28, H - 28)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = 'rgba(244,232,210,0.7)'
  g.font = FONT.mono(13, 600)
  g.fillText(`${KIND[v.kind].toUpperCase()}${v.by ? ` · ${v.by.toUpperCase()}` : ''}`.split('').join(' '), W / 2, H * 0.27)
  // the title, wrapped to two lines if it must be
  g.fillStyle = '#f4e8d2'
  let px = 44
  g.font = FONT.display(px, 620)
  const words = v.title.split(' ')
  let lines = [v.title]
  if (g.measureText(v.title).width > W * 0.8) {
    let best = 1
    let bestW = Infinity
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' ')
      const b = words.slice(k).join(' ')
      const w = Math.max(g.measureText(a).width, g.measureText(b).width)
      if (w < bestW) {
        bestW = w
        best = k
      }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')]
    while (px > 24 && Math.max(...lines.map(l => g.measureText(l).width)) > W * 0.84) {
      px -= 2
      g.font = FONT.display(px, 620)
    }
  }
  lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.52 + (i - (lines.length - 1) / 2) * px * 1.08))
  // a play mark
  g.fillStyle = 'rgba(234,166,78,0.95)'
  g.beginPath()
  const px0 = W / 2 - 9
  const py0 = H * 0.8
  g.moveTo(px0, py0 - 11)
  g.lineTo(px0 + 20, py0)
  g.lineTo(px0, py0 + 11)
  g.closePath()
  g.fill()
  return toTexture(c)
}

/* ------------------------------------------------------------ the sheet */

export class Sheet {
  group = new THREE.Group()
  mesh: THREE.Mesh
  /** time-damped average colour of the picture (linear) */
  glow = new THREE.Color('#3a2414')
  private mat: THREE.ShaderMaterial
  private a: THREE.Texture
  private b: THREE.Texture
  private mixT = FADE
  private focusT = FOCUS
  private calm = false
  private target = new THREE.Color('#3a2414')

  constructor(first: THREE.Texture, lens: THREE.Vector3, mobile: boolean) {
    this.a = this.b = first
    const geo = new THREE.PlaneGeometry(SHEET_W, SHEET_H, mobile ? 64 : 110, mobile ? 40 : 70)
    // sheet-local: the top edge at y = 0
    geo.translate(0, -SHEET_H / 2, 0)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const [dy, dz] = drape(pos.getX(i), pos.getY(i))
      pos.setY(i, pos.getY(i) + dy)
      pos.setZ(i, dz)
    }
    geo.computeVertexNormals()
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: first },
        tB: { value: first },
        uMix: { value: 1 },
        uBlur: { value: 0 },
        uLevel: { value: 1 },
        uExposure: { value: 1 },
        // the picture in sheet-local coords (centre, half size)
        uImg: { value: new THREE.Vector4(IMG_C.x, IMG_C.y - SHEET_TOP, IMG_W / 2, IMG_H / 2) },
        uProj: { value: lens.clone() },
        uAmb: { value: new THREE.Color('#2a1a10') },
        ...bulbUniforms,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.name = 'sheet'
    this.mesh.position.set(0, SHEET_TOP, 0)
    this.group.add(this.mesh)

    // the wire (hook to hook) and the clothespins
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, SHEET_W + 3.6, 6).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#8a8278', metalness: 0.8, roughness: 0.35 }),
    )
    wire.position.set(0, SHEET_TOP + 0.04, 0.05)
    this.group.add(wire)
    const hookGeo = new THREE.TorusGeometry(0.14, 0.035, 6, 12)
    const hookMat = new THREE.MeshStandardMaterial({ color: '#1a1714', metalness: 0.6, roughness: 0.4 })
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(hookGeo, hookMat)
      h.position.set(s * (SHEET_W / 2 + 1.8), SHEET_TOP + 0.04, -0.35)
      h.rotation.y = Math.PI / 2
      this.group.add(h)
    }
    const pinGeo = new THREE.BoxGeometry(0.2, 0.78, 0.3)
    pinGeo.translate(0, -0.18, 0.02)
    const pins = new THREE.InstancedMesh(pinGeo, new THREE.MeshStandardMaterial({ color: '#c49a64', roughness: 0.7 }), 7)
    const m = new THREE.Matrix4()
    for (let k = 0; k <= 6; k++) {
      const x = -SHEET_W / 2 + (k * SHEET_W) / 6 + (k === 0 ? 0.3 : k === 6 ? -0.3 : 0)
      m.makeRotationZ((k - 3) * 0.02).setPosition(x, SHEET_TOP + 0.05, 0.12)
      pins.setMatrixAt(k, m)
    }
    this.group.add(pins)
  }

  /** is this texture on the sheet (or arriving)? */
  showing(tex: THREE.Texture) {
    return this.b === tex
  }

  /** put `tex` on the sheet: a cross-fade + focus pull, or a snap (`instant`) */
  show(tex: THREE.Texture, { instant = false, calm = false, focus = true } = {}) {
    if (tex === this.b) return
    const u = this.mat.uniforms
    if (instant) {
      this.a = this.b = tex
      this.mixT = FADE
      this.focusT = FOCUS
    } else {
      // mid-fade (a fast back-and-forth): keep whichever picture dominates
      if (this.mixT / FADE >= 0.5) this.a = this.b
      this.b = tex
      this.mixT = 0
      this.focusT = focus ? 0 : FOCUS
    }
    this.calm = calm
    u.tA.value = this.a
    u.tB.value = this.b
    this.target.copy(averages.get(tex) ?? this.target)
    if (instant) this.glow.copy(this.target)
  }

  get busy() {
    return this.mixT < FADE || (!this.calm && this.focusT < FOCUS)
  }

  update(dt: number, exposure: number, calm: boolean, level: number, amb: THREE.Color) {
    const u = this.mat.uniforms
    this.calm = calm
    this.mixT = Math.min(FADE, this.mixT + dt)
    this.focusT = Math.min(FOCUS, this.focusT + dt)
    const m = this.mixT / FADE
    u.uMix.value = m * m * (3 - 2 * m)
    const f = 1 - this.focusT / FOCUS
    u.uBlur.value = calm ? 0 : 0.011 * f * f
    u.uExposure.value = exposure
    u.uLevel.value = level
    ;(u.uAmb.value as THREE.Color).copy(amb)
    this.glow.lerp(this.target, 1 - Math.exp(-dt * 3.5))
  }

  /** the two pictures being mixed and how far (for the beam's colour) */
  get state() {
    return { a: this.a, b: this.b, mix: this.mat.uniforms.uMix.value as number }
  }
}
