// src/lib/machines/mix.ts
// FX and Solo per machine (the plan's item 12; option A of three mockups): the rail's two caps on
// each row. FX off plays the machine dry, round every pedal (the overdrive, delay, reverb and the
// lo-fi pedal; its Pedals knob keeps its value, as Mute keeps Level). Solo: while any machine is
// soloed, only the soloed ones are heard (a muted one stays muted). Both engines, the export and
// REV's hits ask heard() and dry() rather than reading the mutes themselves.
// Saved under the snapshot's `mixer` group as `fx` and `solo` ({ rhythm, bass, drums, drift });
// a project from before: FX on, nothing soloed (File → New the same). Not part of a sound.
import { reactive } from 'vue';

export const MACHINE_IDS = ['rhythm', 'bass', 'drums', 'drift'] as const;
export type MachineId = (typeof MACHINE_IDS)[number];
export type MachineFlags = Record<MachineId, boolean>;
export type MachineMix = { fx: MachineFlags; solo: MachineFlags };

const flags = (v: boolean): MachineFlags => ({ rhythm: v, bass: v, drums: v, drift: v });

/** FX on, nothing soloed: a fresh page, File → New, a project from before */
export function createMix(): MachineMix {
	return reactive({ fx: flags(true), solo: flags(false) });
}

export function resetMix(m: MachineMix) {
	Object.assign(m.fx, flags(true));
	Object.assign(m.solo, flags(false));
}

/** Whether any machine is soloed */
export function anySolo(solo: MachineFlags): boolean {
	return MACHINE_IDS.some((id) => solo[id]);
}

/** Whether a machine is heard: not muted, and soloed if any machine is */
export function heard(id: MachineId, muted: boolean, solo: MachineFlags): boolean {
	return !muted && (!anySolo(solo) || !!solo[id]);
}

/** Whether a machine plays dry, round every pedal (its FX cap is off) */
export function dry(id: MachineId, m: MachineMix): boolean {
	return m.fx[id] === false;
}

/** For the snapshot's `mixer` group */
export function mixSnapshot(m: MachineMix) {
	return { fx: { ...m.fx }, solo: { ...m.solo } };
}

/** From a saved `mixer` group: each flag that's a boolean; the rest as a fresh page has them */
export function applyMix(m: MachineMix, s: { fx?: unknown; solo?: unknown } | null | undefined) {
	const from = (x: unknown, d: boolean): MachineFlags => {
		const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
		return Object.fromEntries(MACHINE_IDS.map((id) => [id, typeof o[id] === 'boolean' ? o[id] : d])) as MachineFlags;
	};
	Object.assign(m.fx, from(s?.fx, true));
	Object.assign(m.solo, from(s?.solo, false));
}
