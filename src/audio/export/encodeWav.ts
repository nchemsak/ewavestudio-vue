// src/audio/export/encodeWav.ts
// Minimal, dependency-free 32-bit float WAV encoder.

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function audioBufferToWavFloat32(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels || 2;
    const sampleRate = buffer.sampleRate;
    const frames = buffer.length;
    const bytesPerSample = 4; // Float32
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = frames * blockAlign;

    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const out = new ArrayBuffer(totalSize);
    const view = new DataView(out);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, "WAVE");

    // fmt chunk (IEEE float)
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);            // Subchunk1Size
    view.setUint16(20, 3, true);             // AudioFormat 3 = IEEE float
    view.setUint16(22, numChannels, true);   // NumChannels
    view.setUint32(24, sampleRate, true);    // SampleRate
    view.setUint32(28, byteRate, true);      // ByteRate
    view.setUint16(32, blockAlign, true);    // BlockAlign
    view.setUint16(34, 32, true);            // BitsPerSample

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Interleave
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));

    let offset = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < numChannels; c++) {
            view.setFloat32(offset, channels[c][i] || 0, true);
            offset += 4;
        }
    }
    return out;
}
