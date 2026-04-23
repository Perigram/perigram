<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="instance" />

        <div class="flex flex-col md:flex-row justify-between items-start gap-6 min-w-0">
            <div class="flex flex-wrap items-start gap-4 min-w-0">
                <h1 class="m-0">{{ $t('cassetteInstance.lifecycleTitle') }}</h1>
                <div class="min-w-0">
                    <EntityStatus :entity="instance" entity-type="cassette_instance" :actions="statusActions" />
                </div>
            </div>
            <div class="flex gap-2">
                <Button :label="$t('cassetteInstance.printLabel')" icon="pi pi-print" text />
            </div>
        </div>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Tracking Timeline -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        <h2 class="m-0 text-base">{{ $t('cassetteInstance.tracking') }}</h2>
                    </div>
                    <Card>
                        <template #content>
                            <StatusHistory :entity="instance" entity-type="cassette_instance" />
                        </template>
                    </Card>
                </div>

                <!-- References -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <template #title><small>{{ $t('cassetteInstance.parentDesign') }}</small></template>
                        <template #content>
                            <TraceLink type="cassetteDesign" :id="instance.cassetteDesignId" />
                        </template>
                    </Card>
                    <Card>
                        <template #title><small>{{ $t('cassetteInstance.materialSource') }}</small></template>
                        <template #content>
                            <TraceLink type="sheet" :id="instance.sheetId" />
                        </template>
                    </Card>
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
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useEntity } from '~/composables/useEntity';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Divider from 'primevue/divider';

const props = defineProps({
    instance: { type: Object, required: true }
});

const { changeStatus } = useEntity('cassetteInstance', props.instance?._id || props.instance?.id);

const statusActions = computed(() => [
    { label: 'Manufactured', icon: 'pi pi-check-circle', command: () => changeStatus('manufactured') },
    { label: 'On-Site', icon: 'pi pi-map-marker', command: () => changeStatus('on-site') },
    { label: 'Installed', icon: 'pi pi-home', command: () => changeStatus('installed') },
]);
</script>
