<template>
    <EntityPage :entity="requisition" entity-type="requisition">

        <template #sidebar>
            <Panel :header="$t('requisition.lifecycleTimeline')">
                <StatusHistory entity-type="requisition" :entity="requisition" />
            </Panel>
        </template>

        <div class="flex flex-col gap-8">
            <div class="flex flex-col gap-4">
                <ActionToolbar :title="$t('requisition.orderComposition')" :level="2" />

                <ResponsiveGrid variant="wide" responsive-context="container">
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
                                    <span class="text-section-heading">{{ item.quantity }}</span>
                                </div>
                                <div class="flex flex-col text-right">
                                    <small>{{ $t('common.subtotal') }}</small>
                                    <span class="text-section-heading">${{ item.totalPrice?.toFixed(2) }}</span>
                                </div>
                            </div>
                        </Panel>
                </ResponsiveGrid>
            </div>

            <Fieldset :legend="$t('requisition.internalNotes')" v-if="requisition.notes" toggleable>
                <p>{{ requisition.notes }}</p>
            </Fieldset>
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
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';

defineProps({
    requisition: {
        type: Object,
        required: true
    }
});
</script>
