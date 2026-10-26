<template>
    <div class="flex flex-col gap-2 border-b border-chrome-border px-3 py-2 md:px-4" data-testid="chat-search-panel">
        <div class="flex items-center gap-1">
            <IconField class="min-w-0 flex-1" icon-position="left">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="query"
                    type="text"
                    size="small"
                    :placeholder="$t('support.searchMessages')"
                    data-testid="chat-search-input"
                />
            </IconField>
            <Button
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                size="small"
                class="shrink-0"
                :aria-label="$t('common.close')"
                data-testid="chat-search-close"
                @click="emit('close')"
            />
        </div>
        <div class="flex items-center gap-1">
            <Select
                v-model="sender"
                :options="senderOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="min-w-0 flex-1"
                :aria-label="$t('support.searchSender')"
                data-testid="chat-search-sender"
            />
            <Select
                v-model="attachmentKind"
                :options="kindOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="min-w-0 flex-1"
                :aria-label="$t('support.searchAttachmentType')"
                data-testid="chat-search-kind"
            />
        </div>
        <div v-if="searching" class="flex items-center justify-center gap-2 py-2 text-muted text-supporting">
            <ProgressSpinner class="h-4 w-4 shrink-0" />
        </div>
        <Listbox
            v-else-if="results.length"
            :options="results"
            :scroll-height="'14rem'"
            data-testid="chat-search-results"
            :focus-on-hover="false"
            @update:model-value="pick"
        >
            <template #option="{ option }">
                <div class="flex min-w-0 flex-col gap-0.5">
                    <div class="flex min-w-0 items-baseline gap-2">
                        <span class="min-w-0 truncate text-label">{{ option.name }}</span>
                        <small class="ml-auto shrink-0 text-muted text-supporting">{{ option.timeLabel }}</small>
                    </div>
                    <span class="min-w-0 truncate text-supporting">{{ option.snippet }}</span>
                </div>
            </template>
        </Listbox>
        <StateBlock
            v-else-if="active"
            :message="$t('support.searchNoResults')"
            icon="pi pi-search"
            class="m-2"
        />
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Select from 'primevue/select'
import Listbox from 'primevue/listbox'
import ProgressSpinner from 'primevue/progressspinner'
import StateBlock from '~/components/shared/StateBlock.vue'
import { stripInstanceTokens } from '#shared/instance-tokens.js'

const props = defineProps({
    conversationKey: { type: String, default: '' },
    participants: { type: Array, default: () => [] },
    viewerId: { type: String, default: '' }
})
const emit = defineEmits(['close', 'jump'])
const { t } = useI18n()

const query = ref('')
const sender = ref('all')
const attachmentKind = ref('all')
const results = ref([])
const searching = ref(false)
let searchToken = 0
let debounceTimer = null

const active = computed(() => Boolean(
    query.value.trim() || sender.value !== 'all' || attachmentKind.value !== 'all'
))

const senderOptions = computed(() => [
    { value: 'all', label: t('support.searchAnySender') },
    ...props.participants
        .filter(participant => String(participant.id) !== String(props.viewerId))
        .map(participant => ({ value: String(participant.id), label: participant.label }))
])

const kindOptions = computed(() => [
    { value: 'all', label: t('support.searchAnyKind') },
    ...['image', 'video', 'audio', 'file'].map(kind => ({
        value: kind,
        label: t(`support.searchKind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)
    }))
])

const participantName = (id) => {
    const participant = props.participants.find(row => String(row.id) === String(id))
    return participant?.label || t('common.user')
}

const snippetOf = (row) => {
    const text = stripInstanceTokens(String(row.message || '')).trim()
    if (text) return text
    const attachment = (row.attachments || [])[0]
    return attachment?.name || attachment?.kind || ''
}

const runSearch = async () => {
    if (!props.conversationKey || !active.value) {
        results.value = []
        return
    }
    const token = ++searchToken
    searching.value = true
    try {
        const response = await $fetch('/api/support/search', {
            query: {
                conversationKey: props.conversationKey,
                q: query.value.trim() || undefined,
                sender: sender.value !== 'all' ? sender.value : undefined,
                attachmentKind: attachmentKind.value !== 'all' ? attachmentKind.value : undefined
            }
        })
        if (token !== searchToken) return
        results.value = (response?.data || []).map(row => ({
            _id: row._id,
            timestamp: row.timestamp,
            name: participantName(row.senderUserId),
            snippet: snippetOf(row),
            timeLabel: row.timestamp ? new Date(row.timestamp).toLocaleString() : ''
        }))
    } catch {
        if (token === searchToken) results.value = []
    } finally {
        if (token === searchToken) searching.value = false
    }
}

watch([query, sender, attachmentKind, () => props.conversationKey], () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runSearch, 300)
}, { immediate: true })

const pick = (option) => {
    if (!option) return
    emit('jump', option)
}

</script>
