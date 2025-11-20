// src/lib/schema/projectSchema.ts
import { z } from "zod";

export const CURRENT_VERSION = 2;

// Legacy
const LegacyProjectV1 = z.object({
    synth: z.any().optional(),
    pads: z.array(z.any()).optional(),
    patterns: z.array(z.any()).optional(),
    mix: z.any().optional(),
});

// Current
const ProjectDataV2 = z.object({
    meta: z.object({ name: z.string().optional() }).optional(),
    ui: z.any().optional(),
    transport: z.any().optional(),
    synth: z.any().optional(),
    fx: z.any().optional(),
    instruments: z.array(z.object({
        name: z.string(),
        label: z.string(),
        type: z.string(), 
        isCustom: z.boolean(),
        muted: z.boolean(),
        channelVolume: z.number(),
        steps: z.array(z.boolean()),
        velocities: z.array(z.number()),
        pitches: z.array(z.number()).nullable().optional(),
        waveforms: z.array(z.any()).nullable().optional(),
    })).default([]),
    selectedWaveform: z.string().optional(),
}).passthrough();

// Minimal migration if you ever load truly old projects
function migrateV1toV2(v1: z.infer<typeof LegacyProjectV1>) {
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

export type ProjectData = z.infer<typeof ProjectDataV2>;

export function validateAndMigrate(raw: any) {
    // Try to infer version if missing
    const rawVersion =
        typeof raw?.version === "number" ? raw.version :
            (raw?.data?.pads || raw?.data?.patterns) ? 1 : 2;

    if (rawVersion === 1) {
        const legacy = LegacyProjectV1.parse(raw.data ?? {});
        const migrated = migrateV1toV2(legacy);
        // validate final shape
        ProjectDataV2.parse(migrated.data);
        return { ...raw, ...migrated };
    }

    // v2+
    ProjectDataV2.parse(raw?.data ?? {});
    return { ...raw, version: 2 };
}
