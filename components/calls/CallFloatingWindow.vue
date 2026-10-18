<template>
  <!-- The floating call window: a detached call tab above the app,
       independent of routes and panes. Docking returns the call to a home
       workspace tab. -->
  <FloatingSurface
    :visible="Boolean(callsStore.floatingRoom)"
    storage-key="perigram:call-window-size"
  >
    <template #header>
      <i class="pi pi-phone shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate text-label">{{ roomLabel }}</span>
      <Button
        icon="pi pi-window-maximize"
        severity="secondary"
        text
        rounded
        size="small"
        :aria-label="$t('call.dock')"
        @click="dock"
      />
      <Button
        icon="pi pi-times"
        severity="secondary"
        text
        rounded
        size="small"
        :aria-label="$t('common.close')"
        @click="callsStore.closeFloating()"
      />
    </template>
    <CallPanel v-if="callsStore.floatingRoom" :room="callsStore.floatingRoom" @closed="callsStore.closeFloating()" />
  </FloatingSurface>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue';
import Button from 'primevue/button';
import FloatingSurface from '~/components/shared/FloatingSurface.vue';
// The panel chunk loads only when a floating room actually exists.
const CallPanel = defineAsyncComponent(() => import('~/components/calls/CallPanel.vue'));
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '~/stores/calls';
import { useAuthStore } from '~/stores/auth';
import { useSupportChatStore } from '~/stores/supportChat';
import { useCallRouting } from '~/composables/useCallRouting.js';
import { callRoomLabel } from '~/utils/call-rooms.js';

const callsStore = useCallsStore();
const authStore = useAuthStore();
const supportChatStore = useSupportChatStore();
const { t } = useI18n();
const { openCallInWorkspaceTab } = useCallRouting();

// The header names the call (conversation or caller), not the generic
// word — same resolver the home sidebar rows use.
const roomLabel = computed(() => callRoomLabel(callsStore.floatingRoom, supportChatStore.conversations, {
  userId: authStore.userData?.userId,
  orgName: authStore.organizationData?.identity?.name || undefined,
  fallback: t('call.title')
}));

const dock = () => {
  const room = callsStore.floatingRoom;
  if (!room) return;
  // The transfer flag makes the unmounting floating panel park the live
  // connection; openCallInWorkspaceTab then routes to the home tab whose
  // panel adopts it (or back to floating when no workspace exists).
  callsStore.beginTransferToTab(room);
  openCallInWorkspaceTab(room);
};
</script>
