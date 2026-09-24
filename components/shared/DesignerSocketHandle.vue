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
// filled diamond = declaration binding (type/field wires, the Type pin),
// filled rounded square in the primary accent = event, filled rounded
// square = state/status. COLOR encodes the payload family through the
// shared processDesignerSocketTone mapping; every handle is filled — no
// outline or border tricks. Access (Item/List/Tree) is deliberately NOT
// a shape — one socket accepts all three; access stays a runtime and
// hover fact. `handleId` overrides the minted process-plane id for the
// declaration plane's persisted `input:`/`output:` spellings; a
// spec-less handle degrades to the neutral data tone (the type canvas
// renders read-only, no specs).
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

// Square sockets keep a 3px micro-radius (on a 12px handle) so they read
// as softly beveled, never sharp chips; the diamond is the same square
// rotated 45° (its center — the wire anchor — is rotation-invariant).
const handleClass = computed(() => {
  const kind = processSocketKind(props.socket);
  return [
    '!top-1/2 !h-3 !w-3 !-translate-y-1/2',
    kind === 'data' || kind === 'declaration' ? '!rounded-full' : '!rounded-[3px]',
    kind === 'declaration' ? '!rotate-45' : '',
    props.side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
});
</script>
