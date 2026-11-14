<template>
  <Handle
    :id="handleId || mintProcessSocketHandle(socket)"
    :type="targetSide ? 'target' : 'source'"
    :position="side === 'left' ? Position.Left : side === 'right' ? Position.Right : side === 'top' ? Position.Top : Position.Bottom"
    :class="handleClass"
    :style="processSocketHandleStyle(socket)"
    :aria-label="title || socket.label || ''"
  />
</template>

<script setup>
// The one typed socket handle. COLOR is the only socket channel (canonical
// contract: components/process-designer README, "Node UI contract"): the
// payload family through the shared processDesignerSocketTone mapping,
// events in the primary accent. The mark itself is ONE uniform filled
// circle for every socket — there is no shape vocabulary (no rings,
// diamonds, squares, or outline variants), and a trigger's
// manual-vs-wired state reads from whether a wire is attached.
// `handleId` overrides the minted process-plane id for the declaration
// plane's persisted `input:`/`output:` spellings; a spec-less handle
// degrades to the neutral data tone (the type canvas renders read-only,
// no specs).
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

const targetSide = computed(() => props.side === 'left' || props.side === 'top');

const verticalSide = computed(() => props.side === 'top' || props.side === 'bottom');

const handleClass = computed(() => [
  'designer-socket-handle',
  verticalSide.value
    ? '!left-1/2 !h-[22px] !w-[26px] !-translate-x-1/2'
    : '!top-1/2 !h-[26px] !w-[22px] !-translate-y-1/2',
  props.side === 'left' ? '!left-0 !-translate-x-1/2'
    : props.side === 'right' ? '!right-0 !translate-x-1/2'
      : props.side === 'top' ? '!top-0 !-translate-y-1/2'
        : '!bottom-0 !translate-y-1/2'
]);
</script>
