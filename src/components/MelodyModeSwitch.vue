<!-- src/components/MelodyModeSwitch.vue -->
<!-- What the Melody Maker's Generate makes: Melody | Arpeggio, in the card's header (PR 82;
     Generate itself is the card's last line). DrumSequencer puts it in both Melody Makers'
     headers, the desktop's and the phone's Key page. -->
<template>
    <div class="pt-seg pt-seg-sm mm-head-mode" role="group" aria-label="Generate makes">
        <button type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': modelValue !== 'arp' }"
            :aria-pressed="modelValue !== 'arp'" title="Generate makes a melody: random notes from the scale"
            @click="emit('update:modelValue', 'random')">Melody</button>
        <button type="button" class="pt-seg-btn hw-led-top" :class="{ 'is-active': modelValue === 'arp' }"
            :aria-pressed="modelValue === 'arp'" title="Generate makes an arpeggio: the chord or scale in a pattern"
            @click="emit('update:modelValue', 'arp')">Arpeggio</button>
    </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: 'random' | 'arp' }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: 'random' | 'arp'): void }>();
</script>

<style scoped>
.mm-head-mode {
    display: flex;
    width: 190px;
}

.mm-head-mode .pt-seg-btn {
    flex: 1 1 0;
    font-size: 0.72rem;
}
</style>
