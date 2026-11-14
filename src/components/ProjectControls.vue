<!-- src/components/ProjectControls.vue -->
<template>
    <div class="pc-toolbar" role="region" aria-label="Project controls">
        <div class="pc-left">
            <!-- The logo (DrumSequencer passes it), at the top bar's left end -->
            <slot name="brand" />
            <div class="pc-file" ref="fileWrap">
                <button class="pc-btn hw-cap" @click="toggleFileMenu" :aria-expanded="showFile ? 'true' : 'false'"
                    aria-haspopup="menu">
                    File ▾
                </button>

                <div v-if="showFile" ref="fileMenu" class="pc-menu pc-file-menu" role="menu" tabindex="0"
                    @keydown.escape.stop.prevent="closeAllMenus">
                    <button class="pc-menu-row" role="menuitem" title="Shift-click to duplicate current"
                        @click="newProject($event)">
                        New
                    </button>

                    <div class="pc-menu-row pc-has-sub" role="menuitem" aria-haspopup="menu"
                        :aria-expanded="showOpen ? 'true' : 'false'" @pointerenter="onSubPointerEnter"
                        @pointerleave="onSubPointerLeave">
                        <button class="pc-sub-btn" @click.stop="toggleOpenMenu">
                            Open ▸
                        </button>

                        <div v-if="showOpen" ref="openMenu" class="pc-menu pc-open-submenu" role="menu" tabindex="0"
                            @keydown.escape.stop.prevent="showOpen = false">
                            <div v-if="projects.length === 0" class="pc-empty">
                                No named projects yet.
                            </div>

                            <div v-else class="pc-list">
                                <div v-for="p in projects" :key="p.projectId" class="pc-row">
                                    <button class="pc-menu-item" role="menuitem" @click="openProject(p.projectId)"
                                        :title="(p.meta?.name || 'Untitled') + ' • ' + formatDate(p.meta?.updatedAt)">
                                        <span class="pc-title">
                                            {{ truncateTitle(p.meta?.name || 'Untitled') }}
                                        </span>
                                        <span class="pc-meta">
                                            {{ formatDate(p.meta?.updatedAt) }}
                                        </span>
                                    </button>

                                    <button class="pc-del" title="Delete"
                                        @click.stop="deleteOne(p.projectId, p.meta?.name)" aria-label="Delete project">
                                        🗑
                                    </button>
                                </div>

                                <div class="pc-menu-divider"></div>

                                <button class="pc-menu-danger" role="menuitem" @click="clearAll">
                                    Clear all saves…
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- A copy under a new name, which becomes the open project; the original stays as
                         it was last saved. (Renaming in the name box renames this project.) -->
                    <button class="pc-menu-row" role="menuitem" @click="saveAs" :disabled="!store.loaded"
                        :title="saveAsTitle">
                        Save as…
                    </button>

                    <button class="pc-menu-row" role="menuitem" @click="exportJson" :disabled="!store.loaded">
                        Export file
                    </button>

                    <button class="pc-menu-row" role="menuitem" @click="triggerImport">
                        Import file
                    </button>

                    <button class="pc-menu-row" role="menuitem" @click="exportAudioFromMenu"
                        :disabled="!store.loaded || props.exporting" :aria-busy="props.exporting ? 'true' : 'false'">
                        <span v-if="props.exporting">Exporting…</span>
                        <span v-else>Export audio…</span>
                    </button>

                    <!-- On a phone where someone chose the full layout: back to phone mode -->
                    <template v-if="phone.onPhone.value && phone.full.value">
                        <div class="pc-menu-divider"></div>
                        <button class="pc-menu-row" role="menuitem" @click="closeAllMenus(); phone.setFull(false)">
                            Phone view
                        </button>
                    </template>

                    <!-- Only while the browser offers it (Chrome, Edge; not once installed) -->
                    <template v-if="pwa.state.canInstall">
                        <div class="pc-menu-divider"></div>
                        <button class="pc-menu-row" role="menuitem" @click="installApp"
                            title="Its own window and icon, and it works offline">
                            Install app…
                        </button>
                    </template>
                </div>
            </div>

            <!-- data-keeps-brush: Undo and Redo don't put the Repeats brush down (DrumSequencer) -->
            <div class="pc-history" data-keeps-brush>
                <button class="pc-btn pc-icon-btn hw-cap" :disabled="!props.canUndo" @click="emit('undo')"
                    aria-label="Undo" :title="undoTitle">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M9 14 4 9l5-5" />
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                    </svg>
                </button>
                <button class="pc-btn pc-icon-btn hw-cap" :disabled="!props.canRedo" @click="emit('redo')"
                    aria-label="Redo" :title="redoTitle">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="m15 14 5-5-5-5" />
                        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                    </svg>
                </button>
            </div>

            <input ref="fileInput" type="file" accept="application/json" class="pc-hidden" @change="onImport" />
        </div>

        <div class="pc-center">
            <input v-model="nameDraft" class="pc-name" :disabled="!store.loaded" @change="rename"
                @keydown.enter.prevent="rename" aria-label="Project name" />
        </div>

        <div class="pc-right">
            <div class="pc-actions">
                <button class="pc-btn pc-primary hw-cap" :disabled="!store.loaded || !dirty || status === 'saving'"
                    @click="saveNow" :title="hotkeyTitle">
                    <span v-if="status === 'saving'">Saving…</span>
                    <span v-else-if="dirty">Save</span>
                    <span v-else>Saved</span>
                </button>
            </div>

            <span class="pc-status" aria-live="polite" aria-atomic="true">
                <span class="pc-dot" :class="dotClass"></span>
            </span>
        </div>
    </div>
