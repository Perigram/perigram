<template>
  <div>
    <EntityCard :entity="instance" entity-type="cassette_instance" :variant="variant">
      <template #before-identity>
        <i class="pi pi-qrcode"></i>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-col gap-3">
          <CassetteThumbnail v-if="designIdValue" :cassette="design" :cassette-id="designIdValue" />
          <div v-if="design || template" class="flex flex-wrap gap-2 text-sm">
            <EntityInlineRef v-if="design" type="cassetteDesign" :entity="design" />
            <EntityInlineRef v-if="template" type="cassetteTemplate" :entity="template" />
          </div>
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <CassetteThumbnail v-if="designIdValue" :cassette="design" :cassette-id="designIdValue" />
        <Divider />
        <DataBlock entity-type="cassetteInstance" :entity="instance" :fields="INSTANCE_FIELDS" />
        <div v-if="design" class="flex justify-between items-center gap-4">
          <small>{{ $t('cassette.design') }}</small>
          <EntityInlineRef type="cassetteDesign" :entity="design" />
        </div>
        <div v-if="template" class="flex justify-between items-center gap-4">
          <small>{{ $t('entities.cassetteTemplate') }}</small>
          <EntityInlineRef type="cassetteTemplate" :entity="template" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Instance View Component - v24 Standardized
 */
import { computed, ref, watch } from 'vue';
import Divider from 'primevue/divider';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { useEntity } from '~/composables/useEntity';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const designId = computed(() => props.instance.lineage?.cassetteDesignId || props.instance.lineage?.designId || null);
const designIdValue = computed(() => designId.value?.toString?.() || designId.value || '');
const design = ref(null);
const template = ref(null);
const designEntity = useEntity('cassetteDesign');
const templateEntity = useEntity('cassetteTemplate');

watch(designId, async (id) => {
  design.value = null;
  template.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  const loadedDesign = await designEntity.fetch(normalizedId, { silent: true }).catch(() => null);
  design.value = loadedDesign;
  const templateId = loadedDesign?.lineage?.templateId || loadedDesign?.data?.templateId || null;
  const normalizedTemplateId = templateId?.toString?.() || templateId;
  if (normalizedTemplateId) {
    template.value = await templateEntity.fetch(normalizedTemplateId, { silent: true }).catch(() => null);
  }
}, { immediate: true });

const INSTANCE_FIELDS = resolveEntityDisplayFields({ entityType: 'cassetteInstance', surface: 'card' })
  .filter(field => field.display !== 'entityRef');
</script>
