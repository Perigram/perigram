<template>
  <div class="call-workspace h-full min-h-0">
    <div class="call-workspace__layout flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div class="call-workspace__stage relative flex min-h-0 min-w-0 flex-1 flex-col p-3">
        <!-- Pop out: close this tab and keep the call in the shell's
             absolute floating window instead. -->
        <div class="absolute top-1 right-1 z-10">
          <Button
            icon="pi pi-window-maximize"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="$t('call.popOut')"
            @click="popOut"
          />
        </div>
        <CallPanel :room="room" @closed="$emit('closed')" />
      </div>
      <aside
        v-if="conversationKey"
        class="call-workspace__chat flex shrink-0 grow-0 basis-2/5 flex-col overflow-hidden border-t border-l border-chrome-border"
        :aria-label="$t('support.chatTitle')"
      >
        <ChatSupport embedded :conversation-key="conversationKey" />
      </aside>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import CallPanel from '~/components/calls/CallPanel.vue';
import ChatSupport from '~/components/ChatSupport.vue';
import { useCallsStore } from '~/stores/calls';

/**
 * Workspace-pane call surface: the LiveKit stage plus the call's own
 * conversation thread, meet-style. Responsive to the PANE width (not the
 * viewport) through a container query: wide panes render the chat as a
 * fixed side rail, narrow or split panes stack it below the stage. The
 * conversation key derives from the room, so direct and group calls show
 * their persistent app chat; org-room calls render stage-only. The pop-out
 * control hands the call to the shell's floating window and closes this
 * tab; CallPanel's own `closed` keeps the ordinary leave path.
 */
const props = defineProps({
  room: { type: String, required: true },
  conversationKey: { type: String, default: '' }
});

const emit = defineEmits(['closed']);

const callsStore = useCallsStore();

const popOut = () => {
  callsStore.popOutToFloating(props.room);
  emit('closed');
};
</script>

<style scoped>
.call-workspace {
  container-type: inline-size;
}

@container (min-width: 44rem) {
  .call-workspace__layout {
    flex-direction: row;
  }

  .call-workspace__chat {
    flex: none;
    width: 20rem;
  }
}
</style>
