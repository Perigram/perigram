<template>
    <!-- The thread stage shared by every host: the message list, the
         floating scroll-to-end control, the composer, the attachment
         picker, and the two dialogs the thread's own affordances open
         (the create-and-attach prompt, the forward picker). The host owns
         position and chrome; the stage is the bounded thread column. -->
    <section
        class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        @dragenter="onFilesDragEnter"
        @dragover="onFilesDragOver"
        @dragleave="onFilesDragLeave"
        @drop="onFilesDrop"
    >
        <!-- Drop area: file drags over the thread stage the dropped
             set through the composer's own attachment flow (caps,
             instance-chat gating included). -->
        <div
            v-if="filesDragging"
            class="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-2 rounded-ui border-2 border-dashed border-chrome-border bg-content text-center"
            data-testid="chat-drop-zone"
        >
            <i class="pi pi-upload text-[1.25rem] text-muted" aria-hidden="true" />
            <span class="text-label">{{ t('support.dropFiles') }}</span>
        </div>
        <ChatMessageList :thread="thread" />
        <span v-if="!atBottom" class="absolute bottom-24 right-3 z-10" data-testid="chat-scroll-to-end">
            <Button
                icon="pi pi-arrow-down"
                severity="primary"
                rounded
                size="small"
                :aria-label="t('support.scrollToEnd')"
                @click="scrollToBottomFromControl"
            />
            <span
                v-if="waitingMessages"
                class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-ui bg-primary px-1 text-label text-primary-contrast"
            >
                {{ waitingMessages }}
            </span>
        </span>
        <ChatComposer :thread="thread" :full-page="fullPage" />
        <ChatAttachmentPicker
            ref="attachmentPicker"
            :files-enabled="chatUploadEnabled"
            :files-accept="chatFileAcceptAttr"
            @select="selectAttachment"
            @create-action="runCreateAction"
            @files="stageChatFiles"
        />
        <StandardDialog
            v-model:visible="createPromptVisible"
            size="sm"
            :show-default-footer="true"
            :save-label="pendingCreateActionLabel"
            :cancel-label="t('common.cancel')"
            :loading="executingCreate"
            :title="pendingCreateActionLabel"
            @save="submitCreatePrompt"
            @cancel="createPromptVisible = false; pendingCreateAction = null"
        >
            <div class="flex flex-col gap-3">
                <label v-for="field in createPromptFields" :key="field.id" class="flex flex-col gap-1">
                    <span class="text-muted text-supporting">{{ field.label || field.id }}</span>
                    <Select
                        v-if="field.type === 'instance'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :type-id="field.typeId || field.accepts?.[0] || ''"
                        filter
                        class="w-full"
                    />
                    <InstanceMultiSelect
                        v-else-if="field.type === 'typeList'"
                        v-model="createPromptValues[field.id]"
                        :options="createPromptOptions[field.id] || []"
                        option-label="label"
                        option-value="value"
                        :type-id="field.typeId || field.accepts?.[0] || ''"
                        filter
                        class="w-full"
                    />
                    <Select
                        v-else-if="field.type === 'enum'"
                        v-model="createPromptValues[field.id]"
                        :options="field.options || []"
                        class="w-full"
                    />
                    <ToggleSwitch
                        v-else-if="field.type === 'boolean'"
                        v-model="createPromptValues[field.id]"
                    />
                    <div v-else-if="field.type === 'file'" class="flex items-center gap-2">
                        <input
                            :ref="el => setPayloadInputEl(field.id, el)"
                            class="hidden"
                            type="file"
                            :accept="field.accept || undefined"
                            :capture="field.capture || undefined"
                            @change="event => uploadPayloadFile(field, event)"
                        >
                        <Button
                            icon="pi pi-upload"
                            :label="t('common.upload')"
                            size="small"
                            severity="secondary"
                            outlined
                            :loading="uploadingPayloadField === field.id"
                            @click="payloadInputEl(field.id)?.click()"
                        />
                        <span v-if="createPromptValues[field.id]?.name" class="text-muted text-supporting truncate">{{ createPromptValues[field.id].name }}</span>
                    </div>
                    <DatePicker
                        v-else-if="field.type === 'date' || field.type === 'dateTime'"
                        v-model="createPromptValues[field.id]"
                        :show-time="field.type === 'dateTime'"
                        hour-format="24"
                        class="w-full"
                    />
                    <InputText
                        v-else
                        v-model="createPromptValues[field.id]"
                        :type="field.type === 'number' ? 'number' : 'text'"
                    />
                </label>
            </div>
        </StandardDialog>
        <StandardDialog
            v-model:visible="forwardDialog"
            size="sm"
            :show-default-footer="false"
            :title="t('support.forwardTo')"
        >
            <div class="flex flex-col gap-3" data-testid="chat-forward-picker">
                <StateBlock
                    v-if="!forwardOptions.length"
                    :message="t('support.noConversations')"
                    icon="pi pi-comments"
                />
                <Listbox
                    v-else
                    :model-value="null"
                    :options="forwardOptions"
                    option-label="label"
                    option-value="conversationKey"
                    data-key="conversationKey"
                    :aria-label="t('support.forwardTo')"
                    class="border-0"
                    :loading="forwarding"
                    @update:model-value="key => forwardToConversation(key)"
                >
                    <template #option="{ option }">
                        <div class="flex min-w-0 items-center gap-2">
                            <AiAvatar v-if="isAiChatRow(option) || isBotDirectRow(option)" class="shrink-0" />
                            <Avatar
                                v-else-if="option.conversationKind === 'group'"
                                icon="pi pi-users"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted"
                            />
                            <Avatar
                                v-else-if="option.conversationKind === 'instance'"
                                :icon="instanceConversationIcon(option)"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted"
                            />
                            <Avatar
                                v-else
                                :image="conversationAvatar(option)"
                                :label="conversationAvatar(option) ? null : conversationLabel(option).charAt(0).toUpperCase()"
                                shape="circle"
                                class="shrink-0 bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                            />
                            <span class="min-w-0 flex-1 truncate text-label">{{ conversationLabel(option) }}</span>
                        </div>
                    </template>
                </Listbox>
            </div>
        </StandardDialog>
    </section>
