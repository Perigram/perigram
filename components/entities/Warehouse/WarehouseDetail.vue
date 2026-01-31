<template>
    <div class="flex flex-col gap-8">
        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-building text-2xl"></i>
                    <h2 class="m-0">{{ warehouseName }}</h2>
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-pencil" severity="secondary" text @click="$emit('edit', warehouse)" />
                </div>
            </template>
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2 opacity-60">
                    <i class="pi pi-map-marker"></i>
                    <span>{{ warehouse.address }}</span>
                </div>
            </div>
        </Panel>

        <!-- Operational Stock -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
                <template #title>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-truck"></i>
                        <span>{{ warehouseStats.totalBatches || 0 }}</span>
                    </div>
                </template>
                <template #subtitle>
                    <small>{{ $t('warehouse.activeShipments') }}</small>
                </template>
            </Card>
            <Card>
                <template #title>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-file"></i>
                        <span>{{ warehouseStats.totalSheets || 0 }}</span>
                    </div>
                </template>
                <template #subtitle>
                    <small>{{ $t('warehouse.rawSheets') }}</small>
                </template>
            </Card>
            <Card>
                <template #title>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-undo"></i>
                        <span>{{ warehouseStats.totalRemnants || 0 }}</span>
                    </div>
                </template>
                <template #subtitle>
                    <small>{{ $t('warehouse.recoveredArea') }}</small>
                </template>
            </Card>
        </div>
    </div>
</template>

<script setup>
import Panel from 'primevue/panel';
import Card from 'primevue/card';
import Button from 'primevue/button';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
    warehouse: { type: Object, required: true },
    warehouseStats: { type: Object, default: () => ({}) }
});

defineEmits(['edit']);
const { name: warehouseName } = useIdentity(props.warehouse);
</script>