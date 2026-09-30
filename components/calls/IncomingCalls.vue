<template>
    <!-- New calls only: live incoming invites as floating cards. Ongoing
         rooms are listed in the home sidebar and inside chats instead. -->
    <div v-if="callsStore.incoming.length" class="pointer-events-none fixed inset-x-0 top-3 z-[1000] flex flex-col items-center gap-2 px-3">
        <div
            v-for="invite in callsStore.incoming"
            :key="invite.id"
            class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-ui border border-content-border bg-content p-3 shadow-overlay"
            role="alert"
        >
            <Avatar
                :label="invite.fromName?.charAt(0)?.toUpperCase() || '?'"
                shape="circle"
                class="shrink-0 bg-primary text-primary-contrast"
            />
            <span class="min-w-0 flex-1 truncate text-body">
                {{ $t('call.incoming', { name: invite.fromName || '' }) }}
            </span>
            <Button
                icon="pi pi-phone"
                severity="danger"
                rounded
                size="small"
                :aria-label="$t('call.join')"
                @click="joinInvite(invite)"
            />
            <Button
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('call.decline')"
                @click="callsStore.dismissIncoming(invite.room)"
            />
        </div>
    </div>

    <!-- Mobile fallback: no workspace tabs on mobile, so the accepted call
         opens the full-screen dialog. -->
    <StandardDialog
        v-model:visible="callDialog"
        :header="$t('call.title')"
        size="full"
        :show-default-footer="false"
    >
        <div class="flex h-preview-dialog flex-col">
            <CallPanel v-if="callDialog && callRoom" :key="callRoom" :room="callRoom" @closed="callDialog = false" />
        </div>
    </StandardDialog>
</template>

<script setup>
import { ref } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import CallPanel from '~/components/calls/CallPanel.vue';
import { useCallsStore } from '~/stores/calls';
import { useCallRouting } from '~/composables/useCallRouting.js';

const callsStore = useCallsStore();
const { isMobileViewport, openCallInWorkspaceTab } = useCallRouting();

const callDialog = ref(false);
const callRoom = ref('');

const joinInvite = (invite) => {
    callsStore.dismissIncoming(invite.room);
    if (!invite.room) return;
    if (isMobileViewport()) {
        callRoom.value = invite.room;
        callDialog.value = true;
        return;
    }
    openCallInWorkspaceTab(invite.room);
};
</script>
