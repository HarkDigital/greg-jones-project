import { el, rise } from '../../core/dom'
import { ARTIST, CONTACT, CREDIT, EPK, SOCIALS } from '../../content'

/*
 * LAST CALL's copy. One walnut panel (the site's .hud-panel) in two parts:
 *   A  eyebrow, "Best way to get in touch:", Greg Jones – the phone (tel:),
 *      the address big on a SPRUCE PLATE (a strip of the guitar's top, its
 *      rosette as the icon) and Copy email (its festoon bulb lights when the
 *      address is on the clipboard)
 *   B  tour info (Facebook), the Electronic Press Kit, the socials, Back to
 *      top, and the footer (© + the credit)
 * plus the closing sign-off — the site's last frames: EPK.closing plucked in
 * as a quote, the address, Back to top, the footer.
 *
 * Layout is MEASURED on resize / font load (never per frame):
 *   side   landscape: the panel on the left, the corner stage framed right
 *   stack  portrait: the panel along the bottom, the stage above it
 * Short screens step the panel down (lc-fit-1..3); if it still doesn't fit
 * it SPLITS into two beats (A, then B) that the chapter swaps mid-way.
 */

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Hud {
  root: HTMLElement
  probe: HTMLElement
  dock: HTMLElement
  panel: HTMLElement
  title: HTMLElement
  end: HTMLElement
  closing: HTMLElement
  copyBtn: HTMLButtonElement
  dirty: boolean
  /** performance.now() of the last successful copy (the stage answers) */
  copiedAt: number
}

export interface Layout {
  W: number
  H: number
  stack: boolean
  split: boolean
  /** the band between the chrome's safe areas */
  band: Rect
  /** the panel (split: the taller part's box) */
  panel: Rect
  /** free space for the stage while the panel is up */
  art: Rect
  /** free space in the closing frame (above the sign-off) */
  fin: Rect
}

/** Clipboard API first, then a hidden-textarea fallback. */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* denied or unsupported: fall through */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.setAttribute('aria-hidden', 'true')
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;'
  const active = document.activeElement as HTMLElement | null
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  active?.focus?.({ preventScroll: true })
  return ok
}

/** a polite live region OUTSIDE the aria-hidden stage, so a copy is announced */
function liveRegion() {
  const id = 'lc-copy-live'
  let node = document.getElementById(id)
  if (!node) {
    node = document.createElement('p')
    node.id = id
    node.className = 'sr-only'
    node.setAttribute('role', 'status')
    node.setAttribute('aria-live', 'polite')
    document.body.appendChild(node)
  }
  return node
}

const ext = (a: HTMLAnchorElement, href: string) => {
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener'
  return a
}

/** © {year} Greg Jones Project. · Concept by Hark Digital Design */
function legal(parent: HTMLElement, cls: string) {
  const p = el('p', `hud-label lc-legal ${cls}`, undefined, parent)
  el('span', 'lc-nw', `© ${new Date().getFullYear()} ${ARTIST.name}.`, p)
  p.appendChild(document.createTextNode(' '))
  const credit = el('span', 'lc-nw', undefined, p)
  el('span', 'lc-dot', '· ', credit).setAttribute('aria-hidden', 'true')
  ext(el('a', 'lc-credit', CREDIT.text, credit), CREDIT.url)
  return p
}

function backToTop(parent: HTMLElement, cls: string) {
  const b = el('button', `lc-top ${cls}`, undefined, parent)
  b.type = 'button'
  el('span', '', 'Back to top', b)
  el('span', 'lc-arr', '↑', b).setAttribute('aria-hidden', 'true')
  b.addEventListener('click', e => {
    const hark = window.__hark
    if (!hark) return
    hark.land('hero')
    // keyboard activation: take focus to the hero's heading as well
    if (e.detail === 0) hark.engine?.focusChapter?.('hero')
  })
  return b
}

/** the address on a strip of spruce, the rosette as its icon */
function plate(parent: HTMLElement, cls = '') {
  const a = el('a', `lc-plate ${cls}`, undefined, parent)
  a.href = CONTACT.href
  const ro = el('span', 'lc-rosette', undefined, a)
  ro.setAttribute('aria-hidden', 'true')
  el('span', 'lc-addr', ARTIST.email, a)
  el('span', 'lc-go', '→', a).setAttribute('aria-hidden', 'true')
  return a
}

