import * as THREE from 'three'
import { nextFrame } from '../../core/yield'
import { ALBUMS } from '../../content'
import { buildGuitar, bodyOutline, type Guitar } from '../../kit/guitar'
import { fontsReady } from '../../kit/materials'
import { cable, scaleUv, stageFloor } from '../../kit/stage'
import { buildKit, type Kit } from './drums'
import { buildBass, type Fretted } from './instruments'
import {
  boomStand,
  buildAmp,
  buildClapper,
  buildFestoon,
  buildOnAir,
  buildRadio,
  buildRug,
  floorMap,
  guitarStand,
  makeMats,
  roadCase,
  setlist,
  stool,
  type Festoon,
  type OnAir,
  type Radio,
} from './props'
import { merge, mesh, rod } from './util'

/*
 * THE BAND · the set: the corner stage of a small room after dark, set for
 * the trio and waiting for them — no people, just the gear each of the three
 * leaves in his spot (a classic trio stage, as the audience sees it):
 *
 *   GREG     front and centre-left: his acoustic on a stand, the stool, a
 *            boom mic, the setlist taped to the boards
 *   TOM      behind, on a low drum riser: the kit on a rug, a boom mic over
 *            the throne
 *   DAVID    stage left (the audience's right): the bass on a stand, a cab
 *            with its head, a mic
 *   CORNER   (current happenings, downstage right) a road case with a
 *            tabletop radio (its dial runs past 104.5 and 93.7), an ON AIR
 *            lightbox on a stand, a clapperboard for the House Not Home video
 *
 * Warm floorboards on a low riser, festoon strands overhead. World: floor
 * y = 0, the audience toward +z. Units: 1 = 10 cm.
 */

export interface Spot {
  /** what the camera frames (world) and the world size that must fit */
  at: THREE.Vector3
  w: number
  h: number
  /** where in the free region the point sits (0..1, default centre) */
  ax?: number
  ay?: number
  /** a tighter framing for portrait screens (their free band is short) */
  tall?: Spot
}

export interface BandSet {
  guitar: Guitar
  bass: Fretted
  kit: Kit
  radio: Radio
  onAir: OnAir
  festoon: Festoon
  ampJewels: THREE.MeshBasicMaterial[]
  /** the two practical lights (intensity-driven) */
  onAirLight: THREE.PointLight
  dialLight: THREE.PointLight
  /** where each beat frames: intro, Greg, David, Tom, ON AIR, clapper, radio, closing */
  spots: Spot[]
}

/** stand an instrument (kit-guitar local frame) upright: neck up, face toward yaw, leaning back */
function standUp(obj: THREE.Object3D, tail: number, back: number, base: THREE.Vector3, lean: number, yaw: number, lift: number) {
  obj.rotation.set(-lean, yaw, Math.PI / 2, 'XYZ')
  const p = new THREE.Vector3(tail, 0, back * 0.5).applyEuler(obj.rotation)
  obj.position.copy(base).add(new THREE.Vector3(0, lift, 0)).sub(p)
  obj.updateMatrixWorld(true)
}

const local = (obj: THREE.Object3D, x: number, y: number, z: number) => obj.localToWorld(new THREE.Vector3(x, y, z))

/** stage floor that dissolves into the dark round its edges (no hard horizon) */
function fadeEdges(m: THREE.Mesh, centre: THREE.Vector2, rx: number, rz: number, key: string) {
  const mat = m.material as THREE.MeshStandardMaterial
  mat.transparent = true
  mat.onBeforeCompile = sh => {
    sh.uniforms.uFadeC = { value: centre }
    sh.uniforms.uFadeR = { value: new THREE.Vector2(rx, rz) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFadeW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeW;\nuniform vec2 uFadeC;\nuniform vec2 uFadeR;')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\nvec2 fq = (vFadeW.xz - uFadeC) / uFadeR;\ngl_FragColor.a *= 1.0 - smoothstep(0.7, 1.0, length(fq));',
      )
  }
  mat.customProgramCacheKey = () => key
}

