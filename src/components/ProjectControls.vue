<!-- src/components/ProjectControls.vue -->
<template>
    <div class="pc-toolbar" role="region" aria-label="Project controls">
        <div class="pc-left">
            <input v-model="nameDraft" class="pc-name" :disabled="!store.loaded" @change="rename"
                @keydown.enter.prevent="rename" placeholder="Untitled" aria-label="Project name" />

            <button class="pc-btn" title="Shift-click to duplicate current" @click="newProject($event)">
                New
            </button>

            <div class="pc-open" ref="openWrap">
                <button class="pc-btn" @click="toggleOpenMenu" :aria-expanded="showOpen ? 'true' : 'false'"
                    aria-haspopup="menu">
                    Open ▾
                </button>

                <div v-if="showOpen" ref="openMenu" class="pc-menu" role="menu" @keydown.escape="showOpen = false"
                    tabindex="0">
                    <div v-if="projects.length === 0" class="pc-empty">No saved projects yet.</div>

                    <div v-else class="pc-list">
                        <div v-for="p in projects" :key="p.projectId" class="pc-row">
                            <button class="pc-menu-item" role="menuitem" @click="openProject(p.projectId)"
                                :title="(p.meta?.name || 'Untitled') + ' • ' + formatDate(p.meta?.updatedAt)">
                                <span class="pc-title">{{ truncateTitle(p.meta?.name || 'Untitled') }}</span>
                                <span class="pc-meta">{{ formatDate(p.meta?.updatedAt) }}</span>
                            </button>

                            <button class="pc-del" title="Delete" @click.stop="deleteOne(p.projectId, p.meta?.name)"
                                aria-label="Delete project">
                                🗑
                            </button>
                        </div>

                        <div class="pc-menu-divider"></div>

                        <button class="pc-menu-danger" role="menuitem" @click="clearAll">Clear all saves…</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="pc-right">
            <div class="pc-actions">
                <button class="pc-btn pc-primary" :disabled="!store.loaded || !dirty || status === 'saving'"
                    @click="saveNow" :title="hotkeyTitle">
                    <span v-if="status === 'saving'">Saving…</span>
                    <span v-else-if="dirty">Save</span>
                    <span v-else>Saved</span>
                </button>

                <button class="pc-btn" @click="exportJson" :disabled="!store.loaded">Export</button>

                <input ref="fileInput" type="file" accept="application/json" class="pc-hidden" @change="onImport" />
                <button class="pc-btn" @click="triggerImport">Import</button>
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
    clearAllProjects as repoClearAll
} from '../lib/storage/projects';
import { buildExportFile, downloadJson, importJson } from '../lib/storage/exportImport';

const TITLE_MAX_CHARS = 28;
const store = useProjectStore();

const nameDraft = ref<string>(store.name);
watch(() => store.name, (v) => (nameDraft.value = v || 'Untitled'));

const projects = ref<any[]>([]);
const showOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const openWrap = ref<HTMLElement | null>(null);
const openMenu = ref<HTMLElement | null>(null);

function formatDate(ms?: number) {
    if (!ms || Number.isNaN(ms)) return '';
    try { return new Date(ms).toLocaleString(); } catch { return ''; }
}
async function refreshList() { projects.value = await repoList(); }

function toggleOpenMenu() {
    showOpen.value = !showOpen.value;
    if (showOpen.value) refreshList();
}

async function openProject(id: string) {
    await store.load(id);
    showOpen.value = false;
    nextTick(() => { lastSavedHash.value = hashOf(store.data); });
}

function truncateTitle(name: string) {
    const n = name.trim();
    return n.length > TITLE_MAX_CHARS ? n.slice(0, TITLE_MAX_CHARS - 1) + '…' : n;
}

function onDocPointerDown(e: Event) {
    if (!showOpen.value) return;
    const t = e.target as Node;
    if (openWrap.value && !openWrap.value.contains(t)) showOpen.value = false;
}
onMounted(() => { document.addEventListener('pointerdown', onDocPointerDown, true); });
onUnmounted(() => { document.removeEventListener('pointerdown', onDocPointerDown, true); });

async function deleteOne(id: string, name?: string) {
    const label = (name?.trim() || 'Untitled');
    if (!confirm(`Delete “${label}”?`)) return;

    const deletingCurrent = id === store.projectId;
    await repoRemove(id);

    if (deletingCurrent) {
        await store.newProject('Untitled', {});
        nextTick(() => { lastSavedHash.value = hashOf(store.data); });
    }
    await refreshList();
}

async function clearAll() {
    if (!confirm('Delete ALL saved projects? This cannot be undone.')) return;
    await repoClearAll();
    await store.newProject('Untitled', {});
    nextTick(() => { lastSavedHash.value = hashOf(store.data); });
    await refreshList();
    showOpen.value = false;
}

