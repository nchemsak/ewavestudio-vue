// src/lib/padColour.ts
// The pads' colour language, shared by the step pads (SynthStepGrid.vue) and the screen's
// spectrogram (DrumSequencer.vue), so a note shows in the same colour on both: blue for the
// lowest pad pitch (100 Hz) to red for the highest (2 kHz), linear in Hz.
//
// On the spectrogram each frequency is drawn in its pad colour, brighter when louder (darker
// on the light theme's pale screen). Above the pads' range (a sound's harmonics) the colour
// carries on from red toward magenta, so the upper part of the screen isn't one flat red.

export const PAD_LOW_HZ = 100;
export const PAD_HIGH_HZ = 2000;

// The pad's hue for a pitch: 220 (blue) at `lo` to 0 (red) at `hi`
export function padHue(hz: number, lo = PAD_LOW_HZ, hi = PAD_HIGH_HZ): number {
	const t = Math.min(1, Math.max(0, (hz - lo) / (hi - lo)));
	return Math.round(220 * (1 - t));
}

// The spectrogram's hue for a frequency: the pad's hue within the pads' range; above it, from
// red (360) toward magenta (300), reached four octaves up
export function spectrumHue(hz: number): number {
	if (hz <= PAD_HIGH_HZ) return padHue(hz);
	return Math.round(360 - Math.min(60, Math.log2(hz / PAD_HIGH_HZ) * 15));
}

// A spectrogram point's colour: its frequency's hue; `level` 0–255 (as from
// AnalyserNode.getByteFrequencyData, less the noise floor) sets how bright. On a light screen
// louder is darker instead.
export function spectrumColour(hz: number, level: number, lightScreen = false): string {
	const t = Math.min(1, Math.max(0, level / 255));
	const light = lightScreen ? 62 - t * 38 : 22 + t * 48 + (level >= 192 ? 12 : 0);
	return `hsl(${spectrumHue(hz)} 90% ${Math.round(light)}%)`;
}
