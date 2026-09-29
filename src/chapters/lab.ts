import * as THREE from 'three'
import type { Chapter } from '../core/types'
import { buildGuitar, SOUNDHOLE } from '../kit/guitar'
import { stageFloor } from '../kit/stage'
import { GEL } from '../world/World'

/* LOOK LAB — foundation check only (?lab&view=stand|top|macro|head|hole). */
export default function create(): Chapter {
  const group = new THREE.Group()
  let g: ReturnType<typeof buildGuitar>
  const q = new URLSearchParams(location.search)
  const view = q.get('view') ?? 'stand'
  const at = new THREE.Vector3()
  return {
    id: 'hero',
    group,
    init(ctx) {
      g = buildGuitar({ mobile: ctx.mobile })
      group.add(g.group)
      if (view === 'stand' || view === 'head') {
        g.group.rotation.set(-0.12, 0.2, Math.PI / 2 + 0.04)
        g.group.position.set(0.3, 2.3, 0)
      } else {
        g.group.rotation.set(-Math.PI / 2, 0, 0.35)
        g.group.position.set(0, 1.1, 0)
      }
      g.group.updateMatrixWorld(true)
      group.add(stageFloor(80, 60))
    },
    update(local, frame, ctx) {
      const w = ctx.world.params
      w.spot = 1
      w.spotPos.set(3, 16, 10)
      w.spotAt.set(0.3, view === 'stand' || view === 'head' ? 3.6 : 1, 0)
      w.spotAngle = 0.24
      w.rimA = 0.8
      w.rimB = 0.5
      w.bulbs = 0.9
      for (let i = 0; i < 6; i++) g.strings.amp[i] = local > 0.5 ? 0.01 * (1 - i * 0.1) : 0
      g.strings.lightDir.set(0.3, 1, 0.8)
      g.update(frame, ctx.camera, ctx.renderer)
    },
    camera(_local, frame, out) {
      const portrait = frame.height > frame.width
      if (view === 'stand') {
        out.position.set(portrait ? 0.5 : 2.6, 4.2, portrait ? 17 : 12.5)
        out.target.set(portrait ? 0.2 : -0.4, 3.9, 0)
        out.fov = 36
      } else if (view === 'head') {
        at.copy(g.logoAt)
        g.group.localToWorld(at)
        out.position.set(at.x + 0.6, at.y - 0.6, at.z + 3.4)
        out.target.copy(at)
        out.fov = 30
      } else if (view === 'hole') {
        at.set(SOUNDHOLE.x, SOUNDHOLE.y, 0)
        g.group.localToWorld(at)
        out.position.set(at.x + 1.2, at.y + 2.6, at.z + 1.6)
        out.target.copy(at)
        out.fov = 34
      } else if (view === 'macro') {
        out.position.set(3.4, 1.9, 1.6)
        out.target.set(1.2, 1.1, -0.4)
        out.fov = 30
      } else {
        out.position.set(0.5, 7.5, 6.5)
        out.target.set(0, 1, 0)
        out.fov = 40
      }
      out.parallax = 0
      void GEL
    },
  }
}
