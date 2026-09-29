import * as THREE from 'three'

/*
 * FESTOON — strands of warm bulbs hung in swags over the corner stage, drawn
 * the way a camera sees them at night: each bulb is a camera-facing disc
 * whose size follows a thin-lens circle of confusion (a small hot bulb when
 * it's at the focus distance, a soft bokeh disc with a brighter rim when it
 * isn't), its brightness spread over the disc (energy conserved, floored so
 * far discs stay visible). One instanced draw, additive, depth-tested (the
 * guitar occludes them), world-anchored (they parallax as the camera moves).
 *
 *   const f = new Festoon([{ a, b, sag, spacing }])
 *   group.add(f.mesh)
 *   f.update(camera, focusDistance, level)   // every frame
 */

export interface Strand {
  a: THREE.Vector3
  b: THREE.Vector3
  /** how far the middle of the swag hangs below the straight line */
  sag: number
  /** bulb spacing (units) */
  spacing: number
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute float iSeed;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uBulbR;
  uniform float uPx;
  varying vec2 vQ;
  varying float vFocus;
  varying float vEnergy;
  varying float vSeed;
  void main() {
    vec4 vc = viewMatrix * vec4(iPos, 1.0);
    float dist = max(0.1, -vc.z);
    // thin lens: the blur disc's radius in world units at the bulb's distance
    float coc = 0.5 * uAperture * abs(1.0 - dist / uFocus);
    // never smaller than the bulb itself or ~1.5 px
    float r = max(max(coc, uBulbR), 1.5 * uPx * dist);
    vFocus = clamp(uBulbR / max(coc, 1e-4), 0.0, 1.0);
    // brightness spread over the disc (floored so a far soft disc still reads)
    vEnergy = max(0.16, (uBulbR * uBulbR) / (r * r));
    vQ = position.xy;
    vSeed = iSeed;
    vc.xy += position.xy * r;
    gl_Position = projectionMatrix * vc;
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec2 vQ;
  varying float vFocus;
  varying float vEnergy;
  varying float vSeed;
  void main() {
    float d = length(vQ);
    if (d > 1.0) discard;
    // a soft-edged disc with a slightly brighter rim (a real lens's bokeh)
    float disc = 1.0 - smoothstep(0.82, 1.0, d);
    float rim = smoothstep(0.55, 0.92, d) * disc;
    // in focus: a hot little filament glow in a warm glass bulb
    float core = exp(-d * d * 7.0);
    float tone = 0.85 + 0.3 * fract(vSeed * 13.7);
    vec3 col = uColor * tone;
    float soft = (disc * 0.78 + rim * 0.34) * vEnergy;
    float sharp = core * 2.4 + disc * 0.5;
    float a = mix(soft, sharp, vFocus) * uLevel;
    gl_FragColor = vec4(col * a, 1.0);
  }
`

export class Festoon {
  mesh: THREE.Mesh
  private uniforms: Record<string, THREE.IUniform>
  private size = new THREE.Vector2()

  constructor(strands: Strand[], { color = '#ffb45e', bulbR = 0.2, aperture = 0.9 } = {}) {
    const pos: number[] = []
    const seed: number[] = []
    let k = 0
    for (const s of strands) {
      const len = s.a.distanceTo(s.b)
      const n = Math.max(2, Math.round(len / s.spacing))
      // strands that meet at a post share the bulb there: skip a repeated first bulb
      const first = pos.length && Math.hypot(pos[pos.length - 3] - s.a.x, pos[pos.length - 2] + 0.12 - s.a.y, pos[pos.length - 1] - s.a.z) < 0.01 ? 1 : 0
      for (let i = first; i <= n; i++) {
        const t = i / n
        const p = s.a.clone().lerp(s.b, t)
        // a catenary-ish swag, the bulbs hanging a touch below the wire (drops vary by hand)
        const drop = 0.12 + 0.1 * Math.sin(k * 2.39 + 1.1) * Math.sin(k * 0.73)
        p.y -= s.sag * 4 * t * (1 - t) + drop
        pos.push(p.x, p.y, p.z)
        seed.push((k++ * 0.618) % 1)
      }
    }
    const geo = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(2, 2)
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 1))
    geo.instanceCount = pos.length / 3
    this.uniforms = {
      uColor: { value: new THREE.Color(color) },
      uLevel: { value: 1 },
      uFocus: { value: 10 },
      uAperture: { value: aperture },
      uBulbR: { value: bulbR },
      uPx: { value: 0.001 },
    }
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    this.mesh.name = 'festoon'
  }

  /** focus: the camera's focus distance (units); level: 0..1.5 brightness */
  update(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, focus: number, level: number, aperture?: number) {
    renderer.getDrawingBufferSize(this.size)
    const u = this.uniforms
    u.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.size.y)
    u.uFocus.value = Math.max(0.5, focus)
    u.uLevel.value = level
    if (aperture !== undefined) u.uAperture.value = aperture
  }
}
