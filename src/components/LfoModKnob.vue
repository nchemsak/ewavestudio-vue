<!-- components/LfoModKnob.vue -->
<!-- A Knob that shows where the LFO moves its setting (a dot and an arc, src/lib/lfoVisual.ts),
     for a knob in DrumSequencer's own template (the Step Sequencer's Vol, for the LFO's Level
     target). Reading the LFO view here, not in DrumSequencer's template, keeps DrumSequencer
     from redrawing every frame while the LFO moves. Everything else goes to the Knob as is. -->
<template>
    <Knob v-bind="$attrs" :modValue="lfoView?.[valueKey] ?? null" :modRange="lfoView?.[rangeKey] ?? null" />
</template>

<script setup lang="ts">
import Knob from './Knob.vue';
import type { LfoView } from '../lib/lfoVisual';

defineOptions({ inheritAttrs: false });

type Value = 'cutoff' | 'fmAmount' | 'level';
type Range = 'cutoffRange' | 'fmAmountRange' | 'levelRange';

defineProps<{
    lfoView: LfoView | null;
    valueKey: Value;
    rangeKey: Range;
}>();
</script>
