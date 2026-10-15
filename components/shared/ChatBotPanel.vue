<template>
    <StandardDialog
        v-model:visible="visible"
        size="sm"
        :show-default-footer="false"
        data-testid="chat-bot-panel"
    >
        <template #header>
            <span>{{ $t('support.bots.title') }}</span>
        </template>
        <div class="flex min-w-0 flex-col gap-3">
            <div v-if="creating" class="flex items-center gap-2">
                <InputText
                    v-model="newBotName"
                    type="text"
                    class="min-w-0 flex-1"
                    :placeholder="$t('support.bots.namePlaceholder')"
                    :aria-label="$t('support.bots.namePlaceholder')"
                    data-testid="chat-bot-name"
                    @keydown.enter="createBot"
                />
                <Button
                    icon="pi pi-plus"
                    severity="secondary"
                    outlined
                    :aria-label="$t('common.create')"
                    :loading="saving"
                    :disabled="!newBotName.trim()"
                    data-testid="chat-bot-create"
                    @click="createBot"
                />
            </div>
            <div v-if="issuedToken" class="flex items-center gap-2">
                <InputText
                    :model-value="issuedToken"
                    readonly
                    class="min-w-0 flex-1 text-technical"
                    :aria-label="$t('support.bots.token')"
                    data-testid="chat-bot-token"
                />
                <Button
                    icon="pi pi-copy"
                    severity="secondary"
                    text
                    rounded
                    :aria-label="$t('common.copy')"
                    @click="copyToken"
                />
            </div>
            <div v-if="loading" class="flex items-center justify-center p-3">
                <i class="pi pi-spin pi-spinner text-muted" aria-hidden="true" />
            </div>
            <Listbox
                v-else-if="bots.length"
                :model-value="null"
                :options="bots"
                option-label="name"
                class="border-0"
                data-testid="chat-bot-list"
            >
                <template #option="{ option }">
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                        <Avatar
                            :image="option.avatarUrl || null"
                            :label="!option.avatarUrl ? String(option.name || '?').charAt(0).toUpperCase() : null"
                            shape="circle"
                            class="shrink-0 bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                        />
                        <span class="min-w-0 flex-1 truncate text-label">{{ option.name }}</span>
                        <ToggleSwitch
                            v-if="canToggle"
                            :model-value="option.subscribed"
                            :aria-label="$t('support.bots.toggleInConversation')"
                            :data-testid="`chat-bot-subscribe-${option.id}`"
                            @update:model-value="setSubscribed(option, $event)"
                        />
                        <Button
                            icon="pi pi-key"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('support.bots.rotateToken')"
                            @click.stop="rotateToken(option)"
                        />
                        <Button
                            icon="pi pi-trash"
                            severity="danger"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('common.delete')"
                            @click.stop="requestDelete(option)"
                        />
                    </div>
                </template>
            </Listbox>
            <div v-else class="text-muted text-body">{{ $t('support.bots.empty') }}</div>
        </div>
    </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Listbox from 'primevue/listbox';
import ToggleSwitch from 'primevue/toggleswitch';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAgentBotsStore } from '~/stores/agentBots';

const props = defineProps({
    conversationKey: { type: String, default: '' },
    subscribable: { type: Boolean, default: false }
});

const visible = defineModel('visible', { type: Boolean, default: false });

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const agentBots = useAgentBotsStore();

const creating = ref(false);
const newBotName = ref('');
const saving = ref(false);
const loading = ref(false);
const issuedToken = ref('');

const bots = computed(() => agentBots.bots);
const canToggle = computed(() => props.subscribable && Boolean(props.conversationKey));

watch(visible, async (open) => {
    if (!open) {
        creating.value = false;
        issuedToken.value = '';
        return;
    }
    loading.value = true;
    try {
        await agentBots.refresh(props.conversationKey);
    } finally {
        loading.value = false;
    }
    if (!bots.value.length) creating.value = true;
});

const createBot = async () => {
    const name = newBotName.value.trim();
    if (!name) return;
    saving.value = true;
    try {
        const created = await agentBots.createBot({ name });
        issuedToken.value = created?.token || '';
        newBotName.value = '';
        creating.value = false;
        await agentBots.refresh(props.conversationKey);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        saving.value = false;
    }
};

const rotateToken = async (bot) => {
    try {
        const rotated = await agentBots.rotateBotToken(bot.id);
        issuedToken.value = rotated?.token || '';
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    }
};

const requestDelete = (bot) => {
    confirm.require({
        message: t('support.bots.deleteConfirm', { name: bot.name }),
        header: t('common.delete'),
        icon: 'pi pi-trash',
        accept: async () => {
            try {
                await agentBots.deleteBot(bot.id);
                await agentBots.refresh(props.conversationKey);
            } catch (error) {
                toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
            }
        }
    });
};

const setSubscribed = async (bot, subscribed) => {
    try {
        await agentBots.setSubscribed(bot.id, props.conversationKey, subscribed);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
        await agentBots.refresh(props.conversationKey);
    }
};

const copyToken = async () => {
    try {
        await navigator.clipboard.writeText(issuedToken.value);
        toast.add({ severity: 'success', summary: t('common.copy'), life: 1500 });
    } catch {
        toast.add({ severity: 'warn', summary: t('common.copy'), life: 1500 });
    }
};
</script>
