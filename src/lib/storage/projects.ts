// src/lib/storage/projects.ts
import { getDb } from './db';
import { CURRENT_VERSION, validateAndMigrate } from '../schema/projectSchema';

export async function saveProject(snapshot: {
    projectId: string;
    // allow either shape:
    name?: string;
    meta?: { name?: string; createdAt?: number; updatedAt?: number; appVersion?: string };
    data: unknown;
    appVersion?: string;
}) {
    const db = await getDb();
    const now = Date.now();

    // prefer top-level name; fall back to meta.name
    const name = snapshot.name ?? snapshot.meta?.name ?? 'Untitled';

    const existing = await db.get('projects', snapshot.projectId);
    const createdAt = existing?.meta.createdAt
        ?? (typeof snapshot.meta?.createdAt === 'number' ? snapshot.meta!.createdAt : now);

    await db.put('projects', {
        version: CURRENT_VERSION,
        projectId: snapshot.projectId,
        meta: {
            name,
            createdAt,
            updatedAt: now,
            appVersion: snapshot.appVersion ?? snapshot.meta?.appVersion,
        },
        data: snapshot.data,
    });
}


export async function loadProject(projectId: string) {
    const db = await getDb();
    const row = await db.get('projects', projectId);
    return row ? validateAndMigrate(row) : null;
}

export async function listProjects() {
    const db = await getDb();
    const all = await db.getAll('projects');
    // sort newest first
    return all.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
}

export async function deleteProject(projectId: string) {
    const db = await getDb();
    await db.delete('projects', projectId);
}

export async function clearAllProjects() {
  const db = await getDb();
  await db.clear('projects'); // wipes the entire 'projects' object store
}