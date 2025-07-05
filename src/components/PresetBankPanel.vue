<template>
    <div class="d-flex flex-column gap-4">
        <div v-for="(bank, index) in banks" :key="'bank-' + index" class="bank-card p-3 border rounded"
            :class="{ 'active-bank': activeBankIndex === index }" style="width: 120px;">
            <div class="mb-2">
                <div class="bank-name-wrapper" style="width: 100%;">
                    <input v-if="bank.editing" v-model="bank.name" @focus="$emit('update:isTyping', true)"
                        @blur="() => { $emit('update:isTyping', false); bank.editing = false }"
                        @keydown.enter="() => { $emit('update:isTyping', false); bank.editing = false }"
                        class="form-control form-control-sm w-100" />
                    <span v-else @click="$emit('edit', index)" style="cursor: pointer;">
                        <strong>{{ bank.name }}</strong>
                        <i class="ms-1 bi bi-pencil-fill text-muted"></i>
                    </span>
                </div>
            </div>
            <div class="d-flex flex-column gap-2">
                <button class="btn btn-sm btn-primary" @click="$emit('save', index)">Save</button>
                <button class="btn btn-sm btn-success" @click="$emit('load', index)"
                    :disabled="!bankHasData(index)">Load</button>
                <button class="btn btn-sm btn-danger" @click="$emit('clear', index)"
                    :disabled="!bankHasData(index)">Clear</button>
            </div>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    banks: Array,
    activeBankIndex: Number,
    isTyping: Boolean,
    bankHasData: Function
});

const emit = defineEmits(['save', 'load', 'clear', 'edit', 'update:isTyping']);
</script>

<style scoped>
.bank-card {
    background-color: #222;
    color: #fff;
}

.active-bank {
    border-color: #0d6efd;
}
</style>
