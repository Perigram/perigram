<template>
  <div :class="[LAYOUT.stackTight, LAYOUT.headerBar]">
    <div :class="LAYOUT.rowBetween">
      <div :class="LAYOUT.row">
        <Avatar :icon="type?.render?.icon || 'pi pi-circle'" shape="circle" size="large" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-section-heading truncate">{{ identity }}</span>
          <span class="text-supporting text-muted">{{ type?.render?.label }} · {{ instance.id }}</span>
        </div>
        <Tag v-if="status" :value="status.label" :severity="status.severity" />
      </div>
      <div v-if="actions.length" :class="LAYOUT.row">
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
import { LAYOUT, SEVERITY_MAP, instanceIdentity } from '#shared/ui-mapping/index.js';
import ActionButton from './ActionButton.vue';
import StateStrip from './StateStrip.vue';

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] }
});

defineEmits(['run']);

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identity = computed(() => instanceIdentity(props.type, props.instance));
const status = computed(() => {
  const value = props.instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
});
</script>