</template>




<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import {
    listProjects as repoList,
    deleteProject as repoRemove,
    clearAllProjects as repoClearAll,
    BrokenProjectError,
    brokenProjectMessage
} from '../lib/storage/projects';
import { buildExportFile, downloadJson, importJson } from '../lib/storage/exportImport';
import { storageKey } from '../lib/storage/namespace';
import { usePwa } from '../composables/usePwa';
import { usePhoneMode } from '../composables/usePhoneMode';

const TITLE_MAX_CHARS = 28;
const store = useProjectStore();

const nameDraft = ref<string>(store.name);
watch(() => store.name, (v) => (nameDraft.value = v || ''));

const projects = ref<any[]>([]);
const showFile = ref(false);
const showOpen = ref(false);

const fileInput = ref<HTMLInputElement | null>(null);
const fileWrap = ref<HTMLElement | null>(null);
const fileMenu = ref<HTMLElement | null>(null);
const openMenu = ref<HTMLElement | null>(null);

const isNewUnsaved = ref<boolean>(false);
const lastSavedHash = ref<string>('');
const lastSavedName = ref<string>('');

const props = defineProps<{ exporting?: boolean; canUndo?: boolean; canRedo?: boolean }>();
const emit = defineEmits<{ (e: 'export-audio'): void; (e: 'undo'): void; (e: 'redo'): void }>();

// GOOGLE ANALYTICS
function trackEvent(event: string, params: Record<string, any> = {}) {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (typeof w.gtag === 'function') {
        w.gtag('event', event, params);
    }
}

// Installing the app (src/composables/usePwa.ts): the browser's own install dialog
const pwa = usePwa();
const phone = usePhoneMode();
async function installApp() {
    closeAllMenus();
    const outcome = await pwa.install();
    if (outcome) trackEvent('pwa_install', { outcome });
}

// Opens the Export audio dialog (ExportDialog.vue, in DrumSequencer)
function exportAudioFromMenu() {
    // Analytics: user opened "Export audio…"
    trackEvent('export_audio_click', {
        project_id: store.projectId,
        project_name: store.name || '(unnamed)',
    });

    closeAllMenus();
    emit('export-audio');
}

function formatDate(ms?: number) {
    if (!ms || Number.isNaN(ms)) return '';
    try { return new Date(ms).toLocaleString(); } catch { return ''; }
}

function isNamedProject(p: any) {
    const n = (p?.meta?.name ?? '').trim();
    return n.length > 0 && n.toLowerCase() !== 'untitled';
}

async function refreshList() {
    const all = await repoList();
    projects.value = (Array.isArray(all) ? all : []).filter(isNamedProject);
}

