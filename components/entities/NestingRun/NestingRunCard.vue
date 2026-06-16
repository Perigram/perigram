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
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
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

const emit = defineEmits(['select', 'choose', 'delete', 'convert-to-physical', 'refresh']);

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
const materialSources = computed(() => (props.run.data?.materialPool || [])
    .map(source => ({
        ...source,
        entityType: materialSourceEntityType(source),
        count: Number(source.available || source.availableCount || source.quantity || source.count || 1)
    }))
    .filter(source => source.entityType && source.id));
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

function materialSourceEntityType(source = {}) {
    if (source.type === 'PILE') return 'materialPile';
    if (source.type === 'SHEET') return 'sheet';
    if (source.type === 'REMNANT') return 'remnant';
    return null;
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
  <div class="cursor-pointer" @click="selectRun">
    <EntityCard
      :entity="run"
      entity-type="nesting_run"
      :variant="variant"
      :show-trace="false"
      @refresh="emit('refresh')"
    >
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
        <small v-if="relatedSheetDesigns.length" class="mt-3 block text-muted-color">
          {{ relatedSheetDesigns.length }} {{ $t('nestingRun.sheetDesigns') }}
        </small>
      </template>
      <Divider />
      <div class="flex flex-col gap-4">
        <div v-if="isComplete" class="flex flex-col gap-2">
          <DataBlock entity-type="nestingRun" :entity="run" :fields="RUN_FIELDS" />
        </div>
        <div v-if="materialSources.length" class="flex flex-col gap-2">
          <small class="text-muted-color">{{ $t('nesting.inventorySources') }}</small>
          <div class="flex flex-col gap-2">
            <div
              v-for="source in materialSources"
              :key="`${source.type}-${source.id}`"
              class="flex min-w-0 items-center justify-between gap-2"
            >
              <EntityInlineRef :type="source.entityType" :id="source.id" />
              <Tag v-if="source.count" :value="source.count" severity="secondary" size="small" />
            </div>
          </div>
        </div>
        <div v-if="isComplete && relatedSheetDesigns.length" class="flex flex-col gap-2">
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
                    severity="secondary"
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
        <div v-else-if="state === 'NESTING'" class="flex justify-center p-2">
          <i class="pi pi-spin pi-spinner"></i>
        </div>
        <div v-else-if="state === 'ERROR'" class="italic text-muted-color">
          {{ $t('results.failed') }}
        </div>
      </div>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
          <Button
            v-if="canManage"
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            size="small"
            :aria-label="$t('common.delete')"
            @click="emit('delete', props.run._id)"
          />
        </div>
      </template>
    </EntityCard>
  </div>
</template>