export function buildHud(stage: HTMLElement): Hud {
  const root = el('div', 'lc-root', undefined, stage)
  const probe = el('div', 'lc-probe', undefined, root)
  const dock = el('div', 'lc-dock', undefined, root)
  const panel = el('div', 'hud-panel lc-panel', undefined, dock)

  /* ---- A: the headline, the phone, the address */
  const partA = el('div', 'lc-part lc-a', undefined, panel)
  el('p', 'hud-eyebrow lc-eyebrow', CONTACT.eyebrow, partA)
  const title = rise(el('h2', 'hud-h2 lc-title', undefined, partA), 'Best way to get <em>in touch:</em>')
  const phone = el('p', 'lc-phone', undefined, partA)
  el('span', 'lc-name', CONTACT.name, phone)
  el('span', 'lc-dash', ' – ', phone)
  const tel = el('a', 'lc-tel', ARTIST.phone, phone)
  tel.href = ARTIST.phoneHref
  const cta = el('div', 'lc-cta', undefined, partA)
  plate(cta)
  const copyBtn = el('button', 'hud-btn hud-btn--ghost lc-copy', undefined, cta)
  copyBtn.type = 'button'
  copyBtn.setAttribute('aria-label', `Copy email address ${ARTIST.email}`)
  el('i', 'lc-bulb', undefined, copyBtn).setAttribute('aria-hidden', 'true')
  const copyLabel = el('span', 'lc-copy-t', 'Copy email', copyBtn)

  /* ---- B: tour info, the EPK, the socials, back to top, the footer */
  const partB = el('div', 'lc-part lc-b', undefined, panel)
  const links = el('ul', 'lc-links', undefined, partB)
  for (const [label, url] of [
    [CONTACT.tour, CONTACT.tourUrl],
    [CONTACT.epkLabel, ARTIST.epk],
  ]) {
    const li = el('li', '', undefined, links)
    const a = ext(el('a', 'lc-link', undefined, li), url)
    el('span', 'lc-link-t', label, a)
    el('span', 'lc-ext', '↗', a).setAttribute('aria-hidden', 'true')
  }
  const socials = el('ul', 'hud-tags lc-socials', undefined, partB)
  socials.setAttribute('aria-label', 'Greg Jones Project online')
  for (const s of SOCIALS) {
    const li = el('li', '', undefined, socials)
    ext(el('a', 'hud-tag lc-social', s.name, li), s.url)
  }
  const foot = el('div', 'lc-foot', undefined, partB)
  backToTop(foot, '')
  legal(foot, '')

  /* ---- the sign-off (the site's last frames) */
  const end = el('div', 'lc-end', undefined, root)
  el('p', 'hud-eyebrow lc-end-k', 'Last call', end)
  const closing = rise(el('p', 'hud-quote lc-closing', undefined, end), EPK.closing)
  const endRow = el('div', 'lc-end-row', undefined, end)
  plate(endRow, 'lc-plate--end')
  backToTop(endRow, 'hud-btn hud-btn--ghost lc-top--end')
  legal(end, 'lc-legal--end')

  const hud: Hud = { root, probe, dock, panel, title, end, closing, copyBtn, dirty: true, copiedAt: -1e9 }

  const live = liveRegion()
  let resetT = 0
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(ARTIST.email)
    window.clearTimeout(resetT)
    copyLabel.textContent = ok ? 'Copied' : 'Copy failed'
    copyBtn.classList.toggle('is-copied', ok)
    copyBtn.classList.toggle('is-failed', !ok)
    if (ok) hud.copiedAt = performance.now()
    live.textContent = ok ? `Copied ${ARTIST.email} to the clipboard.` : `Copy failed. The address is ${ARTIST.email}.`
    window.__hark?.engine?.wake?.()
    resetT = window.setTimeout(() => {
      copyLabel.textContent = 'Copy email'
      copyBtn.classList.remove('is-copied', 'is-failed')
      live.textContent = ''
    }, 2400)
  })

  const dirty = () => (hud.dirty = true)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(dirty).observe(probe)
  window.addEventListener('resize', dirty)
  document.fonts?.ready.then(dirty).catch(() => {})
  return hud
}

