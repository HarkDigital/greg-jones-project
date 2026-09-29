// All copy for the Greg Jones Project site, VERBATIM from gregjonesproject.com
// (home, Bio, Listen, Videos, Gear, Contact, Electronic Press Kit, News) plus
// track listings from the band's Bandcamp and Apple Music pages. Don't invent
// facts: every date, name, spec and quote below is sourced.

/** This site. */
export const SITE = {
  name: 'Greg Jones Project',
  slug: 'greg-jones-project',
}

export const ARTIST = {
  name: 'Greg Jones Project',
  short: 'GJP',
  person: 'Greg Jones',
  /** EPK headline */
  tagline: 'Bubbling up through the cracks for 2 decades…finally reaching the surface.',
  /** the Bio / EPK lead sentence */
  lead: 'Between his husky voice, precise guitar playing and down-to-earth presence, Greg Jones generates a connective musical experience that hangs in the balance of an intimate improv jazz session, a groove-filled jam show and a chill coffee shop concert.',
  /** the home page's banner */
  banner: 'GJP: Volume ONE out NOW!!!!',
  email: 'greg@gregjonesproject.com',
  phone: '609-458-6633',
  phoneHref: 'tel:+16094586633',
  website: 'https://gregjonesproject.com/',
  epk: 'https://gregjonesproject.com/electronic-press-kit/',
  /** EPK: the kind of music (their words) */
  genre: 'genuinely authentic, rootsy acoustic music which crosses many genre lines for mass appeal from young to old',
}

/** Social / streaming links (site header + EPK). */
export const SOCIALS = [
  { name: 'Facebook', url: 'https://www.facebook.com/gregjonesproject', note: 'Go to Facebook for tour info!' },
  { name: 'Instagram', url: 'https://www.instagram.com/jonesathon/' },
  { name: 'YouTube', url: 'https://www.youtube.com/emjayscafe' },
  { name: 'Spotify', url: 'https://open.spotify.com/artist/5nTvlczpLcOMWr9WOXeyKN' },
  { name: 'Bandcamp', url: 'https://gregjonesproject1.bandcamp.com/' },
  { name: 'SoundCloud', url: 'https://soundcloud.com/gregjonesproject' },
  { name: 'Twitter', url: 'https://twitter.com/jonesathon' },
]

export interface Track {
  n: number
  title: string
  /** m:ss */
  time: string
}

export interface Album {
  id: string
  title: string
  /** e.g. 'EP', 'Album' */
  kind: string
  year: number
  artist: string
  tracks: Track[]
  notes: string[]
  links: { name: string; url: string }[]
}

export const ALBUMS: Album[] = [
  {
    id: 'volume-one',
    title: 'Volume ONE',
    kind: 'EP',
    year: 2016,
    artist: 'Greg Jones Project',
    tracks: [
      { n: 1, title: 'Roll Me Over', time: '5:57' },
      { n: 2, title: 'Frequency', time: '4:21' },
      { n: 3, title: 'Katie’s Waltz', time: '5:32' },
      { n: 4, title: 'House Not Home', time: '3:30' },
      { n: 5, title: 'Serve the Song', time: '3:25' },
      { n: 6, title: 'Overloaded', time: '4:09' },
    ],
    // News, Aug 10 2016: "GREG JONES PROJECT: VOLUME ONE. On Sale NOW!!!"
    notes: [
      '6 tracks recorded Summer 2016 at The Audio Lab in Millville NJ.',
      'We recorded with all vintage gear on to 2 inch tape. Mixed and Mastered by Tony Mascara.',
      'Available on iTunes, Amazon and other fine online distributors!',
      'Physical CD’s are available at live shows only!',
    ],
    links: [
      { name: 'Apple Music', url: 'https://music.apple.com/us/album/vol-one/1142381392' },
      { name: 'Bandcamp', url: 'https://gregjonesproject1.bandcamp.com/album/volume-one' },
      { name: 'Amazon', url: 'https://www.amazon.com/Vol-One-Greg-Jones-Project/dp/B01K52TKD0/' },
      { name: 'Spotify', url: 'https://open.spotify.com/artist/5nTvlczpLcOMWr9WOXeyKN' },
    ],
  },
  {
    id: 'like-a-movie',
    title: 'Like a Movie',
    kind: 'Album',
    year: 1999,
    artist: 'Greg Jones',
    tracks: [
      { n: 1, title: 'Sisyphootin', time: '2:39' },
      { n: 2, title: 'Emanuel', time: '5:09' },
      { n: 3, title: '2:45Am', time: '3:47' },
      { n: 4, title: 'Today', time: '3:39' },
      { n: 5, title: 'Verses', time: '2:50' },
      { n: 6, title: 'Clean', time: '4:45' },
      { n: 7, title: 'Intro', time: '0:46' },
      { n: 8, title: 'Planes', time: '4:36' },
      { n: 9, title: 'Daddy', time: '3:57' },
      { n: 10, title: 'Gone2Far', time: '4:46' },
      { n: 11, title: 'Down', time: '3:28' },
    ],
    // Bio: "Since the release of his debut album Like a Movie in 1999…"
    notes: ['His debut album.'],
    links: [{ name: 'Apple Music', url: 'https://music.apple.com/us/album/like-a-movie/494911146' }],
  },
]