function toggleFileMenu() {
    showFile.value = !showFile.value;
    if (!showFile.value) showOpen.value = false;
    if (showFile.value) refreshList();
}
function closeAllMenus() { showOpen.value = false; showFile.value = false; }
function toggleOpenMenu() {
    showOpen.value = !showOpen.value;
    if (showOpen.value) refreshList();
}
function openSub(visible: boolean) {
    showOpen.value = visible;
    if (visible) refreshList();
}

function onSubPointerEnter(e: PointerEvent) {
    // Only auto-open on mouse hover, not touch/pen.
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    openSub(true);
}

function onSubPointerLeave(e: PointerEvent) {
    // Only auto-close on mouse hover, not touch/pen.
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    openSub(false);
}

async function openProject(id: string) {
    try {
        await store.load(id);
    } catch (err) {
        // A project that fails the project check isn't opened; the current one stays
        if (!(err instanceof BrokenProjectError)) throw err;
        console.error(err, (err as any).cause);
        closeAllMenus();
        alert(brokenProjectMessage(err, 'This project', 'Your current project is unchanged.'));
        return;
    }
    isNewUnsaved.value = false;
    closeAllMenus();
    nextTick(() => {
        lastSavedHash.value = hashOf(store.data);
        lastSavedName.value = store.name || '';
    });
}

function truncateTitle(name: string) {
    const n = name.trim();
    return n.length > TITLE_MAX_CHARS ? n.slice(0, TITLE_MAX_CHARS - 1) + '…' : n;
}

function onDocPointerDown(e: Event) {
    if (!showFile.value && !showOpen.value) return;
    const t = e.target as Node;
    const inFile = fileWrap.value && fileWrap.value.contains(t);
    const inOpen = openMenu.value && openMenu.value.contains(t);
    const inFileMenu = fileMenu.value && fileMenu.value.contains(t);
    if (!inFile && !inOpen && !inFileMenu) closeAllMenus();
}
onMounted(() => { document.addEventListener('pointerdown', onDocPointerDown, true); });
onUnmounted(() => { document.removeEventListener('pointerdown', onDocPointerDown, true); });

async function deleteOne(id: string, name?: string) {
    const label = (name?.trim() || 'Untitled');
    if (!confirm(`Delete “${label}”?`)) return;

    const deletingCurrent = id === store.projectId;
    await repoRemove(id);

    if (deletingCurrent) {
        await store.newProject('', {});
        localStorage.setItem(storageKey('reset-ui-next'), '1');
        isNewUnsaved.value = true;
        nextTick(() => {
            lastSavedHash.value = '__new__';
            lastSavedName.value = '';
            nameDraft.value = '';
        });
    }
    await refreshList();
}

async function clearAll() {
    if (!confirm('Delete ALL saved projects? This cannot be undone.')) return;
    await repoClearAll();
    await store.newProject('', {});
    localStorage.setItem(storageKey('reset-ui-next'), '1');
    isNewUnsaved.value = true;
    nextTick(() => {
        lastSavedHash.value = '__new__';
        lastSavedName.value = '';
        nameDraft.value = '';
    });
    await refreshList();
    closeAllMenus();
}

async function newProject(evt?: MouseEvent) {
    const duplicate = !!evt?.shiftKey;
    localStorage.setItem(storageKey('reset-ui-next'), duplicate ? '0' : '1');

    let initialData: any = {};
    if (duplicate) {
        const cloned = JSON.parse(JSON.stringify(store.data ?? {}));
        if (cloned && typeof cloned === 'object') {
            const keepStepLen = (cloned as any)?.ui?.stepLength;
            (cloned as any).ui = keepStepLen ? { stepLength: keepStepLen } : {};
        }
        initialData = cloned;
    }

    // store.newProject sets the new id at once, then saves. If another project replaces this
    // one before that save finishes (an import right after New), leave the newer one's name
    // and saved state alone.
    const creating = store.newProject('', initialData);
    const id = store.projectId;
    await creating;
    if (store.projectId === id) {
        isNewUnsaved.value = true;
        nextTick(() => {
            lastSavedHash.value = '__new__';
            lastSavedName.value = '';
            nameDraft.value = '';
        });
    }

    closeAllMenus();
}

async function rename() {
    store.name = (nameDraft.value || '').trim();
}

type Status = 'saving' | 'saved';
const status = ref<Status>('saved');

