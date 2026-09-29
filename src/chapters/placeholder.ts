import * as THREE from 'three'
import type { Chapter } from '../core/types'
import { el, rise, setRise, reveal } from '../core/dom'
import { smoothstep } from '../core/math'
import { buildGuitar } from '../kit/guitar'
import { stageFloor } from '../kit/stage'

/*
 * A PLACEHOLDER chapter (the scaffold runs end to end before the chapter
 * agents build the real scenes): the guitar in the lamp's pool + the
 * section's headline. Replace it entirely.
 */
export function placeholder(id: string, eyebrow: string, titleHtml: string): () => Chapter {
  return () => {
    const group = new THREE.Group()
    let g: ReturnType<typeof buildGuitar>
    let head: HTMLElement
    let title: HTMLElement
    return {
      id,
      group,
      anchors: [0.3],
      init(ctx) {
        g = buildGuitar({ mobile: ctx.mobile })
        g.group.rotation.set(-Math.PI / 2, 0, 0.5)
        g.group.position.set(0, 0.55, 0)
        group.add(g.group, stageFloor(60, 40))
        head = el('div', 'ph-copy', undefined, ctx.stage)
        head.style.cssText = 'position:absolute;left:var(--gutter);top:calc(var(--safe-top) + 4vh);max-width:min(560px,80vw)'
        el('p', 'hud-eyebrow', eyebrow, head)
        title = rise(el('h2', 'hud-h2', undefined, head), titleHtml)
      },
      update(local, frame, ctx) {
        const w = ctx.world.params
        w.spot = 1
        w.spotPos.set(3, 16, 9)
        w.spotAt.set(0, 0.5, 0)
        w.spotAngle = 0.26
        w.rimA = 0.6
        reveal(head, smoothstep(0.05, 0.1, local) * (1 - smoothstep(0.9, 0.95, local)))
        setRise(title, local > 0.06 && local < 0.94)
        g.update(frame, ctx.camera, ctx.renderer)
      },
      camera(local, _frame, out) {
        out.position.set(1.5 + local * 2, 7, 6)
        out.target.set(0.5, 0.5, 0)
        out.fov = 38
        out.parallax = 0.2
      },
    }
  }
}