/** News, Dec 22 2014: "Audience Recording from World Cafe Live Philadelphia, PA. 12/14/14" */
export const LIVE = {
  title: 'Audience Recording from World Cafe Live Philadelphia, PA. 12/14/14',
  tracks: [
    { title: '2:45am- Live Version from WCL 12/14/14', url: 'https://gregjonesproject.com/wp-content/uploads/2014/12/245am-WCL121414.mp3' },
    { title: 'Serve the Song- Live Version from WCL 12/14/14', url: 'https://gregjonesproject.com/wp-content/uploads/2014/12/Serve-the-Song-WCL121414.mp3' },
    { title: 'House Not Home- Live Version from WCL 12/14/14', url: 'https://gregjonesproject.com/wp-content/uploads/2014/12/House-Not-Home-WCL121414.mp3' },
  ],
}

export interface Video {
  /** YouTube id */
  id: string
  /** the title as it appears on gregjonesproject.com/videos (or the EPK) */
  title: string
  kind: 'Music video' | 'Original' | 'Cover' | 'Live' | 'Audio'
  /** the covered artist, for covers */
  by?: string
  /** a short verbatim note from the site, where there is one */
  note?: string
}

export const VIDEOS: Video[] = [
  {
    id: '_e4oS0EJfhA',
    title: 'House Not Home',
    kind: 'Music video',
    note: 'This song was inspired by the very relate-able topic of home ownership and the struggle many face dealing with financial challenges due to being victims of the housing crash in the early 2000’s.',
  },
  {
    id: 'nL8fATBQg_4',
    title: 'GJP live at Radio104.5fm Philadelphia',
    kind: 'Live',
    note: 'Hand selected by iheartradio for an in-studio, live on air performance at Philadelphia’s Radio104.5 fm (WRFF) of their song “House Not Home”.',
  },
  { id: 'YHC4bsyPixo', title: 'Pie in the Sky', kind: 'Original' },
  { id: 'dIBe2yQlauk', title: 'Serve the Song', kind: 'Original' },
  { id: 'mva26agJ1QU', title: 'Katie’s Waltz', kind: 'Original' },
  { id: 'Ers1NlFL6Uo', title: 'Overloaded', kind: 'Original' },
  { id: 'WmyuKFpG_7g', title: 'Roll Me Over', kind: 'Audio' },
  { id: 'cNzZ1qJOi-Y', title: 'Look at Miss Ohio', kind: 'Cover', by: 'Gillian Welch' },
  { id: 'sAHq9QbOxc4', title: 'To Love Somebody', kind: 'Cover', by: 'The Bee Gees' },
]
export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

/** The Bio page, verbatim, paragraph by paragraph. */
export const BIO = [
  'Between his husky voice, precise guitar playing and down-to-earth presence, Greg Jones generates a connective musical experience that hangs in the balance of an intimate improv jazz session, a groove-filled jam show and a chill coffee shop concert.',
  'The singer songwriter originally from Levittown, NY, on Long Island then transplanted to Massapequa at the age of 9 started with formal piano training until age 14 and taught himself how to play guitar by watching hair metal videos on MTV. But Jones’ musical journey distinctly began one Saturday morning in 1977 during a PBS channel plea for public funding, when a clip of Otis Redding and his Blue Suit flashed across the screen as a voiceover introducing the evening program selection as 1967’s Monterey Pop Festival. Everything else vanished, time stood still, and Jones knew: “That’s what I want to do for my job!”',
  'Influenced by artists including Stephen Stills, Jerry Garcia and Ray LaMontagne, Jones has been writing, performing and working his way up through the musical cracks of notoriety for over two decades. Whether performing in front of five people at a local tavern (waitstaff included) in Southern New Jersey, on stage at WXPN’s World Cafe Live in Philadelphia, PA and Wilmington, DE or at festivals in front of thousands, Jones’ intention never varies. He plays just as hard and sweats just as much, infusing every person present with a sonic dose of emotional energy to make the hair stand up on the backs of their necks.',
  'Jones has developed a loyal following in South Jersey, where he moved with his wife Dena in 2001 to be closer to her family and start their own. He has since been focused on being an awesome dad to his two daughters So(Phee)a and Margot and played shows only once or twice a year to satiate the craving to perform live music. As the girls have naturally grown less dependent on him, Jones itch to play has surged to the surface. With a wide network already established from working in real estate, the supremely social musician has solidified a serious schedule of shows nearly every night at locales throughout the tri-state area whether it be solo or with his full backing band behind him consisting of Local hero’s Dave Tracey on the Bass and Tom Buckley on the Drums (both offering killer harmony vocals!).',
  'Since the release of his debut album Like a Movie in 1999, Jones has written dozens of songs that he has been longing to record. Fast forward to NOW,  Greg Jones completed his first Official Studio Release. It’s available for you to enjoy!',
]

