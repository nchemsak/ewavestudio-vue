// src/lib/melody/arp.ts
// The Melody Maker's arpeggio, laid out on the pads (pure, unit-tested; MelodyMaker.vue's
// bakeArp() builds the notes and calls these).
//
// Rate places the notes, as a hardware arpeggiator plays them: a note on every step at 1/16,
// every other step at 1/8, every beat at 1/4 (arpSlots()). The steps between are off.
//
// Fitting the bar: an arpeggio's cycle (its notes in order, once round) often doesn't divide
// the bar: a chord is 3 notes, 16 steps hold 5 of them and one left over, so the cycle ended
// mid-bar and jumped when the bar started again. Fitted (the default), the cycle becomes a
// block of 2, 4, 8 or 16 notes, which divide every bar: rising, it carries on into the next
// octave until the block is full (1-3-5 → 1-3-5-8); falling, into the octave below; other
// orders (up and down, random) go round again (arpSequence()). "Free" keeps the old cycle.

export type ArpRate = '1/4' | '1/8' | '1/16';
export type ArpDirection = 'up' | 'down' | 'updown' | 'random';

// Steps from one note to the next
export const RATE_STEPS: Record<ArpRate, number> = { '1/4': 4, '1/8': 2, '1/16': 1 };

// The steps that get a note: every RATE_STEPS[rate]-th, from step 1
export function arpSlots(stepCount: number, rate: ArpRate): number[] {
	const every = RATE_STEPS[rate] ?? 1;
	const out: number[] = [];
	for (let i = 0; i < stepCount; i += every) out.push(i);
	return out;
}

// The smallest of 1, 2, 4, 8, 16 ... that holds n
export function blockSize(n: number): number {
	let b = 1;
	while (b < n) b *= 2;
	return b;
}

// A note moved by octaves into lo..hi (MIDI note numbers); left as it is if the range is
// narrower than an octave
export function foldInto(midi: number, lo: number, hi: number): number {
	if (hi - lo < 12) return midi;
	let m = midi;
	while (m > hi) m -= 12;
	while (m < lo) m += 12;
	return m;
}

// The notes for `slots` slots, from the cycle `order` (MIDI note numbers, in the order they
// play). Fitted: repeated blocks of blockSize(order.length) notes (no more than the slots);
// free: the cycle round and round. Notes outside lo..hi move by octaves into it.
export function arpSequence(
	order: number[],
	slots: number,
	opts: { fit: boolean; direction: ArpDirection; lo: number; hi: number },
): number[] {
	const n = order.length;
	if (!n || slots <= 0) return [];
	// The i-th note of the cycle carried on past its end: rising and falling cycles move an
	// octave on each time round; the others just go round again
	const shift = opts.direction === 'up' ? 12 : opts.direction === 'down' ? -12 : 0;
	const nth = (i: number) => order[i % n] + shift * Math.floor(i / n);
	const block = opts.fit ? Math.min(blockSize(n), slots) : 0;
	const out: number[] = [];
	for (let s = 0; s < slots; s++) {
		const midi = opts.fit ? nth(s % block) : order[s % n];
		out.push(foldInto(midi, opts.lo, opts.hi));
	}
	return out;
}
