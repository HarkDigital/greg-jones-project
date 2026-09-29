import * as THREE from 'three'

/*
 * THE BEAM — the projector's light through the room's haze, from the lens to
 * the picture on the sheet.
 *
 * A frustum mesh (lens rectangle → picture rectangle) drawn back faces only,
 * additive. Each pixel clips the camera ray against the frustum's six planes
 * and marches a few steps through it: the haze (slow drifting 3D noise) ×
 * the light's density (it spreads from a small, hot throat at the lens to
 * the full picture, so it's brightest near the projector) × soft edges ×
 * a forward-scattering phase (smoke scatters light onward: seen from the
 * side or the front the beam glows; looking along it from behind the
 * projector it stays a faint veil, so the picture stays clean). The beam
 * carries the picture's colours (a very blurred read of it) mixed with the
 * lamp's warm white.
 *
 * DUST: a few hundred motes drifting in the light (slow, time-based idle
 * motion; they hold still with Motion off / reduced motion).
 */

export interface BeamSpec {
  /** lens rectangle centre + half size (x, y), in a plane of constant z */
  lens: THREE.Vector3
  lensH: THREE.Vector2
  /** picture rectangle centre + half size (x, y) */
  img: THREE.Vector3
  imgH: THREE.Vector2
}

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const FRAG = (steps: number, img: boolean) => /* glsl */ `
  // (phones: fewer steps, one octave of smoke, no picture colours in the light)
  #define STEPS ${steps}
  uniform vec4 uPlanes[6];
  uniform vec3 uLens;
  uniform vec2 uLensH;
  uniform vec3 uImgC;
  uniform vec2 uImgH;
  uniform vec3 uColor;
  uniform float uI;
  uniform float uTime;
  uniform float uNear;
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uMix;
  varying vec3 vW;

  float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

  void main() {
    vec3 C = cameraPosition;
    vec3 D = vW - C;
    float s0 = 0.0;
    float s1 = 1.0;
    for (int i = 0; i < 6; i++) {
      vec4 pl = uPlanes[i];
      float den = dot(pl.xyz, D);
      float num = -(dot(pl.xyz, C) + pl.w);
      if (abs(den) < 1e-6) {
        if (num < 0.0) s1 = -1.0;
      } else if (den > 0.0) {
        s1 = min(s1, num / den);
      } else {
        s0 = max(s0, num / den);
      }
    }
    if (s1 <= s0) discard;
    float len = length(D);
    vec3 dir = D / len;
    float ds = (s1 - s0) / float(STEPS);
    float jitter = hash2(gl_FragCoord.xy);
    vec3 axis = normalize(uImgC - uLens);
    float zL = uLens.z;
    float zS = uImgC.z;
    vec3 sum = vec3(0.0);
    for (int k = 0; k < STEPS; k++) {
      float s = s0 + (float(k) + jitter) * ds;
      vec3 X = C + D * s;
      float w = clamp((zL - X.z) / (zL - zS), 0.0, 1.0);
      vec2 c = mix(uLens.xy, uImgC.xy, w);
      vec2 h = mix(uLensH, uImgH, w);
      vec2 uv = (X.xy - c) / h;
      vec2 e = 1.0 - smoothstep(vec2(0.3), vec2(1.0), abs(uv));
      float edge = e.x * e.y * (0.6 + 0.4 * e.x * e.y);
      // light density: the same flux through a growing cross-section
      float spread = min((uImgH.x * uImgH.y) / (h.x * h.y), 26.0) * 0.016;
      // haze: slow drifting smoke, thinner near the sheet
      vec3 hp = X * vec3(0.16, 0.2, 0.09) + vec3(uTime * 0.018, -uTime * 0.011, uTime * 0.02);
      float haze = ${img ? 'noise3(hp) * 0.65 + noise3(hp * 2.3 + 7.1) * 0.35' : 'noise3(hp)'};
      haze = 0.25 + 1.3 * haze * haze;
      float fade = 1.0 - 0.75 * smoothstep(0.8, 1.0, w);
      // forward scattering toward the camera (Henyey-Greenstein, g = 0.3) + an isotropic floor
      float mu = dot(axis, normalize(C - X));
      float g = 0.3;
      float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
      float phase = 0.5 + 0.5 * hg;
      vec3 col = uColor;
      ${
        img
          ? `vec2 tuv = clamp(uv * 0.5 + 0.5, 0.02, 0.98);
      vec3 pic = mix(texture2D(tA, tuv, 4.0).rgb, texture2D(tB, tuv, 4.0).rgb, uMix);
      col = mix(col, pic * 1.4 + col * 0.25, 0.55);`
          : ''
      }
      sum += col * (edge * spread * haze * fade * phase);
    }
    // near the lens the camera sits in the light: keep it from filling the frame
    float near = smoothstep(0.0, uNear, len * s0 + 0.5);
    gl_FragColor = vec4(sum * ds * len * uI * near, 1.0);
  }
`

export class Beam {
  mesh: THREE.Mesh
  motes: THREE.Points
  private mat: THREE.ShaderMaterial
  private moteMat: THREE.ShaderMaterial

