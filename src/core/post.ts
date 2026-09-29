import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/*
 * Post-processing: Scene (+ Sanitize NaN guard) → Bloom → Output → FIELD → FINAL.
 * Only the scene render is multisampled (its own target, the only one with a
 * depth buffer); the composer's ping-pong targets are single-sampled.
 *
 * Earlier concepts' final passes: Orbit glitch + zoom blur; Resonance ripple;
 * Press riso halftone; Town tilt-shift + cloud wipe; Arcade pixel + CRT;
 * Frost breath fog; Contour flood; Primetime replay stinger; Noir
 * silver-gelatin + blinds; Neon light trails + lights-out; Opal colour field.
 *
 * GJP: a warm photograph of a small room — a tungsten grade (shadows fall to
 * a brown black, highlights go cream), a smoky warm lift, film grain, a deep
 * vignette — and THE SOUNDHOLE CUT: approaching a chapter boundary the frame
 * shrinks into the soundhole of an acoustic guitar — the spruce top closes in
 * around it (straight Sitka grain, a ringed rosette with a herringbone band)
 * and the scene inside darkens to the guitar's interior. At the boundary the
 * whole frame is the top of the guitar with its soundhole at the centre, lit
 * by the scene's own light (a 1/32-res copy of the frame: a steady brightness,
 * never a flash). After it the camera flies through the soundhole: the hole
 * opens until the next scene fills the frame.
 * Calm (reduced motion / Motion off): the engine fades through near-black.
 *
 * The final pass runs AFTER the sRGB output pass: it sees display values.
 * Keep the Post API (params / resetParams / setSize / render / compileAsync /
 * setFadeTone) and the uTransition / uFade / uFlash / uGlitch uniforms.
 * uGlitch (params.glitch) is the THUMP here: a small push toward the viewer a
 * chapter can punch on a downbeat (zeroed under reduced motion by the engine).
 */

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    /** 1/32-res copy of the frame (FIELD pass), bilinear */
    tField: { value: null as THREE.Texture | null },
    uFieldTexel: { value: new THREE.Vector2(1 / 64, 1 / 36) },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    /** 0..1, peaks exactly at a chapter boundary (engine-driven) */
    uTransition: { value: 0 },
    /** 0..1 the THUMP: a speaker-cone push (radial magnify), no cut */
    uGlitch: { value: 0 },
    uAberration: { value: 0 },
    uGrain: { value: 0.03 },
    uVignette: { value: 0.55 },
    /** 0..1 wash to white */
    uFlash: { value: 0 },
    /** 0..1 fade to uFadeColor (calm cuts) */
    uFade: { value: 0 },
    uCutColor: { value: new THREE.Color('#0b0806').convertLinearToSRGB() },
    uFadeColor: { value: new THREE.Color('#0b0806').convertLinearToSRGB() },
    /** 0..1 speed dim: the whole frame dims while the page moves fast (flash safety net) */
    uSpeedDim: { value: 0 },
    /** vibrance (1 = none) and black-point lift (toward the warm haze colour) */
    uSat: { value: 1.06 },
    uLift: { value: 0.012 },
    uHaze: { value: new THREE.Color('#5a3322').convertLinearToSRGB() },
    /** 0..1 the tungsten grade */
    uWarmth: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tField;
    uniform vec2 uFieldTexel;
    uniform float uTime, uDpr, uTransition, uGlitch, uAberration, uGrain, uVignette, uFlash, uFade, uSpeedDim, uSat, uLift, uWarmth;
    uniform vec2 uResolution;
    uniform vec3 uCutColor, uFadeColor, uHaze;
    varying vec2 vUv;

    const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

    // a smooth read of the low-res field (5 bilinear taps)
    vec3 field(vec2 uv) {
      vec2 o = uFieldTexel;
      return (texture2D(tField, uv).rgb * 2.0
        + texture2D(tField, uv + vec2(o.x, o.y)).rgb
        + texture2D(tField, uv + vec2(-o.x, o.y)).rgb
        + texture2D(tField, uv + vec2(o.x, -o.y)).rgb
        + texture2D(tField, uv + vec2(-o.x, -o.y)).rgb) / 6.0;
    }
    // the frame's mean colour (16 taps of the field)
    vec3 fieldMean() {
      vec3 m = vec3(0.0);
      for (int y = 0; y < 4; y++)
        for (int x = 0; x < 4; x++)
          m += texture2D(tField, vec2(0.125 + 0.25 * float(x), 0.125 + 0.25 * float(y))).rgb;
      return m / 16.0;
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }

    // SITKA SPRUCE seen straight on (the neck is "up"): straight grain lines
    // running vertically, bookmatched at the centre seam, a slight wander,
    // cross-grain silk flecks. Returns an albedo-ish colour.
    vec3 spruce(vec2 a) {
      float ax = abs(a.x);
      float lines = ax * (38.0 - 6.0 * ax) + 0.7 * vnoise(vec2(ax * 3.0, a.y * 0.8)) + 0.15 * vnoise(vec2(ax * 40.0, a.y * 0.3));
      float g = fract(lines);
      float late = (1.0 - smoothstep(0.0, 0.14, g)) + smoothstep(0.86, 1.0, g);
      late *= 0.55 + 0.45 * hash(vec2(floor(lines), 5.1));
      vec3 c = mix(vec3(0.91, 0.78, 0.55), vec3(0.72, 0.52, 0.3), late * 0.6);
      float fleck = vnoise(vec2(ax * 3.0 + floor(lines) * 0.31, a.y * 30.0));
      c *= 1.0 + 0.08 * smoothstep(0.65, 0.92, fleck);
      return c;
    }

    // the ROSETTE round a soundhole of radius R: returns (colour, coverage)
    vec4 rosette(float r, float R, float ang) {
      float w = 0.06 + 0.3 * R;
      float o = (r - R) / w; // 0 at the hole's edge → 1 at the rosette's outside
      if (o < 0.0 || o > 1.0) return vec4(0.0);
      vec3 blk = vec3(0.03, 0.028, 0.026);
      vec3 wht = vec3(0.94, 0.91, 0.84);
      vec3 c = vec3(0.0);
      float cov = 1.0;
      if (o < 0.08) c = blk;
      else if (o < 0.12) c = wht;
      else if (o < 0.62) {
        float hb = fract(ang * 30.0 + (o - 0.37) * (o < 0.37 ? 1.0 : -1.0) * 9.0);
        c = mix(blk, wht, step(0.5, hb));
      } else if (o < 0.66) c = wht;
      else if (o < 0.76) c = blk;
      else if (o < 0.8) c = wht;
      else if (o < 0.9) c = blk;
      else cov = 0.0;
      return vec4(c, cov);
    }

    vec3 grade(vec3 col) {
      // tungsten: shadows sink to a brown black, highlights go cream-amber
      float l = dot(col, LUM);
      vec3 sh = vec3(1.0, 0.84, 0.74);
      vec3 hi = vec3(1.03, 0.98, 0.88);
      vec3 tint = mix(sh, hi, smoothstep(0.05, 0.6, l));
      col *= mix(vec3(1.0), tint, uWarmth);
      // a gentle S-curve (toe keeps the stage black, shoulder keeps the cream)
      col = clamp(col, 0.0, 1.0);
      vec3 s = col * col * (3.0 - 2.0 * col);
      return mix(col, s, 0.28 * uWarmth);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 a = c * vec2(aspect, 1.0);
      float r = length(a) / length(vec2(aspect, 1.0) * 0.5);

      float t = clamp(uTransition, 0.0, 1.0);
      // the cone push: a kick drum on the cut, a small thump on a downbeat
      float push = 0.16 * smoothstep(0.0, 1.0, t) + 0.035 * clamp(uGlitch, 0.0, 1.0);
      vec2 suv = 0.5 + c * (1.0 - push * (1.0 - 0.7 * r * r));

      vec3 col;
      if (uAberration > 0.00001) {
        col.r = texture2D(tDiffuse, suv + c * uAberration).r;
        col.g = texture2D(tDiffuse, suv).g;
        col.b = texture2D(tDiffuse, suv - c * uAberration).b;
      } else col = texture2D(tDiffuse, suv).rgb;

      col = grade(col);

      // THE SOUNDHOLE CUT
      if (t > 0.001) {
        float e = smoothstep(0.0, 1.0, t);
        // the hole: covers the frame at t = 0, a real soundhole at the boundary
        float Rmax = length(vec2(aspect, 1.0)) * 1.25 + 0.3;
        float R = mix(Rmax, 0.2, e);
        float dist = length(a) / 0.5;           // 1.0 at the top/bottom edge
        float ang = atan(a.y, a.x);
        vec3 m = fieldMean();
        float ml = dot(m, LUM);
        vec3 lf = field(suv);
        vec3 light = mix(vec3(ml), lf, 0.6);
        vec3 lh = light / max(dot(light, LUM), 1e-3);
        lh = mix(vec3(1.0), lh, 0.35);
        // a steady, modest brightness for the wood (never a flash)
        float target = clamp(ml * 1.35 + 0.08, 0.1, 0.26);
        vec3 top = spruce(a * 2.2) * lh * (target / 0.62);
        // a soft pool of light on the top, falling off toward the frame's edges
        top *= 1.05 - 0.35 * smoothstep(0.2, 1.3, dist);
        vec4 ros = rosette(dist, R, ang);
        top = mix(top, ros.rgb * (target / 0.5) * lh, ros.a * 0.95);
        // inside the hole: the scene, darkening into the guitar's interior
        vec3 interior = vec3(0.035, 0.02, 0.012) + m * 0.25;
        float insideDark = smoothstep(0.55, 1.0, t);
        vec3 hole = mix(col, interior, insideDark);
        // a soft shadow just inside the edge (the top's thickness)
        hole *= mix(1.0, 0.55, (1.0 - smoothstep(0.0, 0.05 + 0.1 * R, R - dist)) * e);
        float inHole = 1.0 - smoothstep(R - 0.004, R + 0.004, dist);
        col = mix(top, hole, inHole);
      }

      col *= 1.0 - clamp(uSpeedDim, 0.0, 0.8);
      float l = dot(col, LUM);
      col = max(mix(vec3(l), col, uSat), 0.0);
      col = uLift * uHaze * 3.0 + col * (1.0 - uLift);
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      float v = 1.0 - smoothstep(0.3, 1.05, length(c * vec2(1.0, 0.92)) * 1.42);
      col *= mix(1.0, 0.42 + 0.58 * v, uVignette);
      // film grain, strongest in the mids
      vec2 gp = floor(vUv * uResolution / max(1.0, uDpr));
      float gl = dot(col, LUM);
      float gw = 0.6 + 1.6 * gl * (1.0 - gl);
      col += (hash(gp + fract(floor(uTime * 24.0) * 0.1317) * 97.0) - 0.5) * uGrain * gw;
      col = mix(col, uFadeColor, clamp(uFade, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

/** minimum seconds between two white-flash onsets (WCAG 2.3.1) */
const FLASH_GAP = 0.4

export type PostParams = {
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  aberration: number
  grain: number
  vignette: number
  /** the THUMP 0..1: a speaker-cone push (chapters punch it on a downbeat) */
  glitch: number
  /** white wash 0..1 */
  flash: number
  exposure: number
  /** vibrance (1 = none) */
  saturation: number
  /** black-point lift 0..0.15, toward the warm haze colour (smoke in the light) */
  lift: number
  /** 0..1 the tungsten grade */
  warmth: number
}

/**
 * Bloom on the hot stuff: tube glow, jewel lights, lamp filaments, the
 * brightest glints on nickel and lacquer. A dark stage, so the threshold
 * can sit a little lower than a white studio's.
 */
export const POST_DEFAULTS: PostParams = {
  bloomStrength: 0.55,
  bloomRadius: 0.55,
  bloomThreshold: 0.88,
  aberration: 0,
  grain: 0.03,
  vignette: 0.55,
  glitch: 0,
  flash: 0,
  exposure: 1,
  saturation: 1.06,
  lift: 0.012,
  warmth: 1,
}

/**
 * Scrubs NaN/Inf and clamps runaway HDR right after the scene render. A single
 * bad fragment would otherwise smear across the whole frame through bloom.
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 64.0), c.a);
    }
  `,
}

/**
 * Renders the scene into its OWN target — the only multisampled one and the
 * only one with depth — then sanitizes (NaN guard) into the composer's
 * single-sampled read buffer. Multisampled ping-pong targets cost 2–3x per
 * post pass (Frost's lesson), so MSAA lives here only.
 */
class ScenePass extends Pass {
  target: THREE.WebGLRenderTarget
  material: THREE.ShaderMaterial
  private quad: FullScreenQuad
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    samples: number,
  ) {
    super()
    this.needsSwap = false
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SanitizeShader.uniforms),
      vertexShader: SanitizeShader.vertexShader,
      fragmentShader: SanitizeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }
  setSize(w: number, h: number) {
    this.target.setSize(w, h)
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    this.material.uniforms.tDiffuse.value = this.target.texture
    renderer.setRenderTarget(this.renderToScreen ? null : read)
    this.quad.render(renderer)
  }
}

/**
 * FIELD: a 1/32-res copy of the frame for the colour-field cut, made in two
 * box-filtered steps (1/8, then 1/32). Doesn't touch the ping-pong buffers
 * (needsSwap false); skipped entirely when no cut is on screen.
 */
const DownShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTexel: { value: new THREE.Vector2() } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec2 o = uTexel;
      vec3 c = texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tDiffuse, vUv + vec2(o.x, -o.y)).rgb
        + texture2D(tDiffuse, vUv + vec2(-o.x, o.y)).rgb + texture2D(tDiffuse, vUv + vec2(o.x, o.y)).rgb;
      gl_FragColor = vec4(c * 0.25, 1.0);
    }
  `,
}

class FieldPass extends Pass {
  a = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: false })
  b = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: false })
  material = new THREE.ShaderMaterial({ ...DownShader, uniforms: THREE.UniformsUtils.clone(DownShader.uniforms), depthTest: false, depthWrite: false })
  private quad = new FullScreenQuad(this.material)
  active = false
  constructor() {
    super()
    this.needsSwap = false
  }
  setSize(w: number, h: number) {
    this.a.setSize(Math.max(8, Math.round(w / 8)), Math.max(8, Math.round(h / 8)))
    this.b.setSize(Math.max(4, Math.round(w / 32)), Math.max(4, Math.round(h / 32)))
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    if (!this.active) return
    const u = this.material.uniforms
    u.tDiffuse.value = read.texture
    u.uTexel.value.set(1 / read.width, 1 / read.height).multiplyScalar(2)
    renderer.setRenderTarget(this.a)
    this.quad.render(renderer)
    u.tDiffuse.value = this.a.texture
    u.uTexel.value.set(1 / this.a.width, 1 / this.a.height).multiplyScalar(1.5)
    renderer.setRenderTarget(this.b)
    this.quad.render(renderer)
  }
}

export class Post {
  composer: EffectComposer
  bloom: UnrealBloomPass
  final: ShaderPass
  private scenePass: ScenePass
  /**
   * Chapters write targets here every frame (the engine resets them to
   * defaults first); values are damped so nothing pops at a cut.
   */
  params: PostParams = { ...POST_DEFAULTS }
  private current: PostParams = { ...POST_DEFAULTS }
  transition = 0
  fade = 0
  /** engine: reduced motion or the visitor's Motion switch is off */
  calm = false
  /** engine: smoothed scroll velocity in viewport heights per second (signed) */
  velocity = 0
  /** engine: +1 when the nearest boundary is ahead (leaving a chapter), -1 when behind (entering) */
  cutSide = 1
  private speedDim = 0
  private field: FieldPass
  /**
   * Run right before the scene renders each frame, at the TOP level (camera
   * already placed, its matrixWorld updated). Mirrors/reflectors render here
   * instead of from Mesh.onBeforeRender: a nested render makes every lit
   * material re-resolve its program twice a frame. Check your own group's
   * visibility inside the hook (it runs whichever chapter is active).
   */
  preRender: ((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void)[] = []
  private lastFlashAt = -1e9
  private flashLive = false
  private flashOk = true

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    /** skip MSAA (retina / mobile: already supersampled; MSAA half-float targets are huge) */
    noMsaa: boolean,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 0,
      depthBuffer: false,
    })
    this.composer = new EffectComposer(renderer, rt)
    this.scenePass = new ScenePass(scene, camera, noMsaa ? 0 : 4)
    this.composer.addPass(this.scenePass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), POST_DEFAULTS.bloomStrength, POST_DEFAULTS.bloomRadius, POST_DEFAULTS.bloomThreshold)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.field = new FieldPass()
    this.composer.addPass(this.field)
    this.final = new ShaderPass(FinalShader)
    this.final.uniforms.tField.value = this.field.b.texture
    this.composer.addPass(this.final)
  }

  /** The scene's render target (HDR, linear; multisampled on 1x desktops) — prewarm compiles against it. */
  get sceneTarget() {
    return this.scenePass.target
  }

  /** true when `rt` is the frame's own scene target (not a mirror / transmission pass) */
  isFrameTarget(rt: THREE.WebGLRenderTarget | null) {
    return rt === this.scenePass.target || rt === this.composer.renderTarget1 || rt === this.composer.renderTarget2
  }

  /** THEME: colour the cut and calm fade pass through. */
  setCutColor(color: THREE.ColorRepresentation) {
    // display values (the final pass runs after the sRGB output pass)
    ;(this.final.uniforms.uCutColor.value as THREE.Color).set(color).convertLinearToSRGB()
    ;(this.final.uniforms.uFadeColor.value as THREE.Color).set(color).convertLinearToSRGB()
  }

  /** Engine hook (kept for compatibility; themes may tint the fade by scene tone). */
  setFadeTone(_tone: number) {}

  resetParams() {
    Object.assign(this.params, POST_DEFAULTS)
  }

  /**
   * Compile every post-processing shader in parallel so the first composer
   * render doesn't block on synchronous links.
   */
  compileAsync(): Promise<unknown> {
    // the same attribute set as FullScreenQuad (position + uv, no normal): a
    // PlaneGeometry compiles a different program variant that's never used
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2))
    const quad = new THREE.Mesh(geo)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const b = this.bloom as unknown as Record<string, unknown>
    const mats: THREE.Material[] = []
    const add = (m: unknown) => {
      if (m && (m as THREE.Material).isMaterial) mats.push(m as THREE.Material)
    }
    for (const pass of this.composer.passes) add((pass as unknown as { material?: unknown }).material)
    for (const m of (b.separableBlurMaterials as unknown[]) ?? []) add(m)
    add(b.compositeMaterial)
    add(b.blendMaterial)
    add(b.materialHighPassFilter)
    add(b.copyMaterial)
    return Promise.all(mats.map(m => this.renderer.compileAsync(new THREE.Mesh(quad.geometry, m), cam).catch(() => {})))
  }

  setSize(w: number, h: number, dpr: number) {
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(w, h)
    this.bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2)
    this.final.uniforms.uResolution.value.set(w * dpr, h * dpr)
    this.final.uniforms.uDpr.value = dpr
    this.final.uniforms.uFieldTexel.value.set(1 / this.field.b.width, 1 / this.field.b.height)
  }

  render(dt: number, time: number) {
    const k = 1 - Math.exp(-6 * dt)
    const c = this.current
    const p = this.params
    for (const key of Object.keys(p) as (keyof PostParams)[]) {
      // flash & glitch respond instantly so chapters can punch them
      c[key] = key === 'flash' || key === 'glitch' ? p[key] : c[key] + (p[key] - c[key]) * k
    }
    // flash budget (WCAG 2.3.1): a flash starting within FLASH_GAP of the last is dropped
    if (c.flash > 0.02) {
      if (!this.flashLive) {
        this.flashLive = true
        this.flashOk = time - this.lastFlashAt >= FLASH_GAP
        if (this.flashOk) this.lastFlashAt = time
      }
      if (!this.flashOk) c.flash = 0
    } else this.flashLive = false
    // speed dim (WCAG 2.3.1 safety net): the frame dims as the page moves fast,
    // attack ~0.2 s, release ~0.6 s — slow enough that wheel notches under
    // reduced motion (instant scroll, spiky velocity) read as one steady dim
    {
      const v = Math.abs(this.velocity)
      const x = Math.max(0, Math.min(1, (v - 1.1) / 2.4))
      const target = x * x * (3 - 2 * x) * 0.5
      const tau = target > this.speedDim ? 0.2 : 0.6
      this.speedDim += (target - this.speedDim) * (1 - Math.exp(-dt / tau))
    }
    // chapters zero bloom where nothing crosses the threshold: skip the pass entirely
    this.bloom.enabled = c.bloomStrength > 0.01
    this.bloom.strength = c.bloomStrength
    this.bloom.radius = c.bloomRadius
    this.bloom.threshold = c.bloomThreshold
    this.renderer.toneMappingExposure = c.exposure
    const u = this.final.uniforms
    u.uTime.value = time
    u.uTransition.value = this.transition
    u.uGlitch.value = c.glitch
    u.uAberration.value = c.aberration
    u.uGrain.value = c.grain
    u.uVignette.value = c.vignette
    u.uFlash.value = c.flash
    u.uFade.value = this.fade
    u.uSpeedDim.value = this.speedDim
    u.uSat.value = c.saturation
    u.uLift.value = c.lift
    u.uWarmth.value = c.warmth
    this.field.active = this.transition > 0.001 || c.glitch > 0.001
    if (this.preRender.length) {
      this.camera.updateMatrixWorld()
      for (const fn of this.preRender) fn(this.renderer, this.scene, this.camera)
    }
    this.composer.render(dt)
  }
}