export async function buildSet(group: THREE.Group, mobile: boolean): Promise<BandSet> {
  await fontsReady()
  const M = makeMats()

  /* ---------------- the room: a low riser of warm boards, a dark floor below */
  const deckW = 60
  const deckD = 26
  const deckGeo = new THREE.PlaneGeometry(deckW, deckD)
  scaleUv(deckGeo, deckW / 14, deckD / 14)
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', map: floorMap(), roughness: 0.6, metalness: 0 }))
  deck.rotation.x = -Math.PI / 2
  deck.position.set(7, 0, -5.5)
  deck.receiveShadow = true
  fadeEdges(deck, new THREE.Vector2(7, -4), 30, 15, 'band-deck')
  group.add(deck)
  const lipGeo = new THREE.PlaneGeometry(deckW * 0.9, 3)
  scaleUv(lipGeo, (deckW * 0.9) / 14, 3 / 14)
  const lip = mesh(lipGeo, new THREE.MeshStandardMaterial({ color: '#5a4032', map: floorMap(), roughness: 0.7 }), false, true)
  lip.position.set(7, -1.5, 7.55)
  group.add(lip)
  const nosing = mesh(new THREE.BoxGeometry(deckW * 0.9, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: '#5a3418', roughness: 0.45 }), false, true)
  nosing.position.set(7, -0.06, 7.3)
  group.add(nosing)
  const room = stageFloor(90, 40)
  room.position.set(7, -3, 26)
  fadeEdges(room, new THREE.Vector2(7, 16), 40, 22, 'band-room')
  group.add(room)
  await nextFrame()

  /* ---------------- GREG: front and centre-left — the acoustic, the stool, a boom mic */
  const guitar = buildGuitar({ mobile })
  const gTail = Math.min(...bodyOutline().map(p => p.x))
  const gBase = new THREE.Vector3(-6.6, 0, 2.6)
  standUp(guitar.group, gTail, -1.04, gBase, 0.2, 0.14, 0.62)
  group.add(guitar.group)
  group.add(guitarStand(M, gBase.clone().setY(0.62), local(guitar.group, 5.7, 0, -0.32), 0.14))
  const gStool = new THREE.Vector3(-3.6, 0, 1.2)
  group.add(stool(M, gStool))
  const gMouth = new THREE.Vector3(-3.7, 13.3, 1.8)
  const gClip = new THREE.Vector3(-3.4, 12.5, 3.2)
  group.add(boomStand(M, new THREE.Vector3(-0.8, 0, 3.6), 10.4, gClip, gMouth.clone().sub(gClip), 0.4).group)
  const sl = setlist(ALBUMS[0].tracks.map(t => t.title))
  sl.position.set(-4.2, 0.02, 5.6)
  sl.rotation.z = 0.3
  group.add(sl)
  // the guitar's lead from its end pin, off along the floor
  const pin = local(guitar.group, gTail - 0.02, 0, -0.5)
  group.add(cable([pin, pin.clone().add(new THREE.Vector3(0.2, -0.4, 0.3)), new THREE.Vector3(pin.x + 0.6, 0.05, pin.z + 0.6), new THREE.Vector3(pin.x + 1.8, 0.05, pin.z - 1), new THREE.Vector3(pin.x + 1.2, 0.05, -2.2)], 0.035))
  await nextFrame()

  /* ---------------- TOM: behind, the kit on a rug on a low drum riser */
  const RISER = 2.6
  const K = new THREE.Vector3(3.6, RISER, -7.6)
  {
    const rw = 15.5
    const rd = 10.6
    const rz = K.z - 1.3
    const topGeo = new THREE.PlaneGeometry(rw, rd)
    scaleUv(topGeo, rw / 14, rd / 14)
    const top = mesh(topGeo, new THREE.MeshStandardMaterial({ color: '#d8c0a8', map: floorMap(), roughness: 0.62 }), false, true)
    top.rotation.x = -Math.PI / 2
    top.position.set(K.x, RISER + 0.002, rz)
    group.add(top)
    const carpet = new THREE.MeshStandardMaterial({ color: '#171211', roughness: 0.95 })
    const body = mesh(new THREE.BoxGeometry(rw, RISER, rd), carpet, true, true)
    body.position.set(K.x, RISER / 2, rz)
    group.add(body)
    const edge = mesh(new THREE.BoxGeometry(rw + 0.1, 0.14, 0.24), new THREE.MeshStandardMaterial({ color: '#5a3418', roughness: 0.45 }), false, true)
    edge.position.set(K.x, RISER - 0.05, rz + rd / 2)
    group.add(edge)
  }
  const rug = buildRug(14, 9.4)
  rug.position.set(K.x, RISER + 0.03, K.z - 1.2)
  rug.rotation.z = 0.03
  group.add(rug)
  const kit = buildKit(M, mobile)
  kit.group.position.copy(K)
  kit.group.rotation.y = -0.06
  group.add(kit.group)
  // Tom's mic lives on the riser (kit-local: the riser top is y = 0 there)
  kit.group.add(boomStand(M, new THREE.Vector3(6.2, 0, -3.8), 11.8, new THREE.Vector3(1.5, 13.2, -4.4), kit.at.mouth.clone().sub(new THREE.Vector3(1.5, 13.2, -4.4)), 0.6).group)
  kit.group.updateMatrixWorld(true)
  await nextFrame()

  /* ---------------- DAVID: stage left — the bass on a stand, a cab + head, a mic */
  const cab = buildAmp(M, { w: 5.6, h: 6.4, d: 4.2, tolex: '#151312', grille: 'salt', feet: true })
  cab.group.position.set(14.2, 0, -2.6)
  cab.group.rotation.y = -0.34
  group.add(cab.group)
  const head = buildAmp(M, { w: 5.6, h: 2.2, d: 2.8, tolex: '#151312', grille: 'salt', panel: ['INPUT', 'GAIN', 'BASS', 'MID', 'TREBLE', 'MASTER', ''], panelH: 1.2, handle: true, jewel: '#ff9a3c' })
  head.group.position.set(0, 6.4, 0.6)
  cab.group.add(head.group)
  const bass = buildBass(mobile)
  const bBase = new THREE.Vector3(10.6, 0, 1.0)
  standUp(bass.group, bass.tail, bass.back, bBase, 0.18, -0.16, 0.62)
  group.add(bass.group)
  group.add(guitarStand(M, bBase.clone().setY(0.62), local(bass.group, bass.hold, 0, bass.holdZ - 0.05), -0.16))
  const dMouth = new THREE.Vector3(10.4, 16.2, -1.0)
  const dClip = new THREE.Vector3(9.8, 15.0, 0.1)
  group.add(boomStand(M, new THREE.Vector3(7.4, 0, -0.8), 12.4, dClip, dMouth.clone().sub(dClip), 0.3).group)
  {
    const jack = local(bass.group, -1.0, -1.4, -0.25)
    group.add(cable([jack, jack.clone().add(new THREE.Vector3(0.2, -0.6, 0.2)), new THREE.Vector3(jack.x + 0.4, 0.05, jack.z + 0.6), new THREE.Vector3(12.4, 0.05, 1.0), new THREE.Vector3(13.2, 0.05, -0.2), new THREE.Vector3(13.4, 7.2, -0.8)], 0.036))
  }
  await nextFrame()

  /* ---------------- the happenings corner: a road case at the front right */
  const H = new THREE.Vector3(22.4, 0, 2.2)
  const corner = new THREE.Group()
  corner.position.copy(H)
  corner.rotation.y = -0.3
  group.add(corner)
  const caseW = 7.6
  const caseH = 3.4
  const rc = roadCase(M, caseW, caseH, 3.6)
  corner.add(rc)
  const radio = buildRadio(M)
  radio.group.position.set(-1.6, caseH, 0.15)
  radio.group.rotation.y = 0.06
  corner.add(radio.group)
  radio.tune(104.5)
  radio.setGlow(0.3)
  // the ON AIR box up on a light stand behind the case's right end
  const onAir = buildOnAir(M)
  const oa = new THREE.Vector3(3.0, 0, -2.6)
  const oaY = 9.0
  {
    const g: THREE.BufferGeometry[] = []
    const hub = new THREE.Vector3(oa.x, 1.6, oa.z)
    for (let k = 0; k < 3; k++) {
      const a = 0.3 + (k * Math.PI * 2) / 3
      g.push(rod(hub, new THREE.Vector3(oa.x + Math.cos(a) * 1.7, 0.05, oa.z + Math.sin(a) * 1.7), 0.05, 6))
      g.push(rod(hub.clone().setY(1.1), new THREE.Vector3(oa.x + Math.cos(a) * 0.9, 0.95, oa.z + Math.sin(a) * 0.9), 0.03, 5))
    }
    g.push(rod(new THREE.Vector3(oa.x, 0.9, oa.z), new THREE.Vector3(oa.x, oaY * 0.55, oa.z), 0.08, 8))
    g.push(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10).translate(oa.x, oaY * 0.55, oa.z))
    g.push(rod(new THREE.Vector3(oa.x, oaY * 0.55, oa.z), new THREE.Vector3(oa.x, oaY + 0.1, oa.z), 0.06, 8))
    g.push(new THREE.BoxGeometry(1.3, 0.1, 0.5).translate(oa.x, oaY + 0.12, oa.z))
    corner.add(mesh(merge(g), M.stand))
  }
  onAir.group.position.set(oa.x, oaY + 0.14, oa.z)
  onAir.group.rotation.y = 0.05
  corner.add(onAir.group)
  onAir.setLevel(0)
  corner.add(cable([new THREE.Vector3(oa.x, oaY + 0.5, oa.z - 0.3), new THREE.Vector3(oa.x + 0.1, oaY - 0.3, oa.z - 0.2), new THREE.Vector3(oa.x + 0.12, oaY * 0.5, oa.z - 0.12), new THREE.Vector3(oa.x + 0.1, 1.2, oa.z - 0.12), new THREE.Vector3(oa.x - 0.4, 0.05, oa.z - 0.8), new THREE.Vector3(oa.x - 2, 0.05, oa.z - 4)], 0.03))
  // the clapperboard leans on the case front, right of centre
  const clapper = buildClapper(M)
  clapper.position.set(2.75, 0, 2.62)
  clapper.rotation.set(-0.24, -0.08, 0.02, 'YXZ')
  corner.add(clapper)
  corner.updateMatrixWorld(true)

  // the practical lights (always in the scene; intensity-driven)
  const onAirLight = new THREE.PointLight('#ff3a1c', 0, 10, 2)
  onAirLight.position.copy(onAir.group.localToWorld(onAir.front.clone()))
  group.add(onAirLight)
  const dialLight = new THREE.PointLight('#ffae52', 0, 8, 2)
  dialLight.position.copy(radio.group.localToWorld(radio.dialAt.clone()))
  group.add(dialLight)

  /* ---------------- festoon strands overhead */
  const festoon = buildFestoon(
    [
      { a: new THREE.Vector3(-20, 19.5, -14), b: new THREE.Vector3(6, 19, -15.5), sag: 2.4, step: 1.9 },
      { a: new THREE.Vector3(6, 19, -15.5), b: new THREE.Vector3(34, 19.5, -12), sag: 2.6, step: 1.9 },
      { a: new THREE.Vector3(-18, 24, -2), b: new THREE.Vector3(32, 24, 1), sag: 3.2, step: 2.2 },
    ],
    M,
  )
  group.add(festoon.group)

  /* ---------------- where the camera looks */
  const w = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z))
  const spots: Spot[] = [
    { at: new THREE.Vector3(8.2, 7.4, -2.0), w: 33, h: 17, ax: 0.47, ay: 0.56 },
    { at: new THREE.Vector3(-3.9, 7.0, 2.2), w: 8.8, h: 14 },
    { at: new THREE.Vector3(11.6, 6.6, -0.4), w: 9.4, h: 13 },
    { at: kit.group.localToWorld(new THREE.Vector3(0, 6.4, -1.4)), w: 13.5, h: 12.6 },
    { at: w(corner, 1.0, 7.5, -0.6), w: 7.6, h: 7.0, tall: { at: w(corner, oa.x, oaY + 0.9, oa.z), w: 4.6, h: 3.0 } },
    { at: w(corner, 2.75, 1.55, 2.4), w: 5.0, h: 4.0 },
    { at: w(corner, -1.6, caseH + 1.3, 0.2), w: 6.2, h: 4.0 },
    { at: new THREE.Vector3(9.2, 7.2, -1.6), w: 35, h: 17.5, ax: 0.47, ay: 0.54 },
  ]

  // cast/receive: big props cast; the kit guitar handles its own parts. This
  // instance's lacquer is a touch softer (a tight spot on a mirror clearcoat
  // pins a glint that blooms into a "bulb" in the wide shots)
  guitar.group.traverse(o => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.name !== 'string-runs') m.receiveShadow = true
    const mats = m.isMesh ? (Array.isArray(m.material) ? m.material : [m.material]) : []
    for (const mat of mats) {
      const p = mat as THREE.MeshPhysicalMaterial
      if (p.isMeshPhysicalMaterial && p.clearcoatRoughness < 0.12) {
        p.clearcoatRoughness = 0.14
        p.specularIntensity = 0.7
      }
    }
  })

  return {
    guitar,
    bass,
    kit,
    radio,
    onAir,
    festoon,
    ampJewels: [head.jewel],
    onAirLight,
    dialLight,
    spots,
  }
}
