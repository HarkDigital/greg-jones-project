import type { Video } from '../../content'
import { youtubeUrl } from '../../content'
import { holdScene, releaseScene } from '../../ui/prefs'

/*
 * PLAY HERE — a click-to-play facade: nothing from YouTube loads until the
 * visitor asks. A click on the card's "Play here" opens a modal dialog (in
 * <body>, outside the aria-hidden stage) with a youtube-nocookie embed that
 * autoplays. Escape, the Close button or a click on the backdrop closes it
 * (the iframe is removed: playback stops), and focus returns to the button
 * that opened it. While it's open the page doesn't scroll, the rest of the
 * page is inert, and the scene underneath stops rendering (the chrome's
 * "scene is covered" hold).
 */

let root: HTMLDivElement | null = null
let frameBox: HTMLDivElement
let titleEl: HTMLElement
let ytLink: HTMLAnchorElement
let closeBtn: HTMLButtonElement
let opener: HTMLElement | null = null
const inerted: HTMLElement[] = []

const HOLD = 'watch-player'

function build() {
  root = document.createElement('div')
  root.className = 'fr-player'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'fr-player-title')
  root.hidden = true
  root.innerHTML = `
    <div class="fr-player-backdrop" data-close></div>
    <div class="fr-player-box">
      <div class="fr-player-bar">
        <p class="fr-player-title" id="fr-player-title"></p>
        <div class="fr-player-actions">
          <a class="fr-player-yt" target="_blank" rel="noopener"></a>
          <button type="button" class="hud-btn hud-btn--ghost fr-player-close">Close <span aria-hidden="true">✕</span></button>
        </div>
      </div>
      <div class="fr-player-frame"></div>
    </div>`
  frameBox = root.querySelector('.fr-player-frame')!
  titleEl = root.querySelector('.fr-player-title')!
  ytLink = root.querySelector('.fr-player-yt')!
  closeBtn = root.querySelector('.fr-player-close')!
  root.querySelector('[data-close]')!.addEventListener('click', closePlayer)
  closeBtn.addEventListener('click', closePlayer)
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closePlayer()
    } else if (e.key === 'Tab') {
      // keep focus inside the dialog (the iframe's own content is its own document)
      const items = [ytLink, closeBtn, frameBox.querySelector('iframe')].filter(Boolean) as HTMLElement[]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  })
  document.body.appendChild(root)
}

const onDocKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isPlayerOpen()) {
    e.preventDefault()
    closePlayer()
  }
}

export function isPlayerOpen() {
  return !!root && !root.hidden
}

export function openPlayer(v: Video, from: HTMLElement | null) {
  if (!root) build()
  const r = root!
  opener = from
  titleEl.textContent = `${v.title}${v.by ? ` (${v.by})` : ''}`
  ytLink.href = youtubeUrl(v.id)
  ytLink.textContent = 'Watch on YouTube ↗'
  ytLink.setAttribute('aria-label', `Watch ${v.title} on YouTube (opens in a new tab)`)
  const f = document.createElement('iframe')
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
  f.title = `${v.title} — YouTube video player`
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
  f.allowFullscreen = true
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  frameBox.replaceChildren(f)
  r.hidden = false
  // the rest of the page is out of reach while the dialog is up
  for (const id of ['track', 'stages', 'chrome']) {
    const n = document.getElementById(id)
    if (n && !n.inert) {
      n.inert = true
      inerted.push(n)
    }
  }
  window.__hark?.engine.lenis.stop()
  holdScene(HOLD)
  document.addEventListener('keydown', onDocKey)
  requestAnimationFrame(() => r.classList.add('is-open'))
  closeBtn.focus({ preventScroll: true })
}

export function closePlayer() {
  if (!root || root.hidden) return
  root.classList.remove('is-open')
  root.hidden = true
  frameBox.replaceChildren()
  while (inerted.length) inerted.pop()!.inert = false
  window.__hark?.engine.lenis.start()
  releaseScene(HOLD)
  document.removeEventListener('keydown', onDocKey)
  const o = opener
  opener = null
  if (o && o.isConnected) o.focus({ preventScroll: true })
}