async function newProject(evt?: MouseEvent) {
    const proposed = (store.name && store.name !== 'Untitled') ? store.name + ' copy' : 'Untitled';
    const name = prompt('Name your new project:', proposed);
    if (name === null) return;

    const duplicate = !!evt?.shiftKey;
    localStorage.setItem('ewave:reset-ui-next', duplicate ? '0' : '1');

    let initialData: any = {};
    if (duplicate) {
        const cloned = JSON.parse(JSON.stringify(store.data ?? {}));
        if (cloned && typeof cloned === 'object') {
            const keepStepLen = (cloned as any)?.ui?.stepLength;
            (cloned as any).ui = keepStepLen ? { stepLength: keepStepLen } : {};
        }
        initialData = cloned;
    }
    await store.newProject(name.trim() || 'Untitled', initialData);
    nextTick(() => { lastSavedHash.value = hashOf(store.data); });
    showOpen.value = false;
}

async function rename() {
    store.name = nameDraft.value || 'Untitled';
    await saveNow();
}

type Status = 'saving' | 'saved';
const status = ref<Status>('saved');
const lastSavedHash = ref<string>('');
const hotkeyTitle = computed(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    return isMac ? 'Save (⌘S)' : 'Save (Ctrl+S)';
});
function hashOf(obj: unknown): string { try { return JSON.stringify(obj); } catch { return ''; } }
const currentHash = computed(() => hashOf(store.data));
const dirty = computed(() => store.loaded && currentHash.value !== lastSavedHash.value);
const dotClass = computed(() => (dirty.value ? 'unsaved' : 'saved'));

async function saveNow() {
    if (!store.loaded) return;
    if (!dirty.value && status.value !== 'saving') return;
    try {
        status.value = 'saving';
        await store.save();
        lastSavedHash.value = currentHash.value;
        status.value = 'saved';
    } catch (err) {
        console.error('Save failed:', err);
        alert('Save failed. See console for details.');
        status.value = 'saved';
    }
}
onMounted(() => {
    if (store.loaded) lastSavedHash.value = hashOf(store.data);
    watch(() => store.projectId, () => { nextTick(() => { lastSavedHash.value = hashOf(store.data); }); });
});

function exportJson() {
    const file = buildExportFile({ projectId: store.projectId, name: store.name, data: store.data });
    downloadJson(file, `${store.name || 'project'}.json`);
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
        await store.newProject(importedName, normalized.data);
        nextTick(() => { lastSavedHash.value = hashOf(store.data); });
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
    if (isSave) { e.preventDefault(); saveNow(); }
}
onMounted(() => { window.addEventListener('keydown', onKeydown); });
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); });
</script>

<style scoped>
/* =========================================================
   THEME-AWARE TOKENS
   - Uses your app's --pt-* variables so it follows
     light / dark / synthwave automatically.
   - Fallbacks keep dark sane if a token is missing.
   ========================================================= */
.pc-toolbar {
    /* pull from your global theme tokens */
    --pc-text: var(--pt-text, #e9e9ef);
    --pc-panel: var(--pt-panel, #171a21);
    --pc-border: var(--pt-hairline, #2b2f3b);
    --pc-surface-1: var(--pt-surface-1, #232733);
    --pc-surface-2: var(--pt-surface-2, #1c202b);
    /* accent: your design seems to store the hue in --pt-accent */
    --pc-accent-h: var(--pt-accent, 230);
    /* hue fallback */
    --pc-accent-1: hsl(var(--pc-accent-h) 86% 62%);
    --pc-accent-2: hsl(var(--pc-accent-h) 82% 52%);

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
    padding: .5rem .75rem;
    border: 1px solid var(--pc-border);
    border-radius: .75rem;
    background: var(--pc-panel);
    color: var(--pc-text);

    /* reserve dot space */
    --status-reserved: 2rem;
}

.pc-left,
.pc-right {
    display: flex;
    align-items: center;
    gap: .5rem;
}

.pc-name {
    width: 18ch;
    max-width: 40vw;
    padding: .35rem .5rem;
    border-radius: .5rem;
    border: 1px solid var(--pc-surface-1);
    background: var(--pc-surface-2);
    color: var(--pc-text);
}

.pc-btn {
    padding: .35rem .65rem;
    border-radius: .5rem;
    border: 1px solid var(--pc-surface-1);
    background: var(--pc-surface-2);
    color: var(--pc-text);
    cursor: pointer;
    width: 80px;
}

.pc-btn:hover {
    filter: brightness(1.08);
}

.pc-btn:disabled {
    opacity: .6;
    cursor: not-allowed;
}

/* Use theme accent (works in all themes) */
.pc-btn.pc-primary {
    border-color: color-mix(in oklch, var(--pc-surface-1), white 12%);
    background: linear-gradient(180deg, var(--pc-accent-1), var(--pc-accent-2));
    color: #fff;
    box-shadow: 0 6px 18px rgba(0, 0, 0, .18), inset 0 1px 0 rgba(255, 255, 255, .08);
}

.pc-btn.pc-primary:disabled {
    background: color-mix(in oklch, var(--pc-accent-2), black 20%);
    opacity: .6;
}

.pc-open {
    position: relative;
}

.pc-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    inline-size: clamp(420px, 42vw, 560px);
    background: var(--pc-panel);
    color: var(--pc-text);
    border: 1px solid var(--pc-border);
    border-radius: .5rem;
    box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
    padding: .25rem;
    z-index: 1001;
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
</style>
