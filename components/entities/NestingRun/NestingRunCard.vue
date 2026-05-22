<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import { computed, inject, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import Divider from 'primevue/divider';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import ArtifactCard from '../Artifact/ArtifactCard.vue';
import SheetDesignCard from '../SheetDesign/SheetDesignCard.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  active: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  artifacts: { type: Array, default: () => [] },
  sheetDesigns: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'choose', 'delete', 'artifact-click', 'convert-to-physical', 'create-requisition']);

const authStore = useAuthStore();
const { t } = useI18n();
const entityContext = inject('entityContext', null);

const canManage = computed(() => authStore.can('queues', 'edit'));
const state = computed(() => props.run.status?.state || 'UNKNOWN');
const isComplete = computed(() => state.value === 'COMPLETE' || state.value === 'CHOSEN');
const artifactType = (artifact) => artifact.data?.type || '';
const relatedSheetDesigns = computed(() => uniqueById([
    ...props.sheetDesigns,
    ...contextEntities('sheet_design').filter(design => design.lineage?.runId?.toString() === props.run._id?.toString()),
    ...contextEntities('sheet_design').filter(design => (props.run.data?.sheetDesignIds || []).map(String).includes(design._id?.toString()))
]));
const relatedArtifacts = computed(() => uniqueById([
    ...props.artifacts,
    ...contextEntities('artifact').filter(artifact => artifact.lineage?.runId?.toString() === props.run._id?.toString())
]));
const RUN_FIELDS = [
    { path: 'data.results.sheetCount', i18n: 'results.sheets' },
    { path: 'data.results.efficiency', i18n: 'sheetDesign.utilization', suffix: '%' },
    { path: 'data.results.remnantArea', i18n: 'results.area', suffix: ' m²' }
];
const statusActions = computed(() => {
    const actions = [];
    if (canManage.value && state.value === 'COMPLETE') {
        actions.push({ label: t('status.chosen'), to: 'CHOSEN', icon: 'pi pi-check-circle', severity: 'success', command: () => emit('choose', props.run._id) });
    }
    if (canManage.value) {
        actions.push({ label: t('common.delete'), icon: 'pi pi-trash', severity: 'danger', display: 'menu', command: () => emit('delete', props.run._id) });
    }
    return actions;
});

function contextEntities(type) {
    const context = unref(entityContext);
    const byId = context?.entities?.[type] || {};
    return Object.values(byId);
}

function uniqueById(items) {
    return Array.from(new Map(items.filter(item => item?._id).map(item => [item._id.toString(), item])).values());
}
</script>

<template>
  <div class="h-full cursor-pointer" @click="$emit('select', run._id)">
    <EntityCard :entity="run" entity-type="nesting_run" :variant="variant" :show-trace="false" :status-actions="statusActions">
      <Divider />
      <div class="flex flex-col gap-4">
        <div v-if="isComplete" class="flex flex-col gap-2">
          <DataBlock :entity="run" :fields="RUN_FIELDS" />
          <div v-if="relatedSheetDesigns.length" class="flex flex-col gap-2">
            <small class="text-muted-color">{{ $t('nestingRun.sheetDesigns') }}</small>
            <div class="flex flex-wrap gap-2">
              <SheetDesignCard
                v-for="design in relatedSheetDesigns"
                :key="design._id"
                :design="design"
                variant="inline"
              />
            </div>
          </div>
          <div class="flex flex-wrap gap-1">
            <ArtifactCard 
              v-for="artifact in [...relatedArtifacts].sort((a,b) => (artifactType(a) === 'LAYOUT_DXF' ? -1 : 1))" 
              :key="artifact._id" 
              :artifact="artifact" 
              variant="inline"
              @click="$emit('artifact-click', artifact)"
            />
          </div>
        </div>
        <div v-else-if="state === 'NESTING'" class="flex justify-center p-2">
          <i class="pi pi-spin pi-spinner"></i>
        </div>
        <div v-else-if="state === 'ERROR'" class="text-sm italic text-muted-color">
          {{ $t('results.failed') }}
        </div>
      </div>
    </EntityCard>
  </div>
</template>
