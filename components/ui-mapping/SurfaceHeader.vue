<template>
  <div :class="[LAYOUT.stackTight, LAYOUT.headerBar]">
    <div :class="LAYOUT.headerRow">
      <div :class="LAYOUT.row">
        <Avatar :icon="type?.render?.icon || 'pi pi-circle'" shape="circle" size="large" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <span :class="TYPE_BY_LEVEL[props.level] || 'text-section-heading'" class="truncate">{{ identity }}</span>
          <span class="text-supporting text-muted truncate">{{ type?.render?.label }} · {{ instance.id }}</span>
        </div>
        <Tag v-if="status" :value="status.label" :severity="status.severity" />
      </div>
      <div :class="LAYOUT.row">
        <Button
          v-if="editable"
          :label="editing ? $t('uiMapping.save') : $t('uiMapping.edit')"
          :icon="editing ? 'pi pi-check' : 'pi pi-pencil'"
          size="small"
          :severity="editing ? undefined : 'secondary'"
          :text="!editing"
          @click="$emit('toggle-edit')"
        />
        <ActionButton
          v-for="action in actions"
          :key="action.id"
          :action="action"
          :render="type?.render"
          @run="$emit('run', action)"
        />
      </div>
    </div>
    <StateStrip v-if="type?.states?.main" :type="type" :instance="instance" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { LAYOUT, TYPE_BY_LEVEL, SEVERITY_MAP, instanceIdentity } from '#shared/ui-mapping/index.js';
import ActionButton from './ActionButton.vue';
import StateStrip from './StateStrip.vue';

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  level: { type: Number, default: 0 },
  editable: { type: Boolean, default: false },
  editing: { type: Boolean, default: false }
});

defineEmits(['run', 'toggle-edit']);

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identity = computed(() => instanceIdentity(props.type, props.instance));
const status = computed(() => {
  const value = props.instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
});
</script>
