<template>
  <div>
    <EntityCard :entity="template" type-id="cassette_template" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="template" />
        <DataBlock type-id="cassetteTemplate" :entity="templateForDisplay" :fields="TEMPLATE_FIELDS" />
        <div v-if="geometryRevisionId" class="flex items-center justify-between gap-4">
          <small class="text-muted">{{ $t('revision.currentGeometry') }}</small>
          <EntityInlineRef type="entityRevision" :id="geometryRevisionId" />
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2">
          <Button :label="$t('cassetteDesign.createFromTemplate')" icon="pi pi-sitemap" text size="small" class="flex-1" @click="emit('create-design', template)" />
          <Button icon="pi pi-download" text size="small" :aria-label="$t('common.download')" @click="emit('download', template)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Template View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const TEMPLATE_FIELDS = resolveEntityDisplayFields({ typeId: 'cassetteTemplate', surface: 'card' })
    .filter(field => field.display !== 'entityRef' && field.role !== 'previewSource');

const props = defineProps({
  template: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['create-design', 'download']);

const definition = computed(() => props.template.data?.definition || {});
const templateParameters = computed(() => {
    const raw = props.template.data?.parameters || definition.value.parameters || [];
    return Array.isArray(raw) ? raw : Object.keys(raw);
});
const geometryRevisionId = computed(() => props.template.data?.revisions?.geometry?.currentId || null);
const templateForDisplay = computed(() => ({
    ...props.template,
    data: {
        ...(props.template.data || {}),
        parameters: templateParameters.value
    }
}));
</script>
