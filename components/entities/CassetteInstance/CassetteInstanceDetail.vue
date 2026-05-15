<template>
    <EntityPage :entity="instance" entity-type="cassette_instance">
        <template #actions>
                <Button :label="$t('cassetteInstance.printLabel')" icon="pi pi-print" text />
        </template>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Tracking Timeline -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        <h2 class="m-0 text-base">{{ $t('cassetteInstance.tracking') }}</h2>
                    </div>
                    <Panel>
                        <StatusHistory :entity="instance" entity-type="cassette_instance" />
                    </Panel>
                </div>

                <!-- References -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Panel :header="$t('cassetteInstance.parentDesign')">
                        <TraceLink type="cassetteDesign" :id="instance.cassetteDesignId" />
                    </Panel>
                    <Panel :header="$t('cassetteInstance.materialSource')">
                        <TraceLink type="sheet" :id="instance.sheetId" />
                    </Panel>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('common.metadata')">
                    <div class="flex flex-col gap-4">
                        <div class="flex justify-between items-center">
                            <small>{{ $t('common.created') }}</small>
                            <span>{{ instance.lineage?.createdAt ? new Date(instance.lineage.createdAt).toLocaleDateString() : '—' }}</span>
                        </div>
                        <Divider />
                        <div class="flex justify-between items-center">
                            <small>{{ $t('common.project') }}</small>
                            <span>{{ instance.lineage?.projectSlug || '—' }}</span>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Divider from 'primevue/divider';
import EntityPage from '~/components/shared/EntityPage.vue';

defineProps({
    instance: { type: Object, required: true }
});
</script>
