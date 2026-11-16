// MOCKUP SWITCH (temporary, for the maintainer to pick a design; not merged as is).
// `?gear=a`, `?gear=b` or `?gear=c` in the address shows that design of the gear menu (Theme
// and MIDI inside the frame); without it the app is as it was. See SettingsMenu.vue.
export type GearMock = 'a' | 'b' | 'c';

export const GEAR_MOCK: GearMock | null = (() => {
	try {
		const g = new URLSearchParams(window.location.search).get('gear');
		return g === 'a' || g === 'b' || g === 'c' ? g : null;
	} catch {
		return null;
	}
})();
