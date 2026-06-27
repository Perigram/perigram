<template>
  <div v-if="visibleRelations.length" class="flex flex-col gap-3">
    <div
      v-for="relation in visibleRelations"
      :key="`${relation.path}:${relation.label}`"
      class="flex min-w-0 flex-col gap-1"
    >
      <small class="text-muted-color">{{ relation.label }}</small>
      <div class="flex min-w-0 items-start gap-2">
        <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          <EntityInlineRef
            v-for="item in relation.previewItems"
            :key="`${relation.path}:${item.entityType}:${item.id}`"
            :type="item.entityType"
            :id="item.id"
            :entity="item.entity || null"
          />
        </div>
        <Tag
          v-if="relation.hiddenCount"
          :value="`+${relation.hiddenCount}`"
          severity="secondary"
          size="small"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { resolveDataPath } from '~/utils/data-display.js';
import { resolveEntityRelationRefs } from '~/utils/entity-relations.js';

const props = defineProps({
  entity: { type: Object, required: true },
  fields: { type: Array, default: () => [] }
});

const { t } = useI18n();
const PREVIEW_LIMIT = 4;

const visibleRelations = computed(() => props.fields
  .filter(field => field.display === 'entityRef' || field.display === 'entityRefList')
  .map(field => ({
    ...field,
    label: field.i18n ? t(field.i18n) : field.path,
    items: field.items || resolveEntityRelationRefs(resolveDataPath(props.entity, field.path), field)
  }))
  .map(relation => ({
    ...relation,
    previewItems: relation.items.slice(-PREVIEW_LIMIT),
    hiddenCount: Math.max(relation.items.length - PREVIEW_LIMIT, 0)
  }))
  .filter(relation => relation.previewItems.length)
);
</script>
