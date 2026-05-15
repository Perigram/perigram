<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import ArtifactCard from '../Artifact/ArtifactCard.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  active: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  artifacts: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'choose', 'delete', 'artifact-click', 'convert-to-physical', 'create-requisition']);

const authStore = useAuthStore();

const canManage = computed(() => authStore.can('queues', 'edit'));
const state = computed(() => props.run.status?.state || props.run.state || 'UNKNOWN');
const isComplete = computed(() => state.value === 'COMPLETE' || state.value === 'CHOSEN');
const artifactType = (artifact) => artifact.data?.type || '';
const RUN_FIELDS = [
    { path: 'data.results.sheetCount', i18n: 'results.sheets' },
    { path: 'data.results.efficiency', i18n: 'sheetDesign.utilization', suffix: '%' },
    { path: 'data.results.remnantArea', i18n: 'results.area', suffix: ' m²' }
];
const statusActions = computed(() => {
    if (!canManage.value || state.value !== 'COMPLETE') return [];
    return [{ label: 'Choose', to: 'CHOSEN', icon: 'pi pi-check-circle', severity: 'success', command: () => emit('choose', props.run._id) }];
});
</script>

<template>
  <div class="h-full cursor-pointer" @click="$emit('select', run._id)">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="run" variant="inline" icon="pi pi-list-check" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="run" entity-type="nesting_run" variant="compact" :show-trace="false" :status-actions="statusActions" />
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="run" entity-type="nesting_run" variant="card" :show-trace="false" :status-actions="statusActions">
        <Divider />
        <div class="flex flex-col gap-4">
            <!-- Results -->
            <div v-if="isComplete" class="flex flex-col gap-2">
                <DataBlock :entity="run" :fields="RUN_FIELDS" />
                <div class="flex flex-wrap gap-1">
                    <ArtifactCard 
                        v-for="artifact in [...artifacts].sort((a,b) => (artifactType(a) === 'LAYOUT_DXF' ? -1 : 1))" 
                        :key="artifact._id" 
                        :artifact="artifact" 
                        variant="inline"
                        @click="$emit('artifact-click', artifact)"
                    />
                </div>
            </div>

            <!-- State indicators -->
            <div v-else-if="state === 'NESTING'" class="flex justify-center p-2">
                <i class="pi pi-spin pi-spinner"></i>
            </div>
            <div v-else-if="state === 'ERROR'" class="text-sm italic text-muted-color">
                {{ $t('results.failed') }}
            </div>
        </div>
        <template #footer>
            <template v-if="canManage">
                <Divider />
                <div class="flex flex-wrap justify-between items-center gap-2">
                    <div class="flex gap-2">
                        <Button 
                            icon="pi pi-trash" severity="danger" text
                            size="small"
                            @click.stop="$emit('delete', run._id)"
                        />
                    </div>
                </div>
            </template>
        </template>
      </EntityCard>
    </template>
  </div>
</template>
