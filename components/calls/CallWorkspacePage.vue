<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col p-3">
      <CallPanel :room="room" @closed="$emit('closed')" />
    </div>
    <aside
      v-if="conversationKey"
      class="hidden w-80 shrink-0 flex-col border-l border-chrome-border md:flex"
      :aria-label="$t('support.chatTitle')"
    >
      <ChatSupport embedded :conversation-key="conversationKey" />
    </aside>
  </div>
</template>

<script setup>
import CallPanel from '~/components/calls/CallPanel.vue';
import ChatSupport from '~/components/ChatSupport.vue';

/**
 * Workspace-pane call surface: the LiveKit stage plus the call's own
 * conversation thread in a fixed side rail (meet-style stage + chat). The
 * conversation key derives from the room, so direct and group calls show
 * their persistent app chat; org-room calls render stage-only.
 */
defineProps({
  room: { type: String, required: true },
  conversationKey: { type: String, default: '' }
});

defineEmits(['closed']);
</script>
