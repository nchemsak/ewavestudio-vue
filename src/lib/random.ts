// src/lib/random.ts
// Random numbers that repeat for the same seed (mulberry32). The Export audio dialog renders
// each stem separately with the same seed, so every stem gets the same noise and the same
// random pitch sweeps as the mix, and the stems add up to it. Tests use it too.

export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
