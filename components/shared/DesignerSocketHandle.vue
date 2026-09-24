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
// The one typed socket handle. SHAPE encodes what kind of thing the
// socket deals in (canonical contract: components/process-designer
// README, "Node UI contract"): filled circle = instance/value data,
// hollow ring = declaration binding (type/field wires), outline square =
// event, filled square = state/status. COLOR encodes the payload family
// through the shared processDesignerSocketTone mapping. Access
// (Item/List/Tree) is deliberately NOT a shape — one socket accepts all
// three; access stays a runtime and hover fact. `handleId` overrides the
// minted process-plane id for the declaration plane's persisted
// `input:`/`output:` spellings; a spec-less handle degrades to the
// neutral data tone (the type canvas renders read-only, no specs).
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { mintProcessSocketHandle } from '~/packages/processes/src/index.js';
import { processSocketHandleStyle, processSocketKind } from '~/utils/processDesignerSocketTone.js';

const props = defineProps({
  socket: { type: Object, default: () => ({}) },
  side: { type: String, default: 'left' },
  handleId: { type: String, default: '' },
  title: { type: String, default: '' }
});

const handleClass = computed(() => {
  const kind = processSocketKind(props.socket);
  return [
    '!top-1/2 !h-3 !w-3 !-translate-y-1/2',
    kind === 'data' || kind === 'declaration' ? '!rounded-full' : '!rounded-none',
    props.side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
});
</script>