const hotkeyTitle = computed(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    return isMac ? 'Save (⌘S)' : 'Save (Ctrl+S)';
});
const saveAsTitle = computed(() => (/Mac|iPod|iPhone|iPad/.test(navigator.platform)
    ? 'A copy under a new name (⇧⌘S)' : 'A copy under a new name (Ctrl+Shift+S)'));
const undoTitle = computed(() => (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'));
const redoTitle = computed(() => (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Y)'));
function hashOf(obj: unknown): string { try { return JSON.stringify(obj); } catch { return ''; } }
const currentHash = computed(() => hashOf(store.data));
const nameDirty = computed(() => (store.name || '') !== (lastSavedName.value || ''));
const dirty = computed(() =>
    store.loaded && (isNewUnsaved.value || currentHash.value !== lastSavedHash.value || nameDirty.value)
);
const dotClass = computed(() => (dirty.value ? 'unsaved' : 'saved'));

// While the dot shows unsaved changes, ask before the page is closed or reloaded
function onBeforeUnload(e: BeforeUnloadEvent) {
    store.flushPending(); // a change made just now counts
    if (!dirty.value) return;
    e.preventDefault();
    e.returnValue = ''; // older browsers only show the prompt when this is set
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload));


async function saveNow() {
    if (!store.loaded) return;
    store.flushPending(); // include a change that hasn't reached the store yet
    if (!dirty.value && status.value !== 'saving') return;

    let nameToUse = (store.name || '').trim();
    if (!nameToUse) {
        const proposed = '';
        const entered = prompt('Name your project:', proposed);
        if (entered === null) return;
        const clean = (entered ?? '').trim();
        if (!clean) return;
        nameToUse = clean;
        store.name = nameToUse;
        nameDraft.value = nameToUse;
    }

    try {
        status.value = 'saving';
        await store.save();
        lastSavedHash.value = currentHash.value;
        lastSavedName.value = store.name || '';
        isNewUnsaved.value = false;
        status.value = 'saved';
        pwa.keepProjects(); // ask the browser to keep saved projects when the disk runs low
        if (showOpen.value || showFile.value) await refreshList();
    } catch (err) {
        console.error('Save failed:', err);
        alert('Save failed. See console for details.');
        status.value = 'saved';
    }
}

// SAVE AS START
// File → Save as… (Ctrl/Cmd+Shift+S): the settings as they are now, unsaved changes included,
// saved as a new project under a new name, which becomes the open one (store.saveAs()). The
// project open before stays as it was last saved. A name another saved project has replaces
// that one, once confirmed; this project's own name is a plain Save.
const sameName = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

async function saveAs() {
    if (!store.loaded || status.value === 'saving') return;
    closeAllMenus();
    store.flushPending();

    const current = (store.name || '').trim();
    const entered = prompt('Save as a new project, named:', current ? `${current} copy` : '');
    if (entered === null) return;
    const name = entered.trim();
    if (!name) return;

    // Its own name, on a project that is saved under it: nothing to copy, so it's a Save
    if (!isNewUnsaved.value && sameName(name, lastSavedName.value) && sameName(name, current)) {
        await saveNow();
        return;
    }
    const all = await repoList();
    const clash = (Array.isArray(all) ? all : [])
        .find((p: any) => p.projectId !== store.projectId && sameName(p.meta?.name, name));
    if (clash && !confirm(`“${clash.meta.name}” already exists. Replace it with this project?`)) return;

    try {
        status.value = 'saving';
        await store.saveAs(name, clash?.projectId);
        nameDraft.value = name;
        lastSavedHash.value = currentHash.value;
        lastSavedName.value = name;
        isNewUnsaved.value = false;
        status.value = 'saved';
        pwa.keepProjects();
        trackEvent('project_save_as', { replaced: !!clash });
    } catch (err) {
        console.error('Save as failed:', err);
        alert('Save failed. See console for details.');
        status.value = 'saved';
    }
}
// SAVE AS END

onMounted(() => {
    if (store.loaded) {
        lastSavedHash.value = hashOf(store.data);
        lastSavedName.value = store.name || '';
        if (!store.name) {
            isNewUnsaved.value = true;
            lastSavedHash.value = '__new__';
        }
    }
    watch(() => store.projectId, () => {
        nextTick(() => {
            lastSavedHash.value = hashOf(store.data);
            lastSavedName.value = store.name || '';
            isNewUnsaved.value = !store.name;
        });
    });
});

function exportJson() {
    store.flushPending();
    const file = buildExportFile({ projectId: store.projectId, name: store.name, data: store.data });
    downloadJson(file, `${store.name || 'project'}.json`);
    closeAllMenus(); // as every other File item does: the menu doesn't stay open over the page
}
function triggerImport() { fileInput.value?.click(); }
async function onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
        const normalized = await importJson(file);
        const topLevel = typeof normalized?.meta?.name === 'string' ? normalized.meta.name.trim() : '';
        const fromFilename = file.name.replace(/\.json$/i, '').trim();
        const insideData = typeof normalized?.data?.meta?.name === 'string' ? normalized.data.meta.name.trim() : '';
        const importedName = topLevel || fromFilename || insideData || 'Imported';

        // Same guard as in newProject(): skip if another project replaced this one meanwhile
        const importing = store.newProject(importedName, normalized.data);
        const id = store.projectId;
        await importing;
        if (store.projectId === id) {
            isNewUnsaved.value = false;
            nextTick(() => {
                lastSavedHash.value = hashOf(store.data);
                lastSavedName.value = store.name || '';
            });
        }
    } catch (err) {
        console.error('Import failed:', err);
        alert('Import failed: invalid or unsupported file.');
    } finally {
        if (fileInput.value) fileInput.value.value = '';
    }
}

