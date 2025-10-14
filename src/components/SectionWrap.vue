<template>
    <section class="pt-card collapsible">
        <div class="pt-subheader">
            <!-- keep the old header layout, but not clickable -->
            <div class="pt-collapse-btn" aria-disabled="true">
                <h2 class="pt-title">{{ title }}</h2>
            </div>

            <div class="pt-header-tools">
                <slot name="tools" />
            </div>
        </div>

        <!-- body is always rendered and visible -->
        <div class="pt-collapse-body" :id="`${id}-panel`" role="region">
            <slot />
        </div>
    </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

const props = withDefaults(defineProps<{
    id: string
    title: string
    /** kept only for v-model compatibility, not used */
    modelValue?: boolean
}>(), {})

/** keep v-model silent but well-formed so parents don't warn */
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

// If a parent bound v-model, nudge it to "true" once so any external
// state (like snapshots) stabilizes in the "open" position.
onMounted(() => emit('update:modelValue', true))
</script>

<style scoped>
.collapsible .pt-subheader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
}

.pt-collapse-btn {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    cursor: default;
}

.pt-collapse-body {
    margin-top: 15px;
}

.chev {
    inline-size: 1.1rem;
    block-size: 1.1rem;
    opacity: .95;
}
</style>
