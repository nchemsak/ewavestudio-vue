// src/lib/generators/seed.ts
import seedrandom from 'seedrandom';

export function makePatternFromSeed(seed: string, steps = 16) {
    const rng = seedrandom(seed);
    return Array.from({ length: steps }, () => (rng() > 0.7 ? 1 : 0));
}
