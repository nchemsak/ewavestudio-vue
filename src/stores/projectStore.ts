// src/stores/projectStore.ts
import { defineStore } from 'pinia';
import { saveProject, loadProject, listProjects } from '../lib/storage/projects';

const genId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Strip Vue proxies / methods / DOM nodes so IDB structured clone never fails
const toSerializable = <T>(v: T): T =>
    JSON.parse(JSON.stringify(v)) as T;

type ProjectSnapshot = {
    projectId: string;
    meta?: {
        name: string;
        createdAt?: string;
        updatedAt?: string;
    };
    data: any;
    name?: string; // legacy top-level name
};

// useProjectSync copies settings changes into `data` once they settle; this hook copies a
// pending change at once. Kept outside the state: it's a function, not project data.
let flushHook: (() => void) | null = null;

export const useProjectStore = defineStore('project', {
    state: () => ({
        projectId: '' as string,
        name: 'Untitled' as string,
        data: {} as any,
        loaded: false as boolean,
    }),
    actions: {
        async newProject(name = 'Untitled', initialData: any = {}): Promise<void> {
            this.projectId = genId();
            this.name = name;
            // store a plain, cloneable snapshot
            this.data = toSerializable(initialData);
            this.loaded = true;

            const now = new Date().toISOString();
            const record: ProjectSnapshot = {
                projectId: this.projectId,
                meta: {
                    name: this.name,
                    createdAt: now,
                    updatedAt: now,
                },
                data: toSerializable(this.data),
            };

            await saveProject(record);
        },

        async load(projectId: string): Promise<boolean> {
            const snap = (await loadProject(projectId)) as ProjectSnapshot | null;
            if (!snap) return false;

            this.projectId = snap.projectId;
            // Support both meta.name and legacy top-level name
            this.name = snap.meta?.name ?? snap.name ?? 'Untitled';
            // Make sure incoming data is plain
            this.data = toSerializable(snap.data);
            this.loaded = true;

            return true;
        },

        // Set by useProjectSync (null to remove)
        setFlushHook(fn: (() => void) | null) {
            flushHook = fn;
        },

        // Make `data` include a settings change that hasn't settled yet. Call before reading
        // `data` for anything the user asked for (save, export, the unsaved-changes check).
        flushPending() {
            flushHook?.();
        },

        async save(): Promise<void> {
            if (!this.projectId) return;
            this.flushPending();

            const record: ProjectSnapshot = {
                projectId: this.projectId,
                meta: {
                    name: this.name,
                    // we only know "now" here; createdAt is whatever is persisted already
                    updatedAt: new Date().toISOString(),
                },
                data: toSerializable(this.data),
            };

            await saveProject(record);
        },

        async list() {
            return listProjects();
        },
    },
});
