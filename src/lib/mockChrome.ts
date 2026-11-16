// MOCKUP (plan item 1, not for merging): which top-bar option to show, from the URL:
// ?chrome=a (a gear at the bar's right end), b (a gear beside File), c (no gear: a MIDI cap
// and theme swatches in the bar). Without it, the app is as it was.
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('chrome') : null;
export const CHROME: 'a' | 'b' | 'c' | null = q === 'a' || q === 'b' || q === 'c' ? q : null;
