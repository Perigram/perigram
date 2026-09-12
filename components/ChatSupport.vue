<template>
    <Drawer
        v-if="!embedded"
        v-model:visible="supportDialog"
        position="right"
        :modal="false"
        :pt="{ header: { style: { display: 'none' } } }"
        :style="{ width: 'min(100vw, var(--ck-support-chat-width))' }"
        :aria-label="$t('support.chatTitle')"
    >
        <SupportChatSurface drawer />
    </Drawer>
    <div v-else class="h-full min-h-0 w-full">
        <SupportChatSurface :embedded="true" :full-page="fullPage" />
    </div>
</template>

<script setup>
import Drawer from 'primevue/drawer'
import SupportChatSurface from '~/components/SupportChatSurface.vue'
import { useSupportDialog } from '~/composables/useModalState'

defineProps({
    embedded: {
        type: Boolean,
        default: false
    },
    fullPage: { type: Boolean, default: false }
})

const supportDialog = useSupportDialog()
</script>
