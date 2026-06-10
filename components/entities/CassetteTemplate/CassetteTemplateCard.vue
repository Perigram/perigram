<template>
  <div>
    <EntityCard :entity="template" entity-type="cassette_template" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag :value="templateType" severity="secondary" size="small" />
          <Tag v-if="documentType" :value="documentType" severity="info" size="small" />
          <Tag v-if="occsVersion" :value="occsVersion" severity="secondary" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="templateParameters.length" class="mt-3 flex flex-wrap gap-2">
          <Tag v-for="param in templateParameters.slice(0, 4)" :key="param" :value="param" severity="secondary" size="small" />
        </div>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="template" />
        <DataBlock :entity="templateForDisplay" :fields="TEMPLATE_FIELDS" />
      </div>
      <div v-if="templateParameters.length" class="flex flex-wrap gap-2 mt-4">
        <Tag v-for="param in templateParameters" :key="param" :value="param" severity="secondary" size="small" />
      </div>
      <template #footer>
        <div class="flex gap-2">
          <Button :label="$t('cassetteInstance.create')" icon="pi pi-plus" text size="small" class="flex-1" @click="emit('create-instance', template)" />
          <Button icon="pi pi-download" text size="small" @click="emit('download', template)" />
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
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const TEMPLATE_FIELDS = [
    { path: 'data.parameters.length', i18n: 'cassette.parametersTitle' }
];

const props = defineProps({
  template: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['create-instance', 'download']);

const definition = computed(() => props.template.data?.definition || {});
const templateType = computed(() => props.template.data?.type || 'PARAMETRIC');
const documentType = computed(() => definition.value.documentType || '');
const occsVersion = computed(() => definition.value.occs || '');
const templateParameters = computed(() => {
    const raw = props.template.data?.parameters || definition.value.parameters || [];
    return Array.isArray(raw) ? raw : Object.keys(raw);
});
const templateForDisplay = computed(() => ({
    ...props.template,
    data: {
        ...(props.template.data || {}),
        parameters: templateParameters.value
    }
}));
</script>
