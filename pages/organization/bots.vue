<template>
  <StandardPage :title="$t('organization.botsManagement')" :back="back">
    <template #actions>
        <Button :label="$t('common.create')" icon="pi pi-plus" :disabled="!canManage" @click="openCreate" />
    </template>

    <TableFrame class="ck-collection-rows">
      <DataTable :value="bots" :loading="loading" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="org-bots-table">
        <Column field="name" :header="$t('profile.name')">
          <template #body="{ data }">
            <div class="flex min-w-0 items-center gap-2">
              <Avatar
                :image="data.avatarUrl || null"
                :label="!data.avatarUrl ? String(data.name || '?').charAt(0).toUpperCase() : null"
                shape="circle"
                class="shrink-0 bg-subtle text-muted [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
              />
              <span class="min-w-0 flex-1 truncate text-body">{{ data.name }}</span>
              <Tag v-if="data.assistant" :value="$t('support.bots.assistant')" severity="secondary" size="small" />
            </div>
          </template>
        </Column>
        <Column field="createdAt" :header="$t('common.created')">
          <template #body="{ data }">
            {{ formatDate(data.createdAt) }}
          </template>
        </Column>
        <Column :header="$t('common.actions.title')" class="text-right">
          <template #body="{ data }">
            <div class="flex justify-end gap-2">
              <Button
                icon="pi pi-key"
                text
                :aria-label="$t('support.bots.rotateToken')"
                :loading="workingBotId === data.id"
                @click="rotateToken(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                severity="danger"
                :aria-label="$t('common.delete')"
                :loading="workingBotId === data.id"
                @click="requestDelete(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </TableFrame>

    <StandardDialog v-model:visible="createVisible" size="sm" :header="$t('support.bots.title')" :show-default-footer="false">
      <div class="flex flex-col gap-3 pt-2">
        <InputText
          v-model="newBotName"
          type="text"
          class="w-full"
          :placeholder="$t('support.bots.namePlaceholder')"
          :aria-label="$t('support.bots.namePlaceholder')"
          data-testid="org-bot-name"
          @keydown.enter="createBot"
        />
        <div v-if="issuedToken" class="flex items-center gap-2">
          <InputText
            :model-value="issuedToken"
            readonly
            class="min-w-0 flex-1 text-technical"
            :aria-label="$t('support.bots.token')"
            data-testid="org-bot-token"
          />
          <Button icon="pi pi-copy" severity="secondary" text rounded :aria-label="$t('common.copy')" @click="copyToken" />
        </div>
        <div class="flex justify-end gap-2">
          <Button
            :label="$t('common.create')"
            icon="pi pi-plus"
            :loading="saving"
            :disabled="!newBotName.trim()"
            data-testid="org-bot-create"
            @click="createBot"
          />
        </div>
      </div>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { useAuthStore } from '~/stores/auth';
import { useAgentBotsStore } from '~/stores/agentBots';
import { usePageBack } from '~/composables/usePageBack';
import { useRoute } from 'vue-router';

const route = useRoute();
const { t, locale } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();
const agentBots = useAgentBotsStore();

// The row surface is the preset's content background; corners clip at the
// token radius (the shared table pattern).
const rowSurfaceClass = () => '[clip-path:inset(0_round_var(--p-border-radius-xl))]';
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const loading = ref(false);
const bots = ref([]);
const createVisible = ref(false);
const newBotName = ref('');
const saving = ref(false);
const workingBotId = ref('');
const issuedToken = ref('');

const canManage = computed(() => agentBots.canManageBots);
// The page is mounted both as a standalone route and as a home pane tab:
// the back control belongs to the routed surface.
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/bots' });

const formatDate = (value) => new Date(value).toLocaleDateString(locale.value);

async function refresh() {
    loading.value = true;
    try {
        await agentBots.refresh();
        bots.value = agentBots.bots;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        loading.value = false;
    }
}

function openCreate() {
    newBotName.value = '';
    issuedToken.value = '';
    createVisible.value = true;
}

async function createBot() {
    const name = newBotName.value.trim();
    if (!name) return;
    saving.value = true;
    try {
        const created = await agentBots.createBot({ name });
        issuedToken.value = created?.token || '';
        newBotName.value = '';
        await refresh();
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        saving.value = false;
    }
}

async function rotateToken(bot) {
    workingBotId.value = bot.id;
    try {
        const rotated = await agentBots.rotateBotToken(bot.id);
        issuedToken.value = rotated?.token || '';
        createVisible.value = true;
        newBotName.value = '';
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
    } finally {
        workingBotId.value = '';
    }
}

function requestDelete(bot) {
    confirm.require({
        message: t('support.bots.deleteConfirm', { name: bot.name }),
        header: t('common.delete'),
        icon: 'pi pi-trash',
        accept: async () => {
            workingBotId.value = bot.id;
            try {
                await agentBots.deleteBot(bot.id);
                await refresh();
            } catch (error) {
                toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
            } finally {
                workingBotId.value = '';
            }
        }
    });
}

async function copyToken() {
    try {
        await navigator.clipboard.writeText(issuedToken.value);
        toast.add({ severity: 'success', summary: t('common.copy'), life: 1500 });
    } catch {
        toast.add({ severity: 'warn', summary: t('common.copy'), life: 1500 });
    }
}

onMounted(refresh);
</script>
