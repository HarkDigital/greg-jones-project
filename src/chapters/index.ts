import type { ChapterDef } from '../core/types'

/**
 * The scroll story, in order. `length` is scroll distance in viewport
 * heights; `landing` is where nav jumps land (local progress, on settled
 * copy — keep it clear of the ~6% cut window at each end). Each chapter lives
 * in src/chapters/<id>/ and default-exports a factory returning a Chapter.
 *
 * GREG JONES PROJECT: a small warm room after dark, one acoustic guitar (his
 * Martin OMCPA4) at the heart of it — Tune Up (the guitar in the lamplight,
 * DADGBD), Two-Inch Tape (Listen: Volume ONE on a reel-to-reel, Like a Movie,
 * the live tape), Front Row (the videos), The Case (the story, told by what
 * he keeps in his guitar case), The Band (Greg, Dave Tracey and Tom Buckley +
 * current happenings),
 * The Rig (the gear), Last Call (contact). Lengths follow the reading-pace
 * lessons (~0.6 vh per item). The ids are shared with src/core/srContent.ts
 * (see its anchor contract) and the chrome's names.
 */
const lab = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lab')

export const CHAPTERS: ChapterDef[] = [
  { id: 'hero', label: 'Tune Up', length: 2.4, landing: 0, intro: 0, load: () => (lab ? import('./lab') : import('./hero/index')) },
  { id: 'listen', label: 'Two-Inch Tape', length: 5.6, landing: 0.07, intro: 0.07, load: () => import('./listen/index') },
  { id: 'watch', label: 'Front Row', length: 6.0, landing: 0.07, intro: 0.07, load: () => import('./watch/index') },
  { id: 'story', label: 'The Case', length: 6.0, landing: 0.07, intro: 0.07, load: () => import('./story/index') },
  { id: 'band', label: 'The Band', length: 4.8, landing: 0.08, intro: 0.08, load: () => import('./band/index') },
  { id: 'gear', label: 'The Rig', length: 6.4, landing: 0.07, intro: 0.07, load: () => import('./gear/index') },
  { id: 'contact', label: 'Last Call', length: 1.6, landing: 0.3, intro: 0.3, load: () => import('./contact/index') },
]
