// src/lib/storage/share.ts
// Share links: a project packed into the URL's fragment, `#p=<code>`. The fragment is never
// sent to the server, so this works on static hosting and the server sees nothing.
//
// The code is the export file's shape ({ version, meta: { name }, data }, as File → Export
// file writes it, without the project id and `ui`: the theme and open panels are the
// recipient's own), as JSON, compressed with deflate (CompressionStream) and written in
// base64url. Its first letter says how: 'z' deflated, 'j' plain JSON (a browser without
// CompressionStream). Opening one goes through validateAndMigrate(), as an import does.

import { CURRENT_VERSION, validateAndMigrate } from '../schema/projectSchema';

export const SHARE_PREFIX = '#p=';

export type SharePayload = {
    version: number;
    meta: { name?: string };
    data: Record<string, unknown>;
};

// What a link carries: the project's settings without `ui`, and its name
export function buildSharePayload(name: string, data: any): SharePayload {
    const { ui: _ui, ...rest } = (data ?? {}) as Record<string, unknown>;
    // "Untitled" is no name (File → Open lists only named projects; the recipient's Save asks)
    const trimmed = (name ?? '').trim();
    const clean = trimmed.toLowerCase() === 'untitled' ? '' : trimmed;
    return { version: CURRENT_VERSION, meta: clean ? { name: clean } : {}, data: rest };
}

function toBase64Url(bytes: Uint8Array): string {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Not a share code');
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as TransformStream<Uint8Array, Uint8Array>);
    return new Uint8Array(await new Response(out).arrayBuffer());
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// The project as a share code (without the '#p=')
export async function encodeShare(payload: unknown, compress = canCompress()): Promise<string> {
    const json = new TextEncoder().encode(JSON.stringify(payload));
    if (!compress) return 'j' + toBase64Url(json);
    return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

// A share code back to the object it was made from (not yet checked). Throws when the code
// is damaged (cut short by a chat app, mistyped) or this browser can't unpack it.
export async function decodeShare(code: string): Promise<unknown> {
    const kind = code.charAt(0);
    const bytes = fromBase64Url(code.slice(1));
    let json: Uint8Array;
    if (kind === 'j') json = bytes;
    else if (kind === 'z') {
        if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t unpack share links');
        json = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else throw new Error('Not a share code');
    return JSON.parse(new TextDecoder().decode(json));
}

// The share code in a location's fragment ('#p=…'), or null
export function shareCodeFrom(hash: string): string | null {
    if (!hash || !hash.startsWith(SHARE_PREFIX)) return null;
    const code = hash.slice(SHARE_PREFIX.length);
    return code.length > 1 ? code : null;
}

// The link: this page (without its own fragment or query) and the code
export function shareUrl(pageUrl: string, code: string): string {
    const u = new URL(pageUrl);
    return u.origin + u.pathname + SHARE_PREFIX + code;
}

// A share code, unpacked and checked as an import is: { name, data }. Throws if it isn't a
// project this version can open.
export async function readShare(code: string): Promise<{ name: string; data: any }> {
    const raw: any = await decodeShare(code);
    const normalized: any = validateAndMigrate(raw);
    const top = typeof normalized?.meta?.name === 'string' ? normalized.meta.name.trim() : '';
    const inner = typeof normalized?.data?.meta?.name === 'string' ? normalized.data.meta.name.trim() : '';
    const name = top || inner;
    return { name: name.toLowerCase() === 'untitled' ? '' : name, data: normalized.data };
}
