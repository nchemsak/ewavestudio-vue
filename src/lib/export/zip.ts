// src/lib/export/zip.ts
// A .zip of several files, so the Export audio dialog downloads one file instead of asking
// the browser for several downloads. Files are stored, not compressed: WAV audio hardly
// compresses, and this keeps the code small (no library). Readable by every unzip tool.

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

export function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

// The date and time as MS-DOS writes them (local time, 2-second steps)
function dosDateTime(d: Date) {
	const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
	const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	return { time, date };
}

export function zipFiles(files: ZipEntry[], when = new Date()): Uint8Array {
	const { time, date } = dosDateTime(when);
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const f of files) {
		const name = enc.encode(f.name);
		const crc = crc32(f.data);
		const size = f.data.length;

		// Local file header; general purpose flag bit 11: the name is UTF-8
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);       // version needed
		local.setUint16(6, 0x0800, true);   // flags
		local.setUint16(8, 0, true);        // method: stored
		local.setUint16(10, time, true);
		local.setUint16(12, date, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, size, true);    // compressed size
		local.setUint32(22, size, true);    // uncompressed size
		local.setUint16(26, name.length, true);
		local.setUint16(28, 0, true);       // extra field length
		parts.push(new Uint8Array(local.buffer), name, f.data);

		const entry = new DataView(new ArrayBuffer(46));
		entry.setUint32(0, 0x02014b50, true);
		entry.setUint16(4, 20, true);       // version made by
		entry.setUint16(6, 20, true);       // version needed
		entry.setUint16(8, 0x0800, true);
		entry.setUint16(10, 0, true);
		entry.setUint16(12, time, true);
		entry.setUint16(14, date, true);
		entry.setUint32(16, crc, true);
		entry.setUint32(20, size, true);
		entry.setUint32(24, size, true);
		entry.setUint16(28, name.length, true);
		// extra, comment, disk number, internal and external attributes: 0
		entry.setUint32(42, offset, true);  // where the local header is
		central.push(new Uint8Array(entry.buffer), name);

		offset += 30 + name.length + size;
	}

	const centralSize = central.reduce((n, p) => n + p.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);   // entries on this disk
	end.setUint16(10, files.length, true);  // entries in all
	end.setUint32(12, centralSize, true);
	end.setUint32(16, offset, true);        // where the central directory starts

	const all = [...parts, ...central, new Uint8Array(end.buffer)];
	const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of all) { out.set(p, at); at += p.length; }
	return out;
}
