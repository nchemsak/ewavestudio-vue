// src/lib/schema/projectSchema.ts
// Checks the shape of a saved or imported project before the app uses it, and upgrades
// version-1 projects. Only the lanes ("instruments") are checked field by field; the other
// sections are free-form, and unknown fields are kept. This replaced a zod schema and accepts
// and rejects exactly the same input (see projectSchema.test.ts).

export const CURRENT_VERSION = 2;

export type ProjectLane = {
    name: string;
    label: string;
    type: string;
    isCustom: boolean;
    muted: boolean;
    channelVolume: number;
    steps: boolean[];
    velocities: number[];
    pitches?: number[] | null;
    waveforms?: unknown[] | null;
};

export type ProjectData = {
    meta?: { name?: string };
    ui?: unknown;
    transport?: unknown;
    synth?: unknown;
    fx?: unknown;
    instruments?: ProjectLane[];
    selectedWaveform?: string;
    [field: string]: unknown;
};

type LegacyProjectV1 = { synth?: unknown; pads?: unknown[]; patterns?: unknown[]; mix?: unknown };

type Check = (value: unknown) => boolean;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
const isString: Check = (v) => typeof v === 'string';
const isBoolean: Check = (v) => typeof v === 'boolean';
const isNumber: Check = (v) => typeof v === 'number' && Number.isFinite(v); // no NaN or Infinity
const anything: Check = () => true;
const optional = (check: Check): Check => (v) => v === undefined || check(v);
const optionalOrNull = (check: Check): Check => (v) => v === undefined || v === null || check(v);
// Checks every index, so a hole in a sparse array counts as undefined
const arrayOf = (check: Check): Check => (v) => {
    if (!Array.isArray(v)) return false;
    for (let i = 0; i < v.length; i++) if (!check(v[i])) return false;
    return true;
};

const LANE_FIELDS: Record<string, Check> = {
    name: isString,
    label: isString,
    type: isString,
    isCustom: isBoolean,
    muted: isBoolean,
    channelVolume: isNumber,
    steps: arrayOf(isBoolean),
    velocities: arrayOf(isNumber),
    pitches: optionalOrNull(arrayOf(isNumber)),
    waveforms: optionalOrNull(arrayOf(anything)),
    ratchets: optionalOrNull(arrayOf(isNumber)), // hits per step (synth lane; since PR 33)
};

function invalid(where: string): never {
    throw new Error(`Not a valid project: unexpected value at ${where}`);
}

function checkFields(obj: Record<string, unknown>, fields: Record<string, Check>, path: string) {
    for (const key of Object.keys(fields)) {
        if (!fields[key](obj[key])) invalid(path + key);
    }
}

function checkProjectData(data: unknown) {
    if (!isObject(data)) invalid('data');
    if (data.meta !== undefined) {
        if (!isObject(data.meta)) invalid('meta');
        checkFields(data.meta, { name: optional(isString) }, 'meta.');
    }
    if (data.instruments !== undefined) {
        if (!Array.isArray(data.instruments)) invalid('instruments');
        for (let i = 0; i < data.instruments.length; i++) {
            const lane: unknown = data.instruments[i];
            if (!isObject(lane)) invalid(`instruments[${i}]`);
            checkFields(lane, LANE_FIELDS, `instruments[${i}].`);
        }
    }
    checkFields(data, { selectedWaveform: optional(isString) }, '');
}

function checkLegacyData(data: unknown): asserts data is LegacyProjectV1 {
    if (!isObject(data)) invalid('data');
    checkFields(data, { pads: optional(arrayOf(anything)), patterns: optional(arrayOf(anything)) }, '');
}

// Minimal migration if you ever load truly old projects
function migrateV1toV2(v1: LegacyProjectV1) {
    const pads = Array.isArray(v1.pads) ? v1.pads : [];
    return {
        version: 2,
        data: {
            meta: { name: "Untitled" },
            ui: {},
            transport: {},
            synth: v1.synth ?? {},
            fx: {},
            instruments: pads.map((p: any, i: number) => ({
                name: p.name ?? `legacy-${i}`,
                label: p.label ?? `Pad ${i + 1}`,
                type: p.type ?? "sample",
                isCustom: !!p.isCustom,
                muted: !!p.muted,
                channelVolume: typeof p.channelVolume === "number" ? p.channelVolume : 0.5,
                steps: Array.isArray(p.steps) ? p.steps : Array(16).fill(false),
                velocities: Array.isArray(p.velocities) ? p.velocities : Array(16).fill(1),
                pitches: Array.isArray(p.pitches) ? p.pitches : null,
                waveforms: Array.isArray(p.waveforms) ? p.waveforms : null,
            })),
            selectedWaveform: "sine",
        }
    };
}

export function validateAndMigrate(raw: any) {
    // Try to infer version if missing
    const rawVersion =
        typeof raw?.version === "number" ? raw.version :
            (raw?.data?.pads || raw?.data?.patterns) ? 1 : 2;

    if (rawVersion === 1) {
        const legacy = raw.data ?? {};
        checkLegacyData(legacy);
        const migrated = migrateV1toV2(legacy);
        // validate final shape
        checkProjectData(migrated.data);
        return { ...raw, ...migrated };
    }

    // v2+
    checkProjectData(raw?.data ?? {});
    return { ...raw, version: 2 };
}
