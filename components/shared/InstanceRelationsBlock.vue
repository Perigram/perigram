<template>
  <div v-if="visibleRelations.length" class="flex flex-col gap-3">
    <div
      v-for="relation in visibleRelations"
      :key="`${relation.path}:${relation.label}`"
      class="flex min-w-0 flex-col gap-1"
    >
      <small class="text-muted">{{ relation.label }}</small>
      <div class="flex min-w-0 items-start gap-2">
        <div
          class="min-w-0 flex-1"
          :class="galleryClass"
        >
          <InstanceInlineRef
            v-for="item in relation.previewItems"
            :key="`${relation.path}:${item.typeId}:${item.id}`"
            :class="itemClass"
            :type="item.typeId"
            :id="item.id"
            :entity="item.entity || null"
            :variant="itemVariant"
            :context-action-entries="unlinkEntries(relation, item)"
          />
          <Button
            v-if="relation.hiddenCount && isCompactGallery"
            :label="`+${relation.hiddenCount}`"
            severity="secondary"
            size="small"
            outlined
            class="instance-relations-overflow-tile"
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
    <Popover ref="overflowPopover">
      <div class="flex max-w-[min(22rem,calc(100vw-3rem))] flex-wrap gap-2 p-2">
        <InstanceInlineRef
          v-for="item in overflowItems"
          :key="`overflow:${item.typeId}:${item.id}`"
          class="max-w-[12rem]"
          :type="item.typeId"
          :id="item.id"
          :entity="item.entity || null"
          :variant="itemVariant"
          :context-action-entries="unlinkEntries(overflowRelation, item)"
        />
      </div>
    </Popover>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { resolveDataPath } from '~/utils/data-display.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  fields: { type: Array, default: () => [] },
  itemVariant: { type: String, default: 'inline' }
});

const { t } = useI18n();
const authStore = useAuthStore();
const overflowPopover = ref();
const overflowRelation = ref(null);
const isCompactGallery = computed(() => props.itemVariant === 'compact');
const previewLimit = computed(() => isCompactGallery.value ? 2 : 4);
const galleryClass = computed(() => isCompactGallery.value
  ? 'instance-relations-gallery instance-relations-gallery--compact'
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
    items: field.items || resolveInstanceRelationRefs(resolveDataPath(props.entity, field.path), field)
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

function unlinkEntries(relation = {}, item = {}) {
  const key = relation.path?.split('.').filter(Boolean).at(-1) || '';
  if (!key || !item.id) return [];
  return authStore.actionManifest
    .filter(action => (
      action.typeId === props.typeId
      && action.relationMutation?.operation === 'unlink'
      && action.relationMutation?.key === key
      && [].concat(action.relationMutation?.targetTypes || []).includes(item.typeId)
    ))
    .map(action => ({
      action,
      entity: props.entity,
      context: {
        data: {
          relations: {
            [key]: { type: item.typeId, id: item.id }
          }
        }
      }
    }));
}
</script>