  constructor(spec: BeamSpec, mobile: boolean) {
    const { lens, lensH, img, imgH } = spec
    // box → frustum: z = +1 is the lens end, z = -1 the picture end (winding preserved)
    const geo = new THREE.BoxGeometry(2, 2, 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const w = (1 - pos.getZ(i)) / 2
      const cx = THREE.MathUtils.lerp(lens.x, img.x, w)
      const cy = THREE.MathUtils.lerp(lens.y, img.y, w)
      const hx = THREE.MathUtils.lerp(lensH.x, imgH.x, w)
      const hy = THREE.MathUtils.lerp(lensH.y, imgH.y, w)
      pos.setXYZ(i, cx + pos.getX(i) * hx, cy + pos.getY(i) * hy, THREE.MathUtils.lerp(lens.z, img.z, w))
    }
    geo.computeBoundingSphere()

    // the six planes, inside where dot(n, X) + d <= 0
    const planes: THREE.Vector4[] = []
    const dz = img.z - lens.z
    for (const [ax, sgn] of [
      ['x', 1],
      ['x', -1],
      ['y', 1],
      ['y', -1],
    ] as const) {
      const l = (ax === 'x' ? lens.x : lens.y) + sgn * (ax === 'x' ? lensH.x : lensH.y)
      const s = (ax === 'x' ? img.x : img.y) + sgn * (ax === 'x' ? imgH.x : imgH.y)
      // the edge line: coord = a + b z
      const b = (s - l) / dz
      const a = l - b * lens.z
      // sgn * (coord - a - b z) <= 0
      const n = new THREE.Vector3(ax === 'x' ? sgn : 0, ax === 'y' ? sgn : 0, -sgn * b)
      planes.push(new THREE.Vector4(n.x, n.y, n.z, -sgn * a))
    }
    // caps: z <= lens.z and z >= img.z (the lens end is nearer the camera side: larger z)
    planes.push(new THREE.Vector4(0, 0, 1, -lens.z))
    planes.push(new THREE.Vector4(0, 0, -1, img.z))

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uPlanes: { value: planes },
        uLens: { value: lens.clone() },
        uLensH: { value: lensH.clone() },
        uImgC: { value: img.clone() },
        uImgH: { value: imgH.clone() },
        uColor: { value: new THREE.Color('#ffd8a8') },
        uI: { value: 1 },
        uTime: { value: 0 },
        uNear: { value: 3 },
        tA: { value: null },
        tB: { value: null },
        uMix: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG(mobile ? 5 : 8, !mobile),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.name = 'beam'
    this.mesh.renderOrder = 2
    this.mesh.frustumCulled = false

    // ---- dust motes in the light
    const N = mobile ? 160 : 380
    const seeds = new Float32Array(N * 4)
    let s = 9
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < N; i++) {
      seeds[i * 4] = r() * 2 - 1
      seeds[i * 4 + 1] = r() * 2 - 1
      // more of them nearer the projector, where the light is dense
      seeds[i * 4 + 2] = 0.06 + 0.72 * Math.pow(r(), 1.35)
      seeds[i * 4 + 3] = r()
    }
    const mg = new THREE.BufferGeometry()
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: {
        uLens: { value: lens.clone() },
        uLensH: { value: lensH.clone() },
        uImgC: { value: img.clone() },
        uImgH: { value: imgH.clone() },
        uColor: { value: new THREE.Color('#ffd8a8') },
        uI: { value: 1 },
        uTime: { value: 0 },
        uPx: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform vec3 uLens;
        uniform vec2 uLensH;
        uniform vec3 uImgC;
        uniform vec2 uImgH;
        uniform float uTime;
        uniform float uPx;
        varying float vA;
        void main() {
          float t = uTime;
          float ph = aSeed.w * 6.2831;
          float w = aSeed.z + 0.012 * sin(t * 0.07 + ph);
          // a slow wander across the light, a slower rise through it (wrapping, faded at the edges)
          float u = aSeed.x * 0.92 + 0.07 * sin(t * (0.09 + 0.05 * aSeed.w) + ph);
          float v = fract(aSeed.y * 0.5 + 0.5 + t * (0.004 + 0.004 * aSeed.w)) * 2.0 - 1.0;
          vec2 c = mix(uLens.xy, uImgC.xy, w);
          vec2 h = mix(uLensH, uImgH, w);
          vec3 p = vec3(c + vec2(u, v) * h * 0.9, mix(uLens.z, uImgC.z, w));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float edge = (1.0 - smoothstep(0.7, 0.95, abs(v))) * (1.0 - smoothstep(0.75, 0.95, abs(u)));
          // denser light near the lens → brighter motes there
          float spread = clamp((uImgH.x * uImgH.y) / (h.x * h.y) * 0.04, 0.15, 1.6);
          vec3 axis = normalize(uImgC - uLens);
          float mu = dot(axis, normalize(cameraPosition - p));
          float phase = 0.3 + 0.7 * (1.0 - 0.45 * 0.45) / pow(1.0 + 0.45 * 0.45 - 2.0 * 0.45 * mu, 1.5);
          vA = edge * spread * phase * (0.45 + 0.55 * aSeed.w);
          gl_PointSize = clamp(uPx * (0.028 + 0.03 * aSeed.w) * 800.0 / max(-mv.z, 1.0), 1.0, 7.0 * uPx);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uI;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.15, 0.5, d);
          gl_FragColor = vec4(uColor * a * vA * uI, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.motes = new THREE.Points(mg, this.moteMat)
    this.motes.frustumCulled = false
    this.motes.renderOrder = 3
  }

  /**
   * colour: the light's colour (linear); level: beam strength; motes: dust
   * strength; time: idle time (frozen when calm); pics: the sheet's two
   * pictures and their mix; px: device pixel ratio.
   */
  update(color: THREE.Color, level: number, motes: number, time: number, pics: { a: THREE.Texture; b: THREE.Texture; mix: number }, px: number) {
    const u = this.mat.uniforms
    ;(u.uColor.value as THREE.Color).copy(color)
    u.uI.value = level
    u.uTime.value = time
    u.tA.value = pics.a
    u.tB.value = pics.b
    u.uMix.value = pics.mix
    const m = this.moteMat.uniforms
    ;(m.uColor.value as THREE.Color).copy(color)
    m.uI.value = motes
    m.uTime.value = time
    m.uPx.value = px
  }
}
