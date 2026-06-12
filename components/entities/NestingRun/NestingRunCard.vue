<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import { computed, inject, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import SheetDesignCard from '../SheetDesign/SheetDesignCard.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  active: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  sheetDesigns: { type: Array, default: () => [] },
  showSheetDesignPreviews: { type: Boolean, default: false }
});

const emit = defineEmits(['select', 'choose', 'delete', 'convert-to-physical']);

const authStore = useAuthStore();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const entityContext = inject('entityContext', null);

const canManage = computed(() => authStore.can('queues', 'edit'));
const state = computed(() => props.run.status?.state || 'UNKNOWN');
const isComplete = computed(() => state.value === 'COMPLETE' || state.value === 'CHOSEN');
const results = computed(() => props.run.data?.results || {});
const runId = computed(() => props.run._id?.toString());
const projectSlug = computed(() => route.params.slug || props.run.lineage?.projectSlug || null);
const runSheetDesignIds = computed(() => (props.run.data?.sheetDesignIds || []).map(String));
const relatedSheetDesigns = computed(() => uniqueById([
    ...props.sheetDesigns.filter(design => isRunSheetDesign(design, runId.value, runSheetDesignIds.value)),
    ...contextEntities('sheet_design').filter(design => isRunSheetDesign(design, runId.value, runSheetDesignIds.value))
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

function isRunSheetDesign(design, runId, runSheetDesignIds = []) {
    const designId = design?._id?.toString();
    return design?.lineage?.runId?.toString() === runId ||
        (designId && runSheetDesignIds.includes(designId));
}

function selectRun(event) {
    if (isInteractiveEventTarget(event)) return;
    emit('select', props.run._id);
}

function openSheetDesign(design) {
    if (!projectSlug.value || !design?._id) return;
    router.push(`/project/${projectSlug.value}/sheet-design/${design._id}`);
}
</script>

<template>
  <div class="h-full cursor-pointer" @click="selectRun">
    <EntityCard :entity="run" entity-type="nesting_run" :variant="variant" :show-trace="false" :status-actions="statusActions">
      <template #before-identity>
        <i class="pi pi-list-check"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="results.efficiency" :value="`${results.efficiency}%`" severity="success" size="small" />
          <Tag v-if="results.sheetCount" :value="`${results.sheetCount} ${$t('results.sheets')}`" severity="secondary" size="small" />
          <Tag v-if="isChosen || state === 'CHOSEN'" :value="$t('status.chosen')" severity="success" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="relatedSheetDesigns.length" class="mt-3 text-sm text-muted-color">
          {{ relatedSheetDesigns.length }} {{ $t('nestingRun.sheetDesigns') }}
        </div>
      </template>
      <Divider />
      <div class="flex flex-col gap-4">
        <div v-if="isComplete" class="flex flex-col gap-2">
          <DataBlock entity-type="nestingRun" :entity="run" :fields="RUN_FIELDS" />
          <div v-if="relatedSheetDesigns.length" class="flex flex-col gap-2">
            <small class="text-muted-color">{{ $t('nestingRun.sheetDesigns') }}</small>
            <div
              v-if="showSheetDesignPreviews"
              class="grid grid-cols-1 gap-2"
            >
              <div
                v-for="design in relatedSheetDesigns"
                :key="design._id"
                class="min-w-0 rounded-ui border border-content-border bg-content p-2 text-left"
              >
                <GeometryPreview :entity="design" />
                <div class="mt-2 flex min-w-0 items-center justify-between gap-2">
                  <IdentityBlock :entity="design" variant="compact" />
                  <div class="flex shrink-0 items-center gap-1">
                    <Tag
                      v-if="design.summary?.placedCount"
                      :value="design.summary.placedCount"
                      severity="secondary"
                      size="small"
                    />
                    <Button
                      v-if="projectSlug"
                      icon="pi pi-external-link"
                      text
                      rounded
                      size="small"
                      :aria-label="$t('common.open')"
                      @click.stop="openSheetDesign(design)"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <SheetDesignCard
                v-for="design in relatedSheetDesigns"
                :key="design._id"
                :design="design"
                variant="inline"
              />
            </div>
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
