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
                :image="invite.fromAvatarUrl || null"
                :label="invite.fromAvatarUrl ? null : (invite.fromName?.charAt(0)?.toUpperCase() || '?')"
                shape="circle"
                class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
            />
            <div class="min-w-0 flex-1">
                <div class="truncate text-body">
                    {{ $t('call.incoming', { name: invite.fromName || '' }) }}
                </div>
                <!-- Group/instance rings name the conversation; a direct
                     ring is the caller alone, so no context line. -->
                <small
                    v-if="inviteContext(invite)"
                    class="block truncate text-muted text-supporting"
                >
                    {{ inviteContext(invite) }}
                </small>
            </div>
            <Button
                icon="pi pi-phone"
                severity="success"
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
    <CallDialog
        v-model:visible="callDialog"
        :room="callRoom"
        :label="callHeaderLabel || $t('call.title')"
    />
</template>

<script setup>
import { ref } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import CallDialog from '~/components/calls/CallDialog.vue';
import { useCallsStore } from '~/stores/calls';
import { useCallRouting } from '~/composables/useCallRouting.js';
import { useCallRoomLabel } from '~/composables/useCallRoomLabel.js';

const callsStore = useCallsStore();
const { isMobileViewport, openCallInWorkspaceTab } = useCallRouting();

const callRoomLabel = useCallRoomLabel();
// The ringing conversation's label when it differs from the caller: the
// shared room-label resolver over the loaded conversations.
const inviteContext = (invite = {}) => {
    const label = callRoomLabel(invite.room, '').trim();
    if (!label || !invite.fromName) return '';
    return label.toLowerCase() === String(invite.fromName).toLowerCase() ? '' : label;
};

const callDialog = ref(false);
const callRoom = ref('');
const callHeaderLabel = ref('');

const joinInvite = (invite) => {
    callsStore.dismissIncoming(invite.room);
    if (!invite.room) return;
    if (isMobileViewport()) {
        callRoom.value = invite.room;
        callHeaderLabel.value = invite.fromName || '';
        callDialog.value = true;
        return;
    }
    openCallInWorkspaceTab(invite.room);
};
</script>
