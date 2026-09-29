import { ALBUMS, ARTIST, BIO, CONTACT, CREDIT, EPK, GEAR, INFLUENCES, LIVE, SECTIONS, SOCIALS, STORY, VIDEOS, youtubeUrl } from '../content'

/*
 * The accessible layer. Each chapter's copy, as plain linear semantic HTML,
 * lives inside that chapter's scroll <section> in #track. It is visually
 * hidden (the canvas + stages are the visual layer and are aria-hidden), but
 * screen readers, crawlers and keyboard users get the whole story in order.
 * Focusing a link here moves the visuals to its chapter (Engine.land), and
 * the focused link itself becomes visible (.sr-copy :focus-visible in base.css).
 *
 * Item stops carry data-anchor="i" → chapter.anchors[i]. The ORDER of the
 * anchors per chapter is the contract with each chapter module:
 *   listen   0–5 Volume ONE tracks · 6 Like a Movie · 7 the live recordings
 *   watch    0–8 VIDEOS in order
 *   story    0–8 STORY beats in order
 *   gear     0 the guitar · 1 the tuning · 2–7 GEAR.items · 8 the PA · 9 effects
 *
 * renderFallback() reuses the same builders, visibly, when WebGL2 is missing.
 */

const esc = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const ext = (href: string, label: string, anchor?: number) =>
  `<a href="${esc(href)}" target="_blank" rel="noopener"${anchor != null ? ` data-anchor="${anchor}"` : ''}>${esc(label)}<span class="sr-note"> (opens in a new tab)</span></a>`

/** An in-page stop that moves the story to item i of a chapter (see Chapter.anchors). */
const stop = (id: string, i: number, label: string) => `<a href="#${id}" data-anchor="${i}">${esc(label)}</a>`

const [VOL1, MOVIE] = ALBUMS

const COPY: Record<string, () => string> = {
  hero: () => `
    <p class="sr-kicker">${esc(ARTIST.banner)}</p>
    <h1 tabindex="0">${esc(ARTIST.name)}</h1>
    <p>${esc(ARTIST.tagline)}</p>
    <p>${esc(ARTIST.lead)}</p>
    <p><a href="#listen" data-land="listen" data-anchor="0">Listen</a> · <a href="#contact" data-land="contact" data-anchor="0">Get in touch</a></p>`,

  listen: () => `
    <p>${esc(SECTIONS.listen.eyebrow)}</p>
    <h2 tabindex="0">${esc(SECTIONS.listen.title)}</h2>
    <h3>${esc(VOL1.title)} · ${esc(VOL1.kind)} · ${VOL1.year}</h3>
    <ol>${VOL1.tracks.map((t, i) => `<li>${stop('listen', i, `${t.title} (${t.time})`)}</li>`).join('')}</ol>
    ${VOL1.notes.map(n => `<p>${esc(n)}</p>`).join('')}
    <p>${VOL1.links.map(l => ext(l.url, `${VOL1.title} on ${l.name}`)).join(' · ')}</p>
    <h3>${stop('listen', 6, `${MOVIE.title} · ${MOVIE.year}`)}</h3>
    <p>${esc(MOVIE.notes[0])}</p>
    <ol>${MOVIE.tracks.map(t => `<li>${esc(t.title)} (${esc(t.time)})</li>`).join('')}</ol>
    <p>${MOVIE.links.map(l => ext(l.url, `${MOVIE.title} on ${l.name}`)).join(' · ')}</p>
    <h3>${stop('listen', 7, LIVE.title)}</h3>
    <ul>${LIVE.tracks.map(t => `<li>${ext(t.url, t.title)}</li>`).join('')}</ul>`,

  watch: () => `
    <p>${esc(SECTIONS.watch.eyebrow)}</p>
    <h2 tabindex="0">${esc(SECTIONS.watch.title)}</h2>
    <ul>${VIDEOS.map(
      (v, i) =>
        `<li>${ext(youtubeUrl(v.id), `${v.title}${v.by ? ` (${v.by})` : ''} · ${v.kind} · watch on YouTube`, i)}${v.note ? `<p>${esc(v.note)}</p>` : ''}</li>`,
    ).join('')}</ul>
    <p>${ext(SOCIALS.find(s => s.name === 'YouTube')!.url, 'YouTube channel')}</p>`,

  story: () => `
    <p>${esc(SECTIONS.story.eyebrow)}</p>
    <h2 tabindex="0">${esc(ARTIST.tagline)}</h2>
    <ol>${STORY.map((b, i) => `<li><h3>${stop('story', i, `${b.when} · ${b.where}`)}</h3><p>${esc(b.text)}</p></li>`).join('')}</ol>
    <p>Influences: ${INFLUENCES.map(esc).join(', ')}.</p>
    ${BIO.slice(1).map(p => `<p>${esc(p)}</p>`).join('')}`,

  gear: () => `
    <p>${esc(SECTIONS.gear.eyebrow)}</p>
    <h2 tabindex="0">${esc(GEAR.intro)}</h2>
    <h3>${stop('gear', 0, GEAR.guitar.name)}</h3>
    <ul>${GEAR.guitar.specs.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <p>${stop('gear', 1, GEAR.guitar.tuning)}</p>
    <ul>${GEAR.items.map((g, i) => `<li><h3>${stop('gear', 2 + i, g.name)}</h3><p>${esc(g.text)}${g.detail ? ` · ${esc(g.detail)}` : ''}</p></li>`).join('')}</ul>
    <h3>${stop('gear', 8, GEAR.pa.name)}</h3>
    <p>${esc(GEAR.pa.title)}</p>
    <ul>${GEAR.pa.specs.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <h3>${stop('gear', 9, 'Effects')}</h3>
    <ul>${GEAR.effects.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`,

  contact: () => `
    <p>${esc(CONTACT.eyebrow)}</p>
    <h2 tabindex="0">${esc(CONTACT.title)}</h2>
    <p>${esc(CONTACT.name)} – <a href="${esc(ARTIST.phoneHref)}">${esc(ARTIST.phone)}</a></p>
    <p><a href="${esc(CONTACT.href)}">${esc(ARTIST.email)}</a> <button type="button" data-copy-email>Copy email address</button> <span data-copy-status aria-live="polite"></span></p>
    <p>${ext(CONTACT.tourUrl, CONTACT.tour)}</p>
    <p>${ext(ARTIST.epk, CONTACT.epkLabel)}</p>
    <p>${SOCIALS.map(s => ext(s.url, s.name)).join(' · ')}</p>
    <p>${esc(EPK.closing)}</p>
    <p>© ${new Date().getFullYear()} ${esc(ARTIST.name)}. · ${ext(CREDIT.url, CREDIT.text)}</p>
    <p><a href="#hero" data-land="hero">Back to top</a></p>`,
}

