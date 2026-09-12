<template>
    <div class="flex flex-col gap-3 rounded-ui border border-content-border bg-subtle p-3">
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
                <i class="pi pi-box"></i>
                <div class="flex flex-col">
                    <small class="text-muted-color">{{ $t('entities.batchPile') }}</small>
                    <span class="text-label">{{ serial }}</span>
                </div>
            </div>
            <Tag v-if="thickness" :value="`${thickness} mm`" severity="secondary" size="small" />
        </div>
        <div class="grid grid-cols-2 gap-3 text-body">
            <div class="flex flex-col">
                <small class="text-muted-color">{{ $t('piles.stockTotal') }}</small>
                <span class="text-label">{{ stock.total ?? $t('common.notAvailable') }}</span>
            </div>
            <div class="flex flex-col">
                <small class="text-muted-color">{{ $t('piles.remaining') }}</small>
                <span class="text-label">{{ remaining }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';

const props = defineProps({
    pile: { type: Object, required: true }
});

const specs = computed(() => props.pile.specs || props.pile.data?.specs || {});
const stock = computed(() => props.pile.data?.stock || {});
const serial = computed(() => props.pile.data?.serial || props.pile.identity?.serial || props.pile._id?.toString().slice(-6));
const thickness = computed(() => specs.value.sheetThickness || specs.value.thickness);
const remaining = computed(() => Math.max((stock.value.total || 0) - (stock.value.used || 0), 0));
</script>
