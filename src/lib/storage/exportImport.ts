// src/lib/storage/exportImport.ts
import { CURRENT_VERSION, validateAndMigrate } from '../schema/projectSchema';

export type ExportFile = {
    version: number;                     // always CURRENT_VERSION
    projectId?: string;
    meta?: { name?: string; exportedAt?: number; appVersion?: string };
    data: unknown;                       // the snapshot (buildSnapshot())
};

/** Build a well-formed export payload that always has version: CURRENT_VERSION */
export function buildExportFile(args: {
    projectId?: string;
    name?: string;
    data: unknown;
    appVersion?: string;
}): ExportFile {
    return {
        version: CURRENT_VERSION,
        projectId: args.projectId,
        meta: { name: args.name, exportedAt: Date.now(), appVersion: args.appVersion },
        data: args.data,
    };
}

/** Save any object (usually the ExportFile) to disk as JSON */
export function downloadJson(obj: unknown, filename = 'project.json') {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
}

/** Read a .json file from disk and normalize it via validateAndMigrate */
export async function importJson(file: File) {
    const text = await file.text();
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error('Selected file is not valid JSON.');
    }
    return validateAndMigrate(raw);
}