</template>

<script setup>
import AiAvatar from '~/components/shared/AiAvatar.vue'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import ChatAttachmentPicker from '~/components/shared/ChatAttachmentPicker.vue'
import ChatComposer from '~/components/chat/ChatComposer.vue'
import ChatMessageList from '~/components/chat/ChatMessageList.vue'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import InstanceMultiSelect from '~/components/shared/InstanceMultiSelect.vue'
import Listbox from 'primevue/listbox'
import Select from '~/components/shared/InstanceSelect.vue'
import StandardDialog from '~/components/shared/StandardDialog.vue'
import StateBlock from '~/components/shared/StateBlock.vue'
import ToggleSwitch from 'primevue/toggleswitch'
import { useI18n } from 'vue-i18n'

// The template refs bind through the bag (the chat state law): the
// picker ref the composer's attach button opens lives in the bag, so the
// binding works in whichever SFC hosts the stage.
const props = defineProps({
    // The useChatThread bag (useChatThread.js) — every binding below
    // destructures from it.
    thread: { type: Object, required: true },
    fullPage: { type: Boolean, default: false }
})

const { t } = useI18n()
const {
    atBottom, attachmentPicker, chatFileAcceptAttr, chatUploadEnabled, conversationAvatar,
    conversationLabel, createPromptFields, createPromptOptions, createPromptValues,
    createPromptVisible, executingCreate, filesDragging, forwardDialog, forwardOptions,
    forwardToConversation, forwarding, instanceConversationIcon, isAiChatRow, isBotDirectRow,
    onFilesDragEnter, onFilesDragLeave, onFilesDragOver, onFilesDrop, payloadInputEl,
    pendingCreateAction, pendingCreateActionLabel, runCreateAction, scrollToBottomFromControl,
    selectAttachment, setPayloadInputEl, stageChatFiles, submitCreatePrompt, uploadPayloadFile,
    uploadingPayloadField, waitingMessages
} = props.thread
</script>
