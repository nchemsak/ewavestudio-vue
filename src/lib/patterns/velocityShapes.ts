// Humanize: velocity shapes for the 16 steps (Pattern Tools on the desktop, the phone's
// Humanize list). Pure; each returns one velocity (0..1) per step.

export type VelocityShapeId = 'peaks' | 'stairs' | 'ramp' | 'dnb' | 'random' | 'reset';

export const VELOCITY_SHAPES: readonly { id: VelocityShapeId; label: string }[] = [
	{ id: 'peaks', label: 'Peaks' },
	{ id: 'stairs', label: 'Stairs' },
	{ id: 'ramp', label: 'Ramp' },
	{ id: 'dnb', label: 'dNb' },
	{ id: 'random', label: 'Random' },
	{ id: 'reset', label: 'Reset' },
];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// A cycle stretched over the whole lane (its first value on step 1, its last on the last step)
function stretched(cycle: number[], len: number): number[] {
	return Array.from({ length: len }, (_, i) =>
		len <= 1 ? cycle[0] : cycle[Math.round((i / (len - 1)) * (cycle.length - 1))]);
}

const DNB_16 = [
	0.60, 0.32, 0.50, 0.32,
	0.50, 0.50, 0.90, 0.22,
	0.50, 0.32, 0.60, 0.40,
	0.40, 0.30, 0.60, 0.40,
];

export function velocityShape(id: VelocityShapeId, len: number, random: () => number = Math.random): number[] {
	const each = (fn: (i: number) => number) => Array.from({ length: len }, (_, i) => clamp01(fn(i)));
	switch (id) {
		case 'peaks': { const c = [1.0, 0.55, 0.25, 0.55]; return each((i) => c[i % 4]); }
		case 'stairs': { const c = [1.0, 0.75, 0.5, 0.25]; return each((i) => c[i % 4]); }
		// Loud at both ends, softest in the middle
		case 'ramp': return each((i) => (len <= 1 ? 1 : 0.2 + 0.8 * Math.abs(i / (len - 1) - 0.5) * 2));
		case 'dnb': return stretched(DNB_16, len).map(clamp01);
		case 'random': return each(() => 0.15 + random() * 0.85);
		case 'reset':
		default: return each(() => 1);
	}
}
