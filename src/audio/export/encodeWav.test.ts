import { describe, it, expect } from 'vitest';
import { audioBufferToWavFloat32 } from './encodeWav';

// Just enough of an AudioBuffer for the encoder (Node has no Web Audio)
function fakeBuffer(channels: number[][], sampleRate = 48000): AudioBuffer {
	return {
		numberOfChannels: channels.length,
		sampleRate,
		length: channels[0].length,
		getChannelData: (c: number) => Float32Array.from(channels[c]),
	} as unknown as AudioBuffer;
}

const text = (view: DataView, offset: number, length: number) =>
	String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

describe('audioBufferToWavFloat32', () => {
	it('writes a 32-bit float WAV header', () => {
		const wav = audioBufferToWavFloat32(fakeBuffer([[0, 0.5, -0.5], [1, -1, 0.25]], 44100));
		const v = new DataView(wav);

		expect(text(v, 0, 4)).toBe('RIFF');
		expect(v.getUint32(4, true)).toBe(wav.byteLength - 8);
		expect(text(v, 8, 4)).toBe('WAVE');
		expect(text(v, 12, 4)).toBe('fmt ');
		expect(v.getUint16(20, true)).toBe(3); // IEEE float
		expect(v.getUint16(22, true)).toBe(2); // channels
		expect(v.getUint32(24, true)).toBe(44100); // sample rate
		expect(v.getUint32(28, true)).toBe(44100 * 2 * 4); // bytes per second
		expect(v.getUint16(32, true)).toBe(2 * 4); // bytes per frame
		expect(v.getUint16(34, true)).toBe(32); // bits per sample
		expect(text(v, 36, 4)).toBe('data');
		expect(v.getUint32(40, true)).toBe(3 * 2 * 4);
		expect(wav.byteLength).toBe(44 + 3 * 2 * 4);
	});

	it('interleaves the channels frame by frame', () => {
		const wav = audioBufferToWavFloat32(fakeBuffer([[0, 0.5, -0.5], [1, -1, 0.25]]));
		const v = new DataView(wav);
		const samples = Array.from({ length: 6 }, (_, i) => v.getFloat32(44 + i * 4, true));
		expect(samples).toEqual([0, 1, 0.5, -1, -0.5, 0.25]);
	});

	it('writes silence instead of NaN', () => {
		const wav = audioBufferToWavFloat32(fakeBuffer([[NaN, 0.5]]));
		const v = new DataView(wav);
		expect(v.getFloat32(44, true)).toBe(0);
		expect(v.getFloat32(48, true)).toBe(0.5);
	});
});
