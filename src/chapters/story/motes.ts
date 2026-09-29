import * as THREE from 'three'
import { rng } from '../../core/math'

/*
 * Dust in the lamplight: a few hundred specks drifting over the open case,
 * visible only inside the lamp's cone (they're lit by it). The chapter slows
 * their clock to a stop on the 1977 beat — "time stood still" — and holds
 * them under reduced motion / Motion off. One draw call, additive.
 */

const VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uT;
  uniform float uPx;
  uniform float uCos;
  uniform float uAmt;
  uniform vec3 uSpotPos;
  uniform vec3 uSpotDir;
  varying float vA;
  void main() {
    vec3 p = position;
    float t = uT * (0.18 + 0.22 * aSeed.x);
    p.x += sin(t + aSeed.y * 6.2832) * 0.32;
    p.y += sin(t * 0.7 + aSeed.z * 6.2832) * 0.22;
    p.z += cos(t * 0.8 + aSeed.x * 6.2832) * 0.28;
    vec3 d = normalize(p - uSpotPos);
    float cone = smoothstep(uCos - 0.015, uCos + 0.03, dot(d, uSpotDir));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = 0.01 + 0.016 * aSeed.w;
    gl_PointSize = clamp(size * uPx / max(0.1, -mv.z), 1.0, 12.0);
    // twinkle as a speck turns in the light (slow, soft)
    float tw = 0.65 + 0.35 * sin(t * 2.3 + aSeed.w * 12.0);
    vA = cone * uAmt * (0.35 + 0.65 * aSeed.z) * tw;
  }
`
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    float a = (1.0 - smoothstep(0.15, 1.0, d)) * vA;
    gl_FragColor = vec4(uColor * a, a);
  }
`

export interface Motes {
  points: THREE.Points
  uniforms: {
    uT: { value: number }
    uPx: { value: number }
    uCos: { value: number }
    uAmt: { value: number }
    uSpotPos: { value: THREE.Vector3 }
    uSpotDir: { value: THREE.Vector3 }
    uColor: { value: THREE.Color }
  }
}

export function buildMotes(mobile: boolean): Motes {
  const n = mobile ? 140 : 300
  const r = rng(707)
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = -7 + r() * 13.5
    pos[i * 3 + 1] = 0.5 + r() * 6
    pos[i * 3 + 2] = -2.6 + r() * 7.6
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = r()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 1), 12)
  const uniforms = {
    uT: { value: 0 },
    uPx: { value: 800 },
    uCos: { value: 0.9 },
    uAmt: { value: 0 },
    uSpotPos: { value: new THREE.Vector3() },
    uSpotDir: { value: new THREE.Vector3(0, -1, 0) },
    uColor: { value: new THREE.Color('#ffd8a8') },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 5
  return { points, uniforms }
}