/**
 * The story in beats, for the Story chapter. Every `text` is a verbatim
 * excerpt (Bio / News); `when` and `where` are facts stated in those texts.
 */
export const STORY = [
  { when: 'Age 9', where: 'Levittown → Massapequa, NY', text: 'The singer songwriter originally from Levittown, NY, on Long Island then transplanted to Massapequa at the age of 9' },
  { when: 'Until 14', where: 'Piano', text: 'started with formal piano training until age 14' },
  { when: 'MTV', where: 'Guitar', text: 'taught himself how to play guitar by watching hair metal videos on MTV.' },
  {
    when: '1977',
    where: 'A Saturday morning, PBS',
    text: 'a clip of Otis Redding and his Blue Suit flashed across the screen as a voiceover introducing the evening program selection as 1967’s Monterey Pop Festival. Everything else vanished, time stood still, and Jones knew: “That’s what I want to do for my job!”',
  },
  { when: '1999', where: 'Like a Movie', text: 'Since the release of his debut album Like a Movie in 1999, Jones has written dozens of songs that he has been longing to record.' },
  { when: '2001', where: 'South Jersey', text: 'Jones has developed a loyal following in South Jersey, where he moved with his wife Dena in 2001 to be closer to her family and start their own.' },
  { when: 'Summer 2014', where: '88 shows', text: 'The summer of 2014 was a blur!  88 shows in 100 days…..made so many friends, great conversations, learned a lot…loving life.' },
  { when: '12/14/14', where: 'World Cafe Live, Philadelphia', text: 'Greg Jones Project- 12/14 8:00pm World Cafe Live Philadelphia' },
  { when: '2016', where: 'Volume ONE', text: '6 tracks recorded Summer 2016 at The Audio Lab in Millville NJ. We recorded with all vintage gear on to 2 inch tape.' },
]

/** The Bio's influences (verbatim names). */
export const INFLUENCES = ['Stephen Stills', 'Jerry Garcia', 'Ray LaMontagne']

/**
 * The band. (Tj Fry, named on the old site and EPK, is no longer affiliated
 * with GJP: he is left out everywhere, including his site.)
 */
export const BAND = [
  { name: 'Greg Jones', role: 'Lead', instruments: 'Vocals, Acoustic Guitar', gear: 'acoustic' },
  { name: 'David Tracey', role: 'Bass Guitar and Vocals', instruments: 'Bass Guitar and Vocals', gear: 'bass' },
  { name: 'Tom Buckley', role: 'Drums and Vocals', instruments: 'Drums and Vocals', gear: 'drums' },
]

/** EPK copy, verbatim. */
export const EPK = {
  headline: 'Bubbling up through the cracks for 2 decades…finally reaching the surface.',
  // the EPK paragraph minus the sentence that named the old lineup (Tj Fry is no longer affiliated)
  band: 'Adding the right players to elevate Greg’s songs above and beyond the traditional Singer/Songwriter format was crucial.  GJP have amassed a dedicated following, who eagerly anticipated the release of their first official studio release in late 2016 entitled simply “Volume ONE” which is currently receiving both fan and critical acclaim.',
  happeningsTitle: 'CURRENT HAPPENINGS',
  happeningsLead: 'Greg Jones Project has been gaining some much deserved notoriety as of late and it’s easy to see why!',
  happenings: [
    {
      title: 'Live on air · Radio104.5 fm (WRFF)',
      text: 'One opportunity was being hand selected by iheartradio for an in-studio, live on air performance at Philadelphia’s Radio104.5 fm (WRFF) of their song “House Not Home”  to an “at capacity, stacked and packed house” audience of devoted fans who piled in for the show!',
      video: 'nL8fATBQg_4',
    },
    {
      title: 'The “House Not Home” video',
      text: 'GJP released a video for their Single “House Not Home“.  This song was inspired by the very relate-able topic of home ownership and the struggle many face dealing with financial challenges due to being victims of the housing crash in the early 2000’s.',
      video: '_e4oS0EJfhA',
    },
    {
      title: '93.7fm WSTW Home Town Heroes',
      text: 'GJP‘s EP “Volume ONE” has been nominated for Delaware’s 93.7fm WSTW 2016’s Home Town Heroes for a few awards  ( “EP OF THE YEAR” as well as the song “ROLL ME OVER” for “Best Roots/Americana Song“)',
      video: 'WmyuKFpG_7g',
    },
  ],
  closing: 'And the fire continues to spread…the story still unfolds, and the songs continue to come.',
}

