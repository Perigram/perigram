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
            <div v-if="loading" class="flex items-center justify-center p-3">
                <i class="pi pi-spin pi-spinner text-muted" aria-hidden="true" />
            </div>
            <Listbox
                v-else-if="botRows.length"
                :model-value="null"
                :options="botRows"
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
                        <Tag
                            v-if="option.assistant"
                            :value="$t('support.bots.assistant')"
                            severity="secondary"
                            size="small"
                            class="shrink-0"
                        />
                        <ToggleSwitch
                            v-if="canToggle"
                            :model-value="option.subscribed"
                            :aria-label="$t('support.bots.toggleInConversation')"
                            :data-testid="`chat-bot-subscribe-${option.id}`"
                            @update:model-value="setSubscribed(option, $event)"
                        />
                    </div>
                </template>
            </Listbox>
            <div v-else class="text-muted text-body">{{ $t('support.bots.empty') }}</div>
            <template v-if="canToggle && subscribedBots.length">
                <Divider class="my-1" />
                <div class="flex items-center gap-2 px-1 text-muted text-supporting">
                    <i class="pi pi-bolt shrink-0" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate">{{ $t('support.bots.wakes') }}</span>
                </div>
                <div
                    v-for="rule in wakeRules"
                    :key="`${rule.botId}:${rule.type}:${rule.state}`"
                    class="flex min-w-0 items-center gap-2 px-1"
                    data-testid="chat-bot-wake-rule"
                >
                    <span class="min-w-0 flex-1 truncate text-label">
                        {{ rule.botName }} · {{ rule.type }} → {{ rule.state }}
                    </span>
                    <Button
                        icon="pi pi-times"
                        severity="secondary"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('common.delete')"
                        @click="removeWakeRule(rule)"
                    />
                </div>
                <div class="flex items-center gap-2">
                    <Select
                        v-model="ruleBotId"
                        :options="subscribedBots"
                        option-label="name"
                        option-value="id"
                        :placeholder="$t('support.bots.botPlaceholder')"
                        class="min-w-0 flex-1"
                        :aria-label="$t('support.bots.botPlaceholder')"
                    />
                    <Select
                        v-model="ruleType"
                        :options="wakeOptions"
                        option-label="typeId"
                        option-value="typeId"
                        :placeholder="$t('support.bots.typePlaceholder')"
                        class="min-w-0 flex-1"
                        :aria-label="$t('support.bots.typePlaceholder')"
                        @update:model-value="ruleState = null"
                    />
                    <Select
                        v-model="ruleState"
                        :options="ruleStateOptions"
                        :placeholder="$t('support.bots.statePlaceholder')"
                        class="min-w-0 flex-1"
                        :aria-label="$t('support.bots.statePlaceholder')"
                        :disabled="!ruleType"
                    />
                    <Button
                        icon="pi pi-plus"
                        severity="secondary"
                        outlined
                        :aria-label="$t('common.add')"
                        :disabled="!ruleBotId || !ruleType || !ruleState"
                        data-testid="chat-bot-wake-add"
                        @click="addWakeRule"
                    />
                </div>
            </template>
        </div>
    </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import Listbox from 'primevue/listbox';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAgentBotsStore } from '~/stores/agentBots';

const props = defineProps({
    conversationKey: { type: String, default: '' },
    subscribable: { type: Boolean, default: false }
});

const visible = defineModel('visible', { type: Boolean, default: false });

const { t } = useI18n();
const toast = useToast();
const agentBots = useAgentBotsStore();

const loading = ref(false);
const wakeOptions = ref([]);
const ruleBotId = ref(null);
const ruleType = ref(null);
const ruleState = ref(null);

const botRows = computed(() => agentBots.contacts);
const canToggle = computed(() => props.subscribable && Boolean(props.conversationKey));
const subscribedBots = computed(() => botRows.value.filter(bot => bot.subscribed));
const ruleStateOptions = computed(() => (
    wakeOptions.value.find(option => option.typeId === ruleType.value)?.states || []
));
const wakeRules = computed(() => subscribedBots.value.flatMap(bot => (
    (bot.wakeOn || []).map(rule => ({ ...rule, botId: bot.id, botName: bot.name }))
)));

watch(visible, async (open) => {
    if (!open) return;
    loading.value = true;
    try {
        await agentBots.fetchContacts(props.conversationKey);
        if (canToggle.value) wakeOptions.value = await agentBots.fetchWakeOptions();
    } finally {
        loading.value = false;
    }
});

const saveRules = async (botId, wakeOn) => {
    try {
        await agentBots.setSubscriptionRules(botId, props.conversationKey, wakeOn);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    }
};

const addWakeRule = () => {
    const bot = subscribedBots.value.find(item => String(item.id) === String(ruleBotId.value));
    if (!bot) return;
    const rules = [...(bot.wakeOn || []), { type: ruleType.value, state: ruleState.value }];
    saveRules(bot.id, rules);
    ruleBotId.value = null;
    ruleType.value = null;
    ruleState.value = null;
};

const removeWakeRule = (rule) => {
    const bot = subscribedBots.value.find(item => String(item.id) === String(rule.botId));
    if (!bot) return;
    saveRules(bot.id, (bot.wakeOn || []).filter(item => !(item.type === rule.type && item.state === rule.state)));
};

const setSubscribed = async (bot, subscribed) => {
    try {
        await agentBots.setSubscribed(bot.id, props.conversationKey, subscribed);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
        await agentBots.fetchContacts(props.conversationKey);
    }
};
</script>
