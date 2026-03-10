<template>
    <div class="inline-flex items-center gap-3 p-2 border rounded">
        <i class="pi pi-clone"></i>
        <div class="flex flex-col">
            <small>{{ $t('piles.pile') }}</small>
            <span>{{ data.serial || data.identity?.serial || data._id?.toString().slice(-6) }}</span>
        </div>
        <div class="flex gap-1">
            <Tag v-if="thickness" :value="`${thickness}mm`" severity="secondary" />
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';

const props = defineProps({
    data: { type: Object, required: true }
});

const thickness = computed(() => props.data.specs?.thickness || props.data.data?.specs?.thickness);
</script>