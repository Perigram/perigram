<template>
    <Card>
        <template #title>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="text-lg font-bold">#{{ requisition.requisitionNumber }}</span>
                    <StatusBadge :status="requisition.status" />
                </div>
                <div class="text-lg font-black text-primary">${{ requisition.totalAmount?.toFixed(2) }}</div>
            </div>
        </template>
        <template #subtitle>
            <span class="text-xs opacity-60">{{ new Date(requisition.createdAt).toLocaleDateString() }}</span>
        </template>
        <template #content>
            <div class="flex flex-col gap-2 opacity-80">
                <div v-for="(item, idx) in displayedItems" :key="idx" class="flex justify-between text-xs">
                    <div class="flex flex-col">
                        <span class="truncate max-w-[150px] font-bold">{{ item.material }} ({{ item.color }})</span>
                        <span class="text-[9px] opacity-60">{{ item.sheetThickness }}mm / {{ item.width }}x{{ item.length }}mm</span>
                    </div>
                    <span class="font-bold">x{{ item.quantity }}</span>
                </div>
                <div v-if="requisition.items?.length > 3" class="text-[10px] opacity-40 text-center">
                    +{{ requisition.items.length - 3 }} {{ $t('common.moreItems') }}
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2 opacity-60">
                    <i class="pi pi-building text-xs"></i>
                    <span class="text-[10px] font-bold">{{ $t('requisition.mfr') }}: {{ requisition.manufacturerId?.toString().slice(-6) }}</span>
                </div>
                <Button :label="$t('common.details')" icon="pi pi-arrow-right" iconPos="right" size="small" text @click="$emit('view', requisition)" />
            </div>
        </template>
    </Card>
</template>

<script setup>
import { computed } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';

const props = defineProps({
    requisition: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);

const displayedItems = computed(() => {
    return (props.requisition.items || []).slice(0, 3);
});
</script>
