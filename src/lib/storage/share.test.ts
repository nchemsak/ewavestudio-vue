import { describe, it, expect } from 'vitest';
import { buildSharePayload, encodeShare, decodeShare, readShare, shareCodeFrom, shareUrl, SHARE_PREFIX } from './share';
import { buildSnapshot, applySnapshot } from '../project/snapshot';
import { fresh, changeEverything } from '../project/testState';

describe('share links', () => {
    it('round-trips a project, without its ui, and keeps its name', async () => {
        const st = fresh();
        changeEverything(st);
        const snap = buildSnapshot(st);
        const code = await encodeShare(buildSharePayload('  My beat ', snap));
        expect(code[0]).toBe('z');
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // safe in a URL fragment as it is
        const { name, data } = await readShare(code);
        expect(name).toBe('My beat');
        expect(data.ui).toBeUndefined();
        const { ui: _ui, ...rest } = JSON.parse(JSON.stringify(snap));
        expect(data).toEqual(rest);

        // Applied to fresh settings it gives the same project (ui aside)
        const other = fresh();
        applySnapshot(other, data);
        const back: any = buildSnapshot(other);
        delete back.ui;
        expect(back).toEqual(rest);
    });

    it('keeps a factory project within about 2 kB of link', async () => {
        const code = await encodeShare(buildSharePayload('Untitled', buildSnapshot(fresh())));
        const busy = fresh();
        changeEverything(busy);
        const busyCode = await encodeShare(buildSharePayload('Busy', buildSnapshot(busy)));
        // About 1.2 and 1.3 kB when written
        expect(code.length).toBeLessThan(2000);
        expect(busyCode.length).toBeLessThan(2500);
    });

    it('shares "Untitled" as no name, so the recipient\'s Save asks for one', async () => {
        expect(buildSharePayload('Untitled', {}).meta).toEqual({});
        const code = await encodeShare({ version: 2, meta: { name: 'untitled' }, data: {} });
        expect((await readShare(code)).name).toBe('');
    });

    it('reads a plain-JSON code (a browser without CompressionStream)', async () => {
        const payload = buildSharePayload('Ünïcode ♪', buildSnapshot(fresh()));
        const code = await encodeShare(payload, false);
        expect(code[0]).toBe('j');
        expect((await readShare(code)).name).toBe('Ünïcode ♪');
    });

    it('refuses a damaged or cut-short code', async () => {
        const code = await encodeShare(buildSharePayload('x', buildSnapshot(fresh())));
        await expect(decodeShare(code.slice(0, code.length / 2))).rejects.toThrow();
        await expect(decodeShare('x' + code.slice(1))).rejects.toThrow();
        await expect(decodeShare('z%%%')).rejects.toThrow();
        // Valid JSON that isn't a project
        const bad = await encodeShare({ version: 2, data: { instruments: [{ name: 1 }] } });
        await expect(readShare(bad)).rejects.toThrow(/Not a valid project/);
    });

    it('finds the code in a fragment and builds the link from the page', () => {
        expect(shareCodeFrom('#p=zabc')).toBe('zabc');
        expect(shareCodeFrom('#q=zabc')).toBeNull();
        expect(shareCodeFrom('')).toBeNull();
        expect(shareCodeFrom(SHARE_PREFIX)).toBeNull();
        expect(shareUrl('https://www.ephemeralwave.com/studio2/?x=1#p=old', 'zabc'))
            .toBe('https://www.ephemeralwave.com/studio2/#p=zabc');
    });
});
