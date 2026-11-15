// src/composables/useFirstGenerate.ts
// Has the Melody Maker's Generate been pressed in this browser yet? Until then its screen says
// to press it and the button glows (PR 82). One flag for every Melody Maker on the page (the
// desktop's and the phone's), kept in localStorage; a private window starts over.
import { ref } from 'vue';
import { storageKey } from '../lib/storage/namespace';

const KEY = storageKey('mm-generated');

function read(): boolean {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
}

export const generatedOnce = ref(read());

export function noteGenerated(): void {
    if (generatedOnce.value) return;
    generatedOnce.value = true;
    try {
        localStorage.setItem(KEY, '1');
    } catch {
        /* storage blocked: the hint goes for this visit only */
    }
}