/** The Gear page, verbatim. */
export const GEAR = {
  intro: 'I use the following gear (almost exclusively) on solo shows:',
  guitar: {
    name: 'The Martin OMCPA4',
    specs: [
      '000 Body Size',
      'Single Cutaway',
      'Solid Sitka Spruce Top',
      'Fishman F1 Analog Electronics',
      'Solid Sapele Back and Sides',
      'Black Richlite Fretboard',
      '20 Frets',
      '25.4” Scale Length',
      '16” Radius',
      '1.75” Neck Width at Nut',
      'Dovetail Neck Joint',
      'Black Richlite Bridge',
      '16” Radius Compensated White Tusq Saddle',
      'White Corian Nut',
      'Closed Chrome Tuners with Large Buttons',
      'Tortoiseshell Pickguard',
      'Black Boltaron Bindings',
    ],
    tuning: 'TUNING is always in  DADGBD',
    /** low string first */
    notes: ['D', 'A', 'D', 'G', 'B', 'D'],
  },
  items: [
    { name: 'Picks', text: 'Dunlop tortex guitar picks', detail: '1.0mm or 1.14mm' },
    { name: 'Strings', text: 'Always 13 gauge strings. I bounce back and forth between Martin and D’adderio brands.' },
    { name: 'Capo', text: 'I use Kyser brand capos exclusively' },
    { name: 'Harmonica', text: 'I use Hohner Blues Harp Harmonica’s exclusively' },
    { name: 'Cables', text: 'Typically I use Monster or Mogami' },
    { name: 'Microphone', text: 'Shure Beta58' },
  ],
  pa: {
    name: 'PA SYSTEM',
    title: 'L1® Model 1S system with B2 bass and ToneMatch® audio engine',
    specs: [
      '12-speaker articulated line array delivers 180-degree horizontal sound coverage',
      'Produces consistent tonal balance with less volume drop-off over distance',
      'System’s interconnecting pieces allow for easy transport, setup and breakdown',
      'Four-channel ToneMatch audio engine with studio class effects',
    ],
  },
  effects: ['Digitech JamMan II Stereo Looper', 'TC-Helicon Harmony Singer', 'Boss-oc 3 Polyphonic Octave Pedal', 'SKB PS8 Pedal Board'],
}

/** Contact (Contact page + EPK "Best way to get in touch:"). */
export const CONTACT = {
  eyebrow: 'Contact',
  title: 'Best way to get in touch:',
  name: 'Greg Jones',
  href: 'mailto:greg@gregjonesproject.com',
  tour: 'Go to Facebook for tour info!',
  tourUrl: 'https://www.facebook.com/gregjonesproject',
  epkLabel: 'Check out our Electronic Press Kit',
  thanks: 'Thanks so much for the continued support…and snap away!!! Cheers!',
}

/** Chapter headlines — each is the site's own phrase for that section. */
export const SECTIONS = {
  listen: { eyebrow: 'Listen', title: 'Download the album!' },
  watch: { eyebrow: 'Videos', title: 'Check out the video for House Not Home!' },
  story: { eyebrow: 'Bio', title: 'Bubbling up through the cracks for 2 decades…' },
  band: { eyebrow: 'The band', title: 'A sound and style that’s all their own.' },
  gear: { eyebrow: 'Gear', title: 'I use the following gear (almost exclusively) on solo shows:' },
  contact: { eyebrow: 'Contact', title: 'Best way to get in touch:' },
}

/** HUD microcopy (decorative, not claims). */
export const MICROCOPY = {
  signalEyebrow: 'Greg Jones Project · South Jersey',
  scrollHint: 'Scroll to tune up',
  audio: 'Sound',
  audioOn: 'On',
  audioOff: 'Off',
  motion: 'Motion',
  motionOn: 'On',
  motionOff: 'Off',
}

/* Compatibility for the UI modules inherited from the engine donor. */
export const BRAND = {
  name: ARTIST.name,
  short: ARTIST.short,
  email: ARTIST.email,
  tagline: ARTIST.tagline,
  locale: 'South Jersey · the tri-state area',
  manifesto: ARTIST.lead,
}
/** Credit line (the site's designer). */
export const CREDIT = { text: 'Concept by Hark Digital Design', url: 'https://hark.digital' }
