<template>
  <Handle
    :id="handleId || mintProcessSocketHandle(socket)"
    :type="side === 'left' ? 'target' : 'source'"
    :position="side === 'left' ? Position.Left : Position.Right"
    :class="handleClass"
    :style="processSocketHandleStyle(socket)"
    :aria-label="title || socket.label || ''"
  />
</template>

<script setup>
// The one typed socket handle. Tone (transported base type) and shape
// (Item/List/Tree access) come from the port spec through the shared
// processDesignerSocketTone mapping, so a type has one semantic look on
// every card it appears on — operation nodes and declaration nodes alike.
// `handleId` overrides the minted process-plane id for the declaration
// plane's persisted `input:`/`output:` spellings; `socket` may be absent
// (a spec-less handle renders with the neutral data tone).
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { mintProcessSocketHandle } from '~/packages/processes/src/index.js';
import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';

const props = defineProps({
  socket: { type: Object, default: () => ({}) },
  side: { type: String, default: 'left' },
  handleId: { type: String, default: '' },
  title: { type: String, default: '' }
});

const handleClass = computed(() => [
  '!top-1/2 !h-3 !w-3 !-translate-y-1/2',
  props.socket.access === 'tree' ? '!rounded-none' : props.socket.access === 'list' ? '!rounded-sm' : '!rounded-full',
  props.side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
]);
</script>
