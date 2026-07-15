<template>
  <div v-if="visibleRelations.length" class="flex flex-col gap-3">
    <div
      v-for="relation in visibleRelations"
      :key="`${relation.path}:${relation.label}`"
      class="flex min-w-0 flex-col gap-1"
    >
      <small class="text-muted-color">{{ relation.label }}</small>
      <div class="flex min-w-0 items-start gap-2">
        <div
          class="min-w-0 flex-1"
          :class="galleryClass"
        >
          <span
            v-for="item in relation.previewItems"
            :key="`${relation.path}:${item.entityType}:${item.id}:${item.revisionId || ''}`"
            :class="itemClass"
            class="inline-flex min-w-0 items-center gap-1"
          >
            <EntityInlineRef
              :type="item.entityType"
              :id="item.id"
              :entity="item.entity || null"
              :variant="itemVariant"
            />
            <EntityInlineRef
              v-if="item.revisionId"
              type="entityRevision"
              :id="item.revisionId"
              variant="inline"
              class="max-w-24"
            />
          </span>
          <Button
            v-if="relation.hiddenCount && isCompactGallery"
            :label="`+${relation.hiddenCount}`"
            severity="secondary"
            size="small"
            outlined
            class="entity-relations-overflow-tile"
            :aria-label="$t('common.more')"
            @click.stop="openOverflow($event, relation)"
          />
        </div>
        <Button
          v-if="relation.hiddenCount && !isCompactGallery"
          :label="`+${relation.hiddenCount}`"
          severity="secondary"
          size="small"
          outlined
          class="shrink-0"
          :aria-label="$t('common.more')"
          @click.stop="openOverflow($event, relation)"
        />
      </div>
    </div>
    <Popover ref="overflowPopover" class="[box-shadow:var(--ck-shadow-overlay)] border border-content-border">
      <div class="flex max-w-[min(22rem,calc(100vw-3rem))] flex-wrap gap-2 p-2">
        <span
          v-for="item in overflowItems"
          :key="`overflow:${item.entityType}:${item.id}:${item.revisionId || ''}`"
          class="max-w-[12rem]"
        >
          <EntityInlineRef
            :type="item.entityType"
            :id="item.id"
            :entity="item.entity || null"
            :variant="itemVariant"
          />
          <EntityInlineRef v-if="item.revisionId" type="entityRevision" :id="item.revisionId" variant="inline" />
        </span>
      </div>
    </Popover>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { resolveDataPath } from '~/utils/data-display.js';
import { resolveEntityRelationRefs } from '~/utils/entity-relations.js';

const props = defineProps({
  entity: { type: Object, required: true },
  fields: { type: Array, default: () => [] },
  itemVariant: { type: String, default: 'inline' }
});

const { t } = useI18n();
const overflowPopover = ref();
const overflowRelation = ref(null);
const isCompactGallery = computed(() => props.itemVariant === 'compact');
const previewLimit = computed(() => isCompactGallery.value ? 2 : 4);
const galleryClass = computed(() => isCompactGallery.value
  ? 'entity-relations-gallery entity-relations-gallery--compact'
  : 'flex flex-nowrap gap-2 overflow-x-auto pb-1'
);
const itemClass = computed(() => isCompactGallery.value
  ? 'min-w-0'
  : 'max-w-[12rem] shrink-0'
);

const visibleRelations = computed(() => props.fields
  .filter(field => field.display === 'entityRef' || field.display === 'entityRefList')
  .map(field => ({
    ...field,
    label: field.i18n ? t(field.i18n) : field.path,
    items: field.items || resolveEntityRelationRefs(resolveDataPath(props.entity, field.path), field)
  }))
  .map(relation => ({
    ...relation,
    previewItems: relation.items.slice(-previewLimit.value),
    overflowItems: relation.items.slice(0, Math.max(relation.items.length - previewLimit.value, 0)),
    hiddenCount: Math.max(relation.items.length - previewLimit.value, 0)
  }))
  .filter(relation => relation.previewItems.length)
);

const overflowItems = computed(() => overflowRelation.value?.overflowItems || []);

function openOverflow(event, relation) {
  overflowRelation.value = relation;
  overflowPopover.value?.toggle(event);
}
</script>
