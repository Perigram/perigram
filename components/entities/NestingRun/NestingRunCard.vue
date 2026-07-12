<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import { computed, inject, unref } from 'vue';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import EntityRelationsBlock from '~/components/shared/EntityRelationsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { getPrimaryState } from '~/packages/core/src/index.js';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  active: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  sheetDesigns: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'choose', 'delete', 'convert-to-physical', 'refresh']);

const authStore = useAuthStore();
const entityContext = inject('entityContext', null);

const canDeleteRun = computed(() => hasPermissionGrant({
    permissions: authStore.activePermissions,
    feature: 'nesting_runs',
    action: 'delete',
    entity: props.run,
    entityType: 'nesting_run'
}));
const state = computed(() => getPrimaryState(props.run.status, 'UNKNOWN'));
const isComplete = computed(() => state.value === 'COMPLETE' || state.value === 'CHOSEN');
const results = computed(() => props.run.data?.results || {});
const hasResultData = computed(() => Object.values(results.value || {}).some(value => Number(value) > 0));
const runId = computed(() => props.run._id?.toString());
const materialSources = computed(() => (props.run.data?.materialPool || [])
    .map(source => ({
        ...source,
        entityType: materialSourceEntityType(source),
        count: Number(source.available || source.availableCount || source.quantity || source.count || 1)
    }))
    .filter(source => source.entityType && source.id));
const runSheetDesignIds = computed(() => (props.run.data?.sheetDesignIds || []).map(String));
const relatedSheetDesigns = computed(() => uniqueById([
    ...props.sheetDesigns.filter(design => isRunSheetDesign(design, runId.value, runSheetDesignIds.value)),
    ...contextEntities('sheet_design').filter(design => isRunSheetDesign(design, runId.value, runSheetDesignIds.value))
]));
const hasCompletedOutput = computed(() =>
    isComplete.value || hasResultData.value || sheetDesignRelationItems.value.length > 0
);
const NESTING_RUN_CARD_FIELDS = resolveEntityDisplayFields({ entityType: 'nestingRun', surface: 'card' });
const RUN_FIELDS = NESTING_RUN_CARD_FIELDS.filter(field => field.display !== 'entityRefList');
const sheetDesignRelationFields = computed(() => NESTING_RUN_CARD_FIELDS
    .filter(field => field.display === 'entityRefList' && field.path === 'data.sheetDesignIds')
    .map(field => ({ ...field, items: sheetDesignRelationItems.value })));
const sheetDesignRelationItems = computed(() => {
    const loadedItems = relatedSheetDesigns.value.map(design => ({
            entityType: 'sheetDesign',
            id: design._id,
            entity: design
    }));
    const idItems = runSheetDesignIds.value.map(id => ({ entityType: 'sheetDesign', id }));
    return Array.from(new Map([...idItems, ...loadedItems]
        .filter(item => item.id)
        .map(item => [item.id.toString(), item])
    ).values());
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
        <EntityRelationsBlock
          v-if="sheetDesignRelationItems.length"
          class="mt-3"
          :entity="run"
          :fields="sheetDesignRelationFields"
          item-variant="compact"
        />
      </template>
      <Divider />
      <div class="flex flex-col gap-4">
        <div v-if="hasCompletedOutput" class="flex flex-col gap-2">
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
        <div v-if="hasCompletedOutput && sheetDesignRelationItems.length">
          <EntityRelationsBlock
            :entity="run"
            :fields="sheetDesignRelationFields"
            item-variant="compact"
          />
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
            v-if="canDeleteRun"
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
