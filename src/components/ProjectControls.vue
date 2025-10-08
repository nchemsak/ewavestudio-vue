<!-- src/components/ProjectControls.vue -->
<template>
    <div class="pc-toolbar">
        <div class="pc-left">
            <input v-model="nameDraft" class="pc-name" :disabled="!store.loaded" @change="rename"
                @keydown.enter.prevent="rename" placeholder="Untitled" aria-label="Project name" />

            <button class="pc-btn" title="Shift-click to duplicate current" @click="newProject($event)">New</button>

            <div class="pc-open">
                <button class="pc-btn" @click="toggleOpenMenu">Open ▾</button>
                <div v-if="showOpen" class="pc-menu" @keydown.escape="showOpen = false" tabindex="0">
                    <div v-if="projects.length === 0" class="pc-empty">No saved projects yet.</div>
                    <button v-for="p in projects" :key="p.projectId" class="pc-menu-item"
                        @click="openProject(p.projectId)">
                        <span class="pc-title">{{ p.meta.name || 'Untitled' }}</span>
                        <span class="pc-meta">{{ formatDate(p.meta.updatedAt) }}</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="pc-right">
            <button class="pc-btn" @click="exportJson" :disabled="!store.loaded">Export</button>

            <!-- Hidden file input for Import -->
            <input ref="fileInput" type="file" accept="application/json" class="pc-hidden" @change="onImport" />
            <button class="pc-btn" @click="triggerImport">Import</button>

            <span class="pc-status" :data-status="status">
                <span class="pc-dot" :class="status"></span>
                <span v-if="status === 'saving'">Saving…</span>
                <span v-else-if="status === 'saved'">Saved</span>
                <span v-else>Idle</span>
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { listProjects as repoList } from '../lib/storage/projects';
import { buildExportFile, downloadJson, importJson } from '../lib/storage/exportImport';
import { useAutosave } from '../composables/useAutosave';

type Status = 'idle' | 'saving' | 'saved';

const store = useProjectStore();
const { status } = useAutosave(800) as { status: Status | any };

const nameDraft = ref<string>(store.name);
watch(() => store.name, (v) => (nameDraft.value = v));

const projects = ref<any[]>([]);
const showOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function formatDate(ms: number) {
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return '';
    }
}

async function refreshList() {
    projects.value = await repoList();
}

function toggleOpenMenu() {
    showOpen.value = !showOpen.value;
    if (showOpen.value) refreshList();
}

async function openProject(id: string) {
    await store.load(id);
    showOpen.value = false;
}

async function newProject(evt?: MouseEvent) {
    const proposed =
        (store.name && store.name !== 'Untitled') ? store.name + ' copy' : 'Untitled';
    const name = prompt('Name your new project:', proposed);
    if (name === null) return;

    const duplicate = !!evt?.shiftKey;

    // Flag to tell the sequencer to hard-reset its local UI on the next load
    localStorage.setItem('ewave:reset-ui-next', duplicate ? '0' : '1');

    let initialData: any = {};
    if (duplicate) {
        // Deep clone the current snapshot and scrub the "ui" section so the new project
        // starts with fresh UI, keeps musical state.
        const cloned = JSON.parse(JSON.stringify(store.data ?? {}));
        if (cloned && typeof cloned === 'object') {
            const keepStepLen = cloned?.ui?.stepLength;
            cloned.ui = keepStepLen ? { stepLength: keepStepLen } : {};
        }
        initialData = cloned;
    }

    await store.newProject(name.trim() || 'Untitled', initialData);
    showOpen.value = false;
}



async function rename() {
    store.name = nameDraft.value || 'Untitled';
    await store.save();
}

function exportJson() {
    const file = buildExportFile({
        projectId: store.projectId,
        name: store.name,
        data: store.data,
    });
    downloadJson(file, `${store.name || 'project'}.json`);
}

function triggerImport() {
    fileInput.value?.click();
}


async function onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
        const normalized = await importJson(file); // -> { version, data, ...maybe meta }

        // Prefer top-level meta.name from the export wrapper
        const topLevel = typeof normalized?.meta?.name === 'string' ? normalized.meta.name.trim() : '';
        const fromFilename = file.name.replace(/\.json$/i, '').trim();

        // LAST resort: data.meta.name (often "Untitled" in older saves)
        const insideData = typeof normalized?.data?.meta?.name === 'string'
            ? normalized.data.meta.name.trim()
            : '';

        const importedName = topLevel || fromFilename || insideData || 'Imported';

        await store.newProject(importedName, normalized.data);
    } catch (err) {
        console.error('Import failed:', err);
        alert('Import failed: invalid or unsupported file.');
    } finally {
        if (fileInput.value) fileInput.value.value = '';
    }
}


// keyboard: Ctrl/Cmd+S to force save
function onKeydown(e: KeyboardEvent) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    if ((isMac && e.metaKey && e.key.toLowerCase() === 's') ||
        (!isMac && e.ctrlKey && e.key.toLowerCase() === 's')) {
        e.preventDefault();
        store.save();
    }
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.pc-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
    padding: .5rem .75rem;
    border: 1px solid var(--panel-border, #2b2f3b);
    border-radius: .75rem;
    background: var(--panel, #171a21);
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
    border: 1px solid var(--surface1, #232733);
    background: var(--surface2, #1c202b);
    color: var(--text, #e9e9ef);
}

.pc-btn {
    padding: .35rem .65rem;
    border-radius: .5rem;
    border: 1px solid var(--surface1, #232733);
    background: var(--surface2, #1c202b);
    color: var(--text, #e9e9ef);
    cursor: pointer;
}

.pc-btn:hover {
    filter: brightness(1.1);
}

.pc-open {
    position: relative;
}

.pc-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 300px;
    background: var(--panel, #171a21);
    border: 1px solid var(--surface1, #232733);
    border-radius: .5rem;
    box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
    padding: .25rem;
    z-index: 1001;
}

.pc-empty {
    padding: .75rem;
    opacity: .7;
}

.pc-menu-item {
    display: flex;
    justify-content: space-between;
    gap: .75rem;
    width: 100%;
    text-align: left;
    padding: .5rem .6rem;
    border-radius: .35rem;
    border: none;
    background: transparent;
    color: var(--text, #e9e9ef);
    cursor: pointer;
}

.pc-menu-item:hover {
    background: var(--surface2, #1c202b);
}

.pc-title {
    font-weight: 600;
}

.pc-meta {
    opacity: .7;
    font-size: .85em;
}

.pc-status {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    font-size: .9em;
    opacity: .9;
}

.pc-dot {
    width: .6rem;
    height: .6rem;
    border-radius: 999px;
    background: gray;
}

.pc-dot.saving {
    background: orange;
}

.pc-dot.saved {
    background: #41d17d;
}

.pc-dot.idle {
    background: #6a6f7d;
}

.pc-hidden {
    display: none;
}
</style>
