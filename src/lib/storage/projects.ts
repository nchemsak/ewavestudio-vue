// src/lib/storage/projects.ts
import { getDb } from './db';
import { CURRENT_VERSION, validateAndMigrate } from '../schema/projectSchema';

export async function saveProject(snapshot: {
    projectId: string;
    // allow either shape:
    name?: string;
    meta?: { name?: string; createdAt?: number | string; updatedAt?: number | string; appVersion?: string };
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


// A saved project that fails the project check (damaged, or not readable by this version).
// Carries its name, so the message can say which project it is; `cause` is the check's error.
export class BrokenProjectError extends Error {
    constructor(public projectId: string, public projectName: string, cause: unknown) {
        super(`Project ${projectId} failed the project check: ${(cause as any)?.message ?? cause}`);
        this.name = 'BrokenProjectError';
        (this as any).cause = cause;
    }
}

// What to tell the user about a project that can't be opened. `unnamed` is used when the
// record has no name; `after` says what happens next.
export function brokenProjectMessage(err: BrokenProjectError, unnamed: string, after: string) {
    const name = err.projectName ? `"${err.projectName}"` : unnamed;
    return `${name} couldn't be opened: it is damaged, or this version of the app can't read it. ${after}`;
}

// The saved project, checked and upgraded; null if there's none with this id. Throws a
// BrokenProjectError if it fails the check.
export async function loadProject(projectId: string) {
    const db = await getDb();
    const row = await db.get('projects', projectId);
    if (!row) return null;
    try {
        return validateAndMigrate(row);
    } catch (err) {
        const raw: any = row;
        const name = typeof raw?.meta?.name === 'string' ? raw.meta.name : typeof raw?.name === 'string' ? raw.name : '';
        throw new BrokenProjectError(projectId, name, err);
    }
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