/** Visually hidden, linear copy for one chapter (null for unknown ids). */
export function buildChapterCopy(id: string, visible = false): HTMLElement | null {
  const html = COPY[id]
  if (!html) return null
  const div = document.createElement('div')
  div.className = visible ? 'fallback-copy' : 'sr-copy'
  div.innerHTML = html()
  // in-page links drive the story instead of jumping to an empty section
  div.querySelectorAll<HTMLAnchorElement>('a[data-land]').forEach(a =>
    a.addEventListener('click', e => {
      const target = a.dataset.land!
      const hark = window.__hark
      if (!hark) return
      e.preventDefault()
      if (target === 'hero') hark.land('hero')
      else hark.land(target)
      hark.engine.focusChapter(target)
    }),
  )
  // item stops only steer the story (focus does the work); never follow the hash
  div.querySelectorAll<HTMLAnchorElement>('a[data-anchor][href^="#"]:not([data-land])').forEach(a =>
    a.addEventListener('click', e => {
      e.preventDefault()
      const section = a.closest('section')
      const hark = window.__hark
      if (!section || !hark) return
      const slot = hark.engine.slots.find(s => s.def.id === section.id)
      const at = slot?.chapter.anchors?.[Number(a.dataset.anchor)]
      if (at != null) hark.land(section.id, true, at)
    }),
  )
  div.querySelectorAll<HTMLButtonElement>('[data-copy-email]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const status = div.querySelector<HTMLElement>('[data-copy-status]')
      let ok = false
      try {
        await navigator.clipboard.writeText(ARTIST.email)
        ok = true
      } catch {
        const ta = document.createElement('textarea')
        ta.value = ARTIST.email
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        try {
          ok = document.execCommand('copy')
        } catch {
          ok = false
        }
        ta.remove()
      }
      if (status) {
        status.textContent = ok ? 'Copied' : `Copy failed — the address is ${ARTIST.email}`
        window.setTimeout(() => (status.textContent = ''), 2200)
      }
    }),
  )
  return div
}

export const CHAPTER_COPY_IDS = Object.keys(COPY)
