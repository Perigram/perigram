<template>
  <div :class="bodyClass">
    <component
      :is="detailOverload.component"
      v-if="detailOverload"
      v-bind="detailOverloadProps"
      @refresh="$emit('refresh')"
      @saved="$emit('refresh')"
    />
    <template v-else>
      <GeneratedFilePreview :entity="entity" :type-id="typeId" />
      <InstanceSurfaceContent
        :entity="entity"
        :type-id="typeId"
        :surface="surface"
        :display-overrides="displayOverrides"
        :relation-variant="relationVariant"
        :suppress-child-summaries="suppressChildSummaries"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
import GeneratedFilePreview from '~/components/generated/GeneratedFilePreview.vue';
import { useAuthStore } from '~/stores/auth';
import { hasPermissionGrant } from '#shared/access-control.js';
import { resolveGeneratedInstanceDetailOverload } from '~/components/generated/overloads.js';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  surface: { type: String, default: 'detail' },
  screenKey: { type: String, default: '' },
  actions: { type: Array, default: () => [] },
  mode: { type: String, default: 'page' },
  displayOverrides: { type: Object, default: null },
  relationVariant: { type: String, default: 'inline' },
  suppressChildSummaries: { type: Boolean, default: false }
});

defineEmits(['refresh']);

const authStore = useAuthStore();
const detailOverload = computed(() => resolveGeneratedInstanceDetailOverload(props.typeId));
const detailActions = computed(() => uniqueActions(props.actions));
const canEditSheetDesign = computed(() => hasPermissionGrant({
  permissions: authStore.activePermissions,
  feature: 'sheet_designs',
  level: 'write',
  entity: props.entity,
  typeId: 'sheet_design'
}));
const detailOverloadProps = computed(() => detailOverload.value?.props?.({
  entity: props.entity,
  screenKey: props.screenKey,
  canEditSheetDesign: canEditSheetDesign.value,
  mode: props.mode
}) || {});
const bodyClass = computed(() => {
  if (props.mode !== 'file') return '';
  return detailOverload.value
    ? 'h-full min-h-0 min-w-0 overflow-hidden'
    : 'h-full min-h-0 min-w-0 overflow-y-auto p-2';
});

function uniqueActions(actions = []) {
  return Array.from(new Map(actions
    .filter(Boolean)
    .map(action => [action.id, action])
  ).values());
}
</script>
