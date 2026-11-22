// MOCKUPS ONLY (?drift=a|b|c): the Drift mockups' shared state (DriftMock.vue, the rail's row)
import { reactive } from 'vue';

// A minor's chord in thirds: A3 C4 E4 G4 B4 D5
export const NOTES = [
    { name: 'A', oct: 'A3', deg: '1', hz: 220 },
    { name: 'C', oct: 'C4', deg: '3', hz: 261.6 },
    { name: 'E', oct: 'E4', deg: '5', hz: 329.6 },
    { name: 'G', oct: 'G4', deg: '7', hz: 392 },
    { name: 'B', oct: 'B4', deg: '9', hz: 493.9 },
    { name: 'D', oct: 'D5', deg: '11', hz: 587.3 },
];
const H = (on: number[]) => Array.from({ length: 6 }, (_, k) => on.includes(k));
// One shared mock, so every part shows the same progression
export const mock = reactive({
            length: 4, pick: 1, now: 1,
            bars: [
                { held: H([0, 1, 2]), chord: 0 },      // Am
                { held: H([1, 2, 3]), chord: 4 },      // C  (c: F)
                { held: H([2, 3, 4]), chord: 1 },      // Em (c: C)
                { held: H([3, 4, 5]), chord: 5 },      // G
                { held: H([0, 1, 2, 3]), chord: 0 },   // Am7
                { held: H([1, 2, 3, 4]), chord: 2 },
                { held: H([2, 3, 4, 5]), chord: 3 },
                { held: H([0, 2, 4]), chord: 5 },
            ],
            voices: 5, drift: 0.45, tone: 0.5, attack: 1, release: 2, space: 0.7,
            x: 0.42, y: 0.62,
});

export function chordName(held: boolean[]): string {
    const names = NOTES.filter((_, k) => held[k]).map((n) => n.name);
    const s = names.join('');
    const KNOWN: Record<string, string> = { ACE: 'Am', CEG: 'C', EGB: 'Em', GBD: 'G', ACEG: 'Am7', CEGB: 'Cmaj7', EGBD: 'Em7', AEB: 'Asus2', ACEGB: 'Am9', AEBD: 'A5add9', CGD: 'Csus2' };
    if (!names.length) return '—';
    return KNOWN[s] ?? names.join(' ');
}
