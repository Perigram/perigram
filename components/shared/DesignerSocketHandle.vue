<template>
  <Handle
    :id="handleId || mintProcessSocketHandle(socket)"
    :type="side === 'left' ? 'target' : 'source'"
    :position="side === 'left' ? Position.Left : Position.Right"
    :class="handleClass"
    :style="processSocketHandleStyle(socket, wired)"
    :aria-label="title || socket.label || ''"
  />
</template>

<script setup>
// The one typed socket handle. SHAPE encodes what kind of thing the
// socket deals in (canonical contract: components/process-designer
// README, "Node UI contract"): filled dot = instance/value data, filled
// diamond = declaration binding (type/field wires, the Type pin), filled
// square = state/status, RING = event/trigger — outline ring when the
// trigger is manual (unwired), filled ring when wired (the effect fires
// automatically; `wired` is the card's connected-input fact, outputs
// render filled — they emit, they do not trigger). COLOR encodes the
// payload family through the shared processDesignerSocketTone mapping.
// Access (Item/List/Tree) is deliberately NOT a shape — one socket
// accepts all three; access stays a runtime and hover fact. `handleId`
// overrides the minted process-plane id for the declaration plane's
// persisted `input:`/`output:` spellings; a spec-less handle degrades to
// the neutral data tone (the type canvas renders read-only, no specs).
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { mintProcessSocketHandle } from '~/packages/processes/src/index.js';
import { processSocketHandleStyle, processSocketKind } from '~/utils/processDesignerSocketTone.js';

const props = defineProps({
  socket: { type: Object, default: () => ({}) },
  side: { type: String, default: 'left' },
  handleId: { type: String, default: '' },
  title: { type: String, default: '' },
  // The card's connected-input fact for this socket: an unwired event
  // INPUT renders the outline (manual) ring; wired or source-side event
  // sockets render the filled ring. Ignored for every other kind.
  wired: { type: Boolean, default: false }
});

// Shape geometry (node UI contract): the event ring and the data dot are
// round; status keeps a 3px micro-radius square (softly beveled, never a
// sharp chip); the declaration diamond is the same square rotated 45°
// (its center — the wire anchor — is rotation-invariant).
const handleClass = computed(() => {
  const kind = processSocketKind(props.socket);
  return [
    '!top-1/2 !h-3 !w-3 !-translate-y-1/2',
    kind === 'data' || kind === 'declaration' || kind === 'event' ? '!rounded-full' : '!rounded-[3px]',
    kind === 'declaration' ? '!rotate-45' : '',
    props.side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
});
</script>
