<template>
  <div class="h-full">
    <InstanceCard :entity="library" type-id="library" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-book"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <Tag v-if="materialLabel" :value="materialLabel" severity="secondary" size="small" />
      </template>
      <template #compact-content>
        <InstanceRelationsBlock
          v-if="hasCassettePreview"
          class="mt-3"
          :entity="library"
          :fields="RELATION_FIELDS"
          item-variant="compact"
        />
        <div v-else class="mt-3 flex flex-wrap gap-2">
          <Tag v-if="cassetteCount" :value="`${cassetteCount} ${$t('entities.cassette')}`" severity="info" size="small" />
        </div>
      </template>
      <Divider />
      <DataBlock type-id="library" :entity="library" :fields="DATA_FIELDS" />
      <InstanceRelationsBlock
        v-if="hasCassettePreview"
        class="mt-3"
        :entity="library"
        :fields="RELATION_FIELDS"
        item-variant="compact"
      />
    </InstanceCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import InstanceRelationsBlock from '~/components/shared/InstanceRelationsBlock.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { resolveDataPath } from '~/utils/data-display.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';

const props = defineProps({
  library: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const FIELDS = resolveInstanceDisplayFields({ typeId: 'library', surface: 'card' });
const RELATION_FIELDS = FIELDS.filter(field => field.display === 'entityRef' || field.display === 'entityRefList');
const relationCountReplacements = computed(() => new Set(RELATION_FIELDS
  .filter(field => field.replacesCountPath)
  .filter(field => resolveInstanceRelationRefs(resolveDataPath(props.library, field.path), field).length)
  .map(field => field.replacesCountPath)));
const DATA_FIELDS = computed(() => FIELDS.filter(field =>
  field.display !== 'entityRef'
  && field.display !== 'entityRefList'
  && !relationCountReplacements.value.has(field.path)
));

const cassetteCount = computed(() => props.library.summary?.cassetteCount || 0);
const hasCassettePreview = computed(() => RELATION_FIELDS.some(field =>
  resolveInstanceRelationRefs(resolveDataPath(props.library, field.path), field).length
));
const materialLabel = computed(() => {
  const material = props.library.data?.material;
  if (!material) return '';
  if (typeof material === 'string') return material;
  return material.name || material.code || material.label || '';
});
</script>
