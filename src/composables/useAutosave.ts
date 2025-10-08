// src/composables/useAutosave.ts
import { watch, ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';

export function useAutosave(ms = 800) {
    const store = useProjectStore();
    const status = ref<'idle' | 'saving' | 'saved'>('idle');
    let t: number | undefined;

    watch(
        () => store.data,
        () => {
            if (t) window.clearTimeout(t);
            status.value = 'saving';
            t = window.setTimeout(async () => {
                await store.save();
                status.value = 'saved';
                window.setTimeout(() => (status.value = 'idle'), 1500);
            }, ms);
        },
        { deep: true }
    );

    return { status };
}
