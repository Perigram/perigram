<script setup>
import Button from 'primevue/button';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi';

const props = defineProps({
  source: { type: Object, required: true }
});

const emit = defineEmits(['remove']);
const { t } = useI18n();
const domainUi = useCutkitDomainUi();

const ENTITY_TYPE_BY_SOURCE = {
  PILE: 'materialPile',
  SHEET: 'sheet',
  REMNANT: 'remnant'
};

const entityType = computed(() => ENTITY_TYPE_BY_SOURCE[props.source.type] || null);
const entity = computed(() => props.source.entity || {
  _id: props.source.id || props.source.uniqueId,
  identity: { name: props.source.label },
  data: {}
});
const icon = computed(() => domainUi.getIcon?.(entityType.value) || 'pi pi-box');
const dimensions = computed(() => props.source.dimensions || {});
const width = computed(() => Number(dimensions.value.width || dimensions.value.w || 0));
const length = computed(() => Number(dimensions.value.length || dimensions.value.height || dimensions.value.h || 0));
const dimensionLabel = computed(() => (
  width.value > 0 && length.value > 0
    ? `${width.value} x ${length.value} mm`
    : (props.source.specs || t('common.notAvailable'))
));
const availableCount = computed(() => Number(props.source.availableCount ?? props.source.available ?? 1));
const availableLabel = computed(() => `${availableCount.value || 1} ${t('common.units')}`);
const typeLabel = computed(() => ({
  PILE: t('entities.materialPile'),
  SHEET: t('entities.sheet'),
  REMNANT: t('entities.remnant'),
  CUSTOM: t('nesting.custom')
}[props.source.type] || props.source.type || t('common.source')));
const geometryData = computed(() => (
  props.source.geometryData ||
  props.source.entity?.data?.geometry ||
  props.source.entity?.data?.geometryData ||
  props.source.entity?.geometry ||
  null
));
const hasGeometryPreview = computed(() => Boolean(geometryData.value || props.source.entity?.data?.geometry));
const previewEntity = computed(() => {
  if (!hasGeometryPreview.value) return null;
  return {
    ...entity.value,
    data: {
      ...(entity.value?.data || {}),
      geometry: entity.value?.data?.geometry || { data: geometryData.value }
    }
  };
});
</script>

<template>
  <article class="flex h-full min-h-0 flex-col overflow-hidden rounded-panel border border-content-border bg-content">
    <div class="flex aspect-[5/3] min-h-36 items-center justify-center border-b border-content-border bg-subtle">
      <GeometryPreview
        v-if="previewEntity"
        :entity="previewEntity"
        class="h-full w-full"
      />
      <div v-else class="flex h-full w-full items-center justify-center p-4">
        <div class="flex aspect-[5/3] w-full max-w-48 items-center justify-center rounded-ui border border-content-border bg-content p-3 text-center">
          <span class="truncate font-medium">{{ dimensionLabel }}</span>
        </div>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div class="flex min-w-0 items-start justify-between gap-2">
        <IdentityBlock :entity="entity" variant="compact" :icon="icon" :fields="['serial', 'slug']" />
        <Button
          icon="pi pi-times"
          rounded
          text
          severity="danger"
          size="small"
          :aria-label="$t('common.delete')"
          @click.stop="emit('remove', source)"
        />
      </div>

      <dl class="grid grid-cols-2 gap-2">
        <div class="min-w-0">
          <dt class="text-muted-color">{{ $t('common.type') }}</dt>
          <dd class="truncate">{{ typeLabel }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="text-muted-color">{{ $t('common.quantity') }}</dt>
          <dd class="truncate">{{ availableLabel }}</dd>
        </div>
        <div class="col-span-2 min-w-0">
          <dt class="text-muted-color">{{ $t('queue.dimensions') }}</dt>
          <dd class="truncate">{{ dimensionLabel }}</dd>
        </div>
      </dl>
    </div>
  </article>
</template>
