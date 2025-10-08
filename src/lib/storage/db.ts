// src/lib/storage/db.ts
import { openDB, DBSchema } from 'idb';

export interface ProjectSnapshot {
    version: number;
    projectId: string;
    meta: { name: string; createdAt: number; updatedAt: number; appVersion?: string };
    data: unknown;     
}

interface EWaveDb extends DBSchema {
    projects: {
        key: string; // projectId
        value: ProjectSnapshot;
        indexes: { 'by-updatedAt': number; 'by-name': string };
    };
}

const DB_NAME = 'ewave-db';
const DB_VER = 1;

export async function getDb() {
    return openDB<EWaveDb>(DB_NAME, DB_VER, {
        upgrade(db) {
            const store = db.createObjectStore('projects', { keyPath: 'projectId' });
            store.createIndex('by-updatedAt', 'meta.updatedAt');
            store.createIndex('by-name', 'meta.name');
        }
    });
}
