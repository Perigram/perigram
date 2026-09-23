<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { cassetteDesignCountsForSheetDesign, cassettePlacementCountForSheetDesign } from '~/utils/sheetDesigns.js';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const route = useRoute();
const router = useRouter();
// Specs facts resolve from the compiled type view — the sheet-design
// declaration's dimensional group (units included), rendered through the
// shared fact-row control.
const { typeById } = useFileTypeView();
const specFields = computed(() => resolveInstanceDisplayFields({
  typeId: 'sheet_design',
  surface: 'compact',
  typeRecord: typeById('sheet_design')
}));
const projectSlug = computed(() => route.params.slug || props.design.lineage?.projectSlug || null);
const canOpen = computed(() => Boolean(projectSlug.value && props.design._id));
const cassetteDesigns = computed(() => cassetteDesignCountsForSheetDesign(props.design));
const cassettePlacementCount = computed(() => cassettePlacementCountForSheetDesign(props.design));
const materialPool = computed(() => props.design.data?.materialPool || []);
const materialSourceCount = computed(() => materialPool.value.length);
const openDesign = () => {
  if (!canOpen.value) return;
  router.push(`/project/${projectSlug.value}/sheet-design/${props.design._id}`);
};
</script>

<template>
  <div>
    <InstanceCard :entity="design" type-id="sheet_design" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="ck-entity-icon ck-entity-icon-sheet-design"></i>
      </template>
      <template #compact-content>
        <DataBlock type-id="sheet_design" :entity="design" :fields="specFields" variant="compact" />
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <GeometryPreview :entity="design" />
        <div v-if="cassetteDesigns.length" class="flex items-center justify-between gap-2">
          <small>{{ $t('sheetDesign.cassetteDesigns') }}</small>
          <Tag :value="`${cassetteDesigns.length} / ${cassettePlacementCount}`" size="small" />
        </div>
        <div v-if="materialSourceCount" class="flex items-center justify-between gap-2">
          <small>{{ $t('sheetDesign.materialSources') }}</small>
          <Tag :value="materialSourceCount" severity="success" size="small" />
        </div>
        <DataBlock type-id="sheet_design" :entity="design" :fields="specFields" />
      </div>
      <template #footer>
        <div v-if="canOpen" class="flex justify-end" @click.stop>
          <Button :label="$t('common.open')" icon="pi pi-external-link" text size="small" @click="openDesign" />
        </div>
      </template>
    </InstanceCard>
  </div>
</template>