const FIT = ['lc-fit-1', 'lc-fit-2', 'lc-fit-3'] as const

/** bottom of the chrome's brand lockup (CSS px), or -1 */
function brandBottom() {
  const b = document.querySelector<HTMLElement>('#chrome .ch-brand')
  if (!b) return -1
  const r = b.getBoundingClientRect()
  return r.height > 0 ? r.bottom : -1
}

const rectOf = (r: DOMRect): Rect => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom })

/** Measure the panel and the free areas around it (resize-time only). */
export function measureHud(hud: Hud, W: number, H: number): Layout {
  const { root, panel } = hud
  const stack = H > W * 1.05
  root.classList.toggle('is-stack', stack)
  root.classList.remove('is-split', 'show-b', ...FIT)
  const band = rectOf(hud.probe.getBoundingClientRect())
  const bandH = Math.max(1, band.y1 - band.y0)
  // portrait: the panel may take the lower ~60% of the band; the stage lives above
  const limit = stack ? bandH * (H < 700 ? 0.7 : 0.62) : bandH
  let split = false
  // offsetHeight ignores the reveal transform (stable mid-reveal)
  const tallest = () => {
    if (!split) return panel.offsetHeight
    root.classList.remove('show-b')
    const a = panel.offsetHeight
    root.classList.add('show-b')
    const b = panel.offsetHeight
    root.classList.remove('show-b')
    return Math.max(a, b)
  }
  const fit = () => {
    for (let i = 0; i < FIT.length && tallest() > limit; i++) root.classList.add(FIT[i])
  }
  fit()
  if (panel.offsetHeight > limit) {
    split = true
    root.classList.remove(...FIT)
    root.classList.add('is-split')
    fit()
  }
  // the footers: drop the "·" when the credit wraps onto its own line
  if (split) root.classList.add('show-b')
  root.querySelectorAll<HTMLElement>('.lc-legal').forEach(p => {
    p.classList.remove('is-wrap')
    const [a, b] = Array.from(p.children) as HTMLElement[]
    if (a && b) p.classList.toggle('is-wrap', b.offsetTop > a.offsetTop + 2)
  })
  if (split) root.classList.remove('show-b')
  const ph = tallest()
  const dock = hud.dock.getBoundingClientRect()
  const px0 = dock.left + panel.offsetLeft
  const pw = panel.offsetWidth
  // the panel is centred (side) or bottom-aligned (stack) in the dock
  const py1 = stack ? dock.bottom : dock.top + (dock.height + ph) / 2
  const pan: Rect = { x0: px0, y0: py1 - ph, x1: px0 + pw, y1: py1 }

  let art: Rect
  if (!stack) {
    const gap = Math.max(20, W * 0.03)
    art = { x0: pan.x1 + gap, x1: band.x1, y0: band.y0, y1: band.y1 }
  } else {
    const gap = Math.max(12, H * 0.02)
    // phones: the stage may rise into the top band, to just under the brand
    const bb = brandBottom()
    const top = W < 600 ? Math.max(bb > 0 ? bb + 10 : band.y0 * 0.8, 44) : band.y0
    art = { x0: band.x0, x1: band.x1, y0: top, y1: Math.max(top + 90, pan.y0 - gap) }
  }
  // the closing frame: landscape — the corner beside the sign-off's column;
  // portrait — the corner over the sign-off
  const e = hud.end
  let fin: Rect
  if (!stack) {
    const gap = Math.max(20, W * 0.03)
    fin = { x0: Math.min(W * 0.62, e.offsetLeft + e.offsetWidth + gap), x1: band.x1, y0: band.y0, y1: band.y1 }
  } else {
    const endTop = e.offsetTop || band.y1 - 140
    fin = {
      x0: band.x0,
      x1: band.x1,
      y0: W < 600 ? art.y0 : band.y0,
      y1: Math.max(band.y0 + 90, endTop - Math.max(12, H * 0.02)),
    }
  }
  root.classList.toggle('is-split', split)
  hud.dirty = false
  return { W, H, stack, split, band, panel: pan, art, fin }
}