function onKeydown(e: KeyboardEvent) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const isSave = (isMac && e.metaKey && e.key.toLowerCase() === 's') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 's');
    if (isSave) { e.preventDefault(); e.shiftKey ? saveAs() : saveNow(); }
}
onMounted(() => { window.addEventListener('keydown', onKeydown); });
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); });
</script>

<style scoped>
.pc-toolbar {
    --pc-text: var(--pt-text, #e9e9ef);
    --pc-panel: var(--pt-panel, #171a21);
    --pc-border: var(--pt-hairline, #2b2f3b);
    --pc-surface-1: var(--pt-surface-1, #232733);
    --pc-surface-2: var(--pt-surface-2, #1c202b);
    --pc-accent-h: var(--pt-accent, 230);
    --pc-accent-1: hsl(var(--pc-accent-h) 86% 62%);
    --pc-accent-2: hsl(var(--pc-accent-h) 82% 52%);
    --status-reserved: 2rem;

    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: .75rem;
    padding: .5rem .75rem;
    border: 1px solid var(--pc-border);
    border-radius: .75rem;
    background: var(--pc-panel);
    color: var(--pc-text);
}

.pc-left,
.pc-right {
    display: flex;
    align-items: center;
    gap: .5rem;
}

.pc-center {
    justify-self: center;
    text-align: center;
    min-width: 0;
}

.pc-name {
    width: 22ch;
    max-width: 48vw;
    padding: .35rem .5rem;
    border-radius: .5rem;
    border: 1px solid var(--pc-surface-1);
    background: var(--pc-surface-2);
    color: var(--pc-text);
}

/* File, Undo, Redo and Save are caps (_hardware.scss) */
.pc-btn {
    padding: .35rem .65rem;
    border-radius: .5rem;
    border: 1px solid transparent;
    min-width: 82px;
}

.pc-btn:disabled {
    opacity: .6;
}

/* Save: a cap in the accent's colour while there's something to save */
.pc-btn.pc-primary {
    --cap-hi: var(--pc-accent-1);
    --cap-lo: var(--pc-accent-2);
    --cap-edge: color-mix(in oklab, var(--pc-accent-2), black 60%);
    --cap-ink: #fff;
}

.pc-btn.pc-primary:disabled {
    --cap-hi: color-mix(in oklch, var(--pc-accent-2), black 20%);
    --cap-lo: color-mix(in oklch, var(--pc-accent-2), black 20%);
}

.pc-file {
    position: relative;
}

.pc-history {
    display: inline-flex;
    gap: .25rem;
}

.pc-btn.pc-icon-btn {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: .35rem .45rem;
}

.pc-icon-btn svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.pc-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    inline-size: clamp(260px, 36vw, 420px);
    background: var(--pc-panel);
    color: var(--pc-text);
    border: 1px solid var(--pc-border);
    border-radius: .5rem;
    box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
    padding: .25rem;
    z-index: 1001;
}

.pc-file-menu {
    inline-size: 220px;
}

.pc-menu-row {
    width: 100%;
    text-align: left;
    padding: .55rem .6rem;
    border-radius: .35rem;
    border: none;
    background: transparent;
    color: var(--pc-text);
    cursor: pointer;
}

.pc-menu-row:hover {
    background: color-mix(in oklch, var(--pc-surface-2), white 4%);
}

.pc-has-sub {
    position: relative;
    padding: 0;
}

.pc-sub-btn {
    width: 100%;
    text-align: left;
    padding: .55rem .6rem;
    border-radius: .35rem;
    border: none;
    background: transparent;
    color: var(--pc-text);
    cursor: pointer;
}

.pc-sub-btn:hover {
    background: color-mix(in oklch, var(--pc-surface-2), white 4%);
}

.pc-open-submenu {
    top: -.25rem;
    left: 100%;
    inline-size: clamp(420px, 42vw, 560px);
}

.pc-empty {
    padding: .75rem;
    opacity: .7;
}

.pc-list {
    display: flex;
    flex-direction: column;
    gap: .25rem;
}

.pc-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: .35rem;
    align-items: center;
}

.pc-menu-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18ch;
    column-gap: .75rem;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: .5rem .6rem;
    border-radius: .35rem;
    border: none;
    background: transparent;
    color: var(--pc-text);
    cursor: pointer;
}

.pc-menu-item:hover {
    background: color-mix(in oklch, var(--pc-surface-2), white 4%);
}

.pc-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pc-meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: .8;
    font-size: .85em;
}

.pc-del {
    padding: .4rem .5rem;
    border-radius: .35rem;
    border: 1px solid var(--pc-surface-1);
    background: var(--pc-surface-2);
    color: var(--pc-text);
    cursor: pointer;
}

.pc-del:hover {
    filter: brightness(1.06);
}

.pc-menu-divider {
    height: 1px;
    margin: .25rem .25rem;
    background: color-mix(in oklch, var(--pc-surface-1), white 6%);
    border-radius: 1px;
}

.pc-menu-danger {
    width: 100%;
    text-align: left;
    padding: .55rem .6rem;
    border-radius: .35rem;
    border: 1px solid color-mix(in oklch, var(--pc-surface-1), red 25%);
    background: color-mix(in oklch, var(--pc-surface-2), red 12%);
    color: #ffd7d7;
    cursor: pointer;
}

.pc-menu-danger:hover {
    filter: brightness(1.05);
}

.pc-right {
    position: relative;
}

.pc-actions {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    padding-right: var(--status-reserved);
}

.pc-status {
    position: absolute;
    right: .5rem;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    white-space: nowrap;
    inline-size: var(--status-reserved);
    justify-content: flex-end;
    text-align: right;
    font-size: .9em;
    opacity: .9;
}

.pc-dot {
    width: .6rem;
    height: .6rem;
    border-radius: 999px;
    background: #41d17d;
}

.pc-dot.saved {
    background: #41d17d;
}

.pc-dot.unsaved {
    background: #ffd166;
}

.pc-hidden {
    display: none;
}

@media (max-width: 768px) {
    .pc-btn {
        min-width: auto;
        font-size: 11px;
    }

    .pc-status {
        display: none;
    }

    .pc-actions {
        padding-right: 0px;
    }

    .pc-name {
        font-size: 11px;
        /* fit between the Undo/Redo buttons and Save */
        width: 100%;
        max-width: 22ch;
        min-width: 0;
    }

    .pc-center {
        justify-self: stretch;
        display: flex;
        justify-content: center;
    }

    .pc-btn.pc-icon-btn {
        padding: .3rem .35rem;
    }

    .pc-open-submenu {
        position: fixed;
        top: 12vh;
        left: 50%;
        transform: translateX(-50%);
        inline-size: min(92vw, 360px);
        max-height: 70vh;
        overflow-y: auto;
        z-index: 1100;
    }

    .pc-row {
        grid-template-columns: 1fr auto;
    }

    .pc-menu-item {
        grid-template-columns: minmax(0, 1fr);
        font-size: 12px;
    }

    .pc-meta {
        display: none;
    }
}
</style>
