<template>
    <!-- The one full-screen call dialog (calls README · Surface routing):
         the bounded `fill` host for mobile invites, chat-hosted calls, and
         the parked-call expansion. The header names the conversation or
         caller; the panel owns every pixel below it. Closing the dialog
         keeps the session live — the desktop floating window or the mobile
         lane takes it (SPEC §11). -->
    <StandardDialog
        v-model:visible="visibleModel"
        size="full"
        fill
        :show-default-footer="false"
        :title="label"
        data-testid="call-dialog"
    >
        <div class="flex min-h-0 flex-1 flex-col">
            <CallPanel
                v-if="visibleModel && room"
                :key="room"
                :room="room"
                placement="dialog"
                @closed="visibleModel = false"
            />
        </div>
    </StandardDialog>
</template>

<script setup>
import { computed } from 'vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import CallPanel from '~/components/calls/CallPanel.vue';

const props = defineProps({
    visible: { type: Boolean, default: false },
    room: { type: String, default: '' },
    label: { type: String, default: '' }
});

const emit = defineEmits(['update:visible']);

const visibleModel = computed({
    get: () => props.visible,
    set: value => emit('update:visible', value)
});
</script>
