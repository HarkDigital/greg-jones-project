import * as THREE from 'three'

/*
 * LISTEN · the string lights over the machine: strands of warm bulbs in
 * shallow swags, world-anchored (they parallax as the camera moves), drawn
 * as camera-facing discs sized by a thin-lens blur — a small hot bulb near
 * the focus distance, a soft disc with a brighter rim away from it (its
 * light spread over the disc, floored so far ones still read). One
 * instanced, additive, depth-tested draw. Steady: no flicker.
 *
 * (The hero, watch and band chapters carry their own festoons; the
 * integrator may lift one into the kit — see the chapter's notes.)
 */

export interface Swag {
  a: THREE.Vector3
  b: THREE.Vector3
  sag: number
  spacing: number
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute float iTone;
  uniform float uFocus;
  uniform float uLens;
  uniform float uR;
  uniform float uPx;
  varying vec2 vQ;
  varying float vSharp;
  varying float vGain;
  varying float vTone;
  void main() {
    vec4 vc = viewMatrix * vec4(iPos, 1.0);
    float dist = max(0.1, -vc.z);
    float blur = 0.5 * uLens * abs(1.0 - dist / uFocus);
    float r = max(max(blur, uR), 1.5 * uPx * dist);
    vSharp = clamp(uR / max(blur, 1e-4), 0.0, 1.0);
    vGain = max(0.18, (uR * uR) / (r * r));
    vTone = iTone;
    vQ = position.xy;
    vc.xy += position.xy * r;
    gl_Position = projectionMatrix * vc;
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec2 vQ;
  varying float vSharp;
  varying float vGain;
  varying float vTone;
  void main() {
    float d = length(vQ);
    if (d > 1.0) discard;
    float disc = 1.0 - smoothstep(0.8, 1.0, d);
    float ring = smoothstep(0.5, 0.92, d) * disc;
    float core = exp(-d * d * 7.0);
    float soft = (disc * 0.75 + ring * 0.35) * vGain;
    float hot = core * 2.2 + disc * 0.45;
    float a = mix(soft, hot, vSharp) * uLevel;
    gl_FragColor = vec4(uColor * (0.86 + 0.28 * vTone) * a, 1.0);
  }
`

export class StringLights {
  mesh: THREE.Mesh
  private u: Record<string, THREE.IUniform>
  private buf = new THREE.Vector2()

  constructor(swags: Swag[], { color = '#ffb45e', bulb = 0.19, lens = 1.9 } = {}) {
    const pos: number[] = []
    const tone: number[] = []
    let k = 0
    for (const s of swags) {
      const n = Math.max(2, Math.round(s.a.distanceTo(s.b) / s.spacing))
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const p = s.a.clone().lerp(s.b, t)
        // the swag, each bulb hanging a hand-set drop below the wire
        p.y -= s.sag * 4 * t * (1 - t) + 0.14 + 0.08 * Math.sin(k * 2.1 + 0.7)
        pos.push(p.x, p.y, p.z)
        tone.push((k++ * 0.618) % 1)
      }
    }
    const geo = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(2, 2)
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('iTone', new THREE.InstancedBufferAttribute(new Float32Array(tone), 1))
    geo.instanceCount = pos.length / 3
    this.u = {
      uColor: { value: new THREE.Color(color) },
      uLevel: { value: 1 },
      uFocus: { value: 20 },
      uLens: { value: lens },
      uR: { value: bulb },
      uPx: { value: 0.001 },
    }
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.u,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
  }

  /** focus: the lens's focus distance (units); level 0..1.5 */
  update(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, focus: number, level: number) {
    renderer.getDrawingBufferSize(this.buf)
    this.u.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.buf.y)
    this.u.uFocus.value = Math.max(0.5, focus)
    this.u.uLevel.value = level
  }
}
