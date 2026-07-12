<template>
    <EntityPage :entity="requisition" entity-type="requisition">

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Items List -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-list"></i>
                        <h2 class="m-0 text-base">{{ $t('requisition.orderComposition') }}</h2>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Panel v-for="(item, idx) in requisition.items" :key="idx">
                            <template #header>
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <div class="w-4 h-4 rounded-full border" :style="{ backgroundColor: item.colorHex || item.colorFallback || 'var(--p-content-border-color)' }"></div>
                                        <span>{{ item.colorName || item.color }}</span>
                                    </div>
                                    <small>{{ item.colorCode }}</small>
                                </div>
                            </template>
                            <Divider />
                            <SpecsBlock entity-type="requisition" :entity="item" :access-entity="requisition" />
                            <Divider />
                            <div class="flex justify-between items-center">
                                <div class="flex flex-col">
                                    <small>{{ $t('common.quantity') }}</small>
                                    <span class="text-xl">{{ item.quantity }}</span>
                                </div>
                                <div class="flex flex-col text-right">
                                    <small>{{ $t('common.subtotal') }}</small>
                                    <span class="text-xl">${{ item.totalPrice?.toFixed(2) }}</span>
                                </div>
                            </div>
                        </Panel>
                    </div>
                </div>

                <Fieldset :legend="$t('requisition.internalNotes')" v-if="requisition.notes" toggleable>
                    <p>{{ requisition.notes }}</p>
                </Fieldset>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('requisition.lifecycleTimeline')">
                    <StatusHistory entity-type="requisition" :entity="requisition" />
                </Panel>
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Divider from 'primevue/divider';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityPage from '~/components/shared/EntityPage.vue';

defineProps({
    requisition: {
        type: Object,
        required: true
    }
});
</script>
