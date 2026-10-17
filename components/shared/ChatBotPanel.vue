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
            <div v-else-if="aiRow" class="flex min-w-0 items-center gap-2">
                <AiAvatar class="shrink-0" />
                <span class="min-w-0 flex-1 truncate text-label">{{ aiRow.name }}</span>
                <Tag
                    :value="$t('support.bots.assistant')"
                    severity="secondary"
                    size="small"
                    class="shrink-0"
                />
                <ToggleSwitch
                    v-if="canToggle"
                    :model-value="aiRow.subscribed"
                    :aria-label="$t('support.bots.toggleInConversation')"
                    :data-testid="`chat-bot-subscribe-${aiRow.id}`"
                    @update:model-value="setSubscribed($event)"
                />
                <!-- The conversation is an execution point: the AI may run
                     on a different model here than the org chat route. -->
                <Select
                    v-if="inRoom"
                    :model-value="aiRow.profile || ''"
                    :options="conversationProfileOptions"
                    option-label="label"
                    option-value="value"
                    size="small"
                    class="w-36 shrink-0"
                    :aria-label="$t('llm.profile')"
                    :data-testid="`chat-bot-model-${aiRow.id}`"
                    @update:model-value="value => setConversationProfile(value)"
                />
            </div>
            <template v-if="canToggle && aiRow?.subscribed">
                <Divider class="my-1" />
                <div class="flex items-center gap-2 px-1 text-muted text-supporting">
                    <i class="pi pi-bolt shrink-0" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate">{{ $t('support.bots.wakes') }}</span>
                </div>
                <div
                    v-for="rule in wakeRules"
                    :key="`${rule.type}:${rule.state}`"
                    class="flex min-w-0 items-center gap-2 px-1"
                    data-testid="chat-bot-wake-rule"
                >
                    <span class="min-w-0 flex-1 truncate text-label">
                        {{ rule.type }} → {{ rule.state }}{{ rule.profile ? ` · ${rule.profile}` : '' }}
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
                    <Select
                        v-model="ruleProfile"
                        :options="conversationProfileOptions"
                        option-label="label"
                        option-value="value"
                        :placeholder="$t('llm.profile')"
                        size="small"
                        class="w-32 shrink-0"
                        :aria-label="$t('llm.profile')"
                    />
                    <Button
                        icon="pi pi-plus"
                        severity="secondary"
                        outlined
                        :aria-label="$t('common.add')"
                        :disabled="!ruleType || !ruleState"
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
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import AiAvatar from '~/components/shared/AiAvatar.vue';
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
const ruleType = ref(null);
const ruleState = ref(null);
const ruleProfile = ref('');

const aiRow = computed(() => agentBots.ai);
const canToggle = computed(() => props.subscribable && Boolean(props.conversationKey));
const inRoom = computed(() => !props.subscribable || Boolean(aiRow.value?.subscribed));
const ruleStateOptions = computed(() => (
    wakeOptions.value.find(option => option.typeId === ruleType.value)?.states || []
));
const wakeRules = computed(() => aiRow.value?.wakeOn || []);
const conversationProfileOptions = computed(() => agentBots.chatProfileOptions(t('llm.auto')));

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

const saveRules = async (wakeOn) => {
    try {
        await agentBots.setSubscriptionRules(props.conversationKey, wakeOn);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    }
};

const addWakeRule = () => {
    const rule = { type: ruleType.value, state: ruleState.value };
    if (ruleProfile.value) rule.profile = ruleProfile.value;
    saveRules([...wakeRules.value, rule]);
    ruleType.value = null;
    ruleState.value = null;
    ruleProfile.value = '';
};

const removeWakeRule = (rule) => {
    saveRules(wakeRules.value.filter(item => !(item.type === rule.type && item.state === rule.state)));
};

const setConversationProfile = async (profile) => {
    try {
        await agentBots.setConversationProfile(props.conversationKey, profile || '');
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
        await agentBots.fetchContacts(props.conversationKey);
    }
};

const setSubscribed = async (subscribed) => {
    try {
        await agentBots.setSubscribed(props.conversationKey, subscribed);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
        await agentBots.fetchContacts(props.conversationKey);
    }
};
</script>
