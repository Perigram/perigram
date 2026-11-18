<template>
  <StandardPage :title="$t('organization.teamManagement')" :back="back">
    <template #actions>
        <Button :label="$t('processDesigner.title')" icon="pi pi-sitemap" severity="secondary" outlined @click="openProcessDesigner" />
        <Button :label="$t('auth.inviteMember')" icon="pi pi-link" severity="secondary" :disabled="!roleOptions.length" @click="showInviteDialog = true" />
        <Button :label="$t('common.create')" icon="pi pi-user-plus" :disabled="!roleOptions.length" @click="showCreateDialog = true" />
    </template>

    <TableFrame class="ck-collection-rows">
    <DataTable :value="users" :loading="loading" :pt="tablePt"
    :row-class="rowSurfaceClass">
      <Column field="identity.name" sortable>
        <template #body="{ data }">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate">{{ data.identity?.name }}</span>
            <!-- The AI's attribution identity is a member row; the badge
                 marks it. It holds no roles and no administration — runs
                 execute delegated to the chatting user. -->
            <Tag v-if="data.data?.bot" :value="$t('support.bots.badge')" severity="secondary" size="small" />
          </div>
        </template>
      </Column>
      <Column field="data.email" :header="$t('profile.email')" sortable>
        <template #body="{ data }">
          <span v-if="!data.data?.bot">{{ data.data?.email }}</span>
        </template>
      </Column>
      <Column :header="$t('organization.processRoles')">
        <template #body="{ data }">
          <div class="flex flex-wrap gap-1">
            <Tag v-for="role in getUserProcessRoles(data)" :key="role.id" :value="role.label" severity="info" />
          </div>
        </template>
      </Column>
      <Column :header="$t('common.actions.title')" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button v-if="!data.data?.bot" icon="pi pi-shield" text @click="editProcessRoles(data)" v-tooltip.top="$t('organization.processRoles')" />
            <Button v-if="!data.data?.bot" icon="pi pi-trash" text severity="danger" @click="confirmDelete(data)" v-tooltip.top="$t('common.delete')" />
          </div>
        </template>
      </Column>
    </DataTable>
    </TableFrame>

    <div v-if="invitations.length > 0" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('auth.activeInvitations')" />
        <TableFrame class="ck-collection-rows">
        <DataTable :value="invitations" :pt="tablePt">
            <Column :header="$t('auth.invitationLink')">
                <template #body="{ data }">
                    <div v-if="data.inviteeUserId" class="flex items-center gap-2">
                        <i class="pi pi-user" aria-hidden="true" />
                        <span class="truncate max-w-md">{{ data.inviteeName || data.inviteeUserId }}</span>
                        <Tag :value="$t(`auth.invitationState.${data.status || 'invited'}`)" severity="secondary" size="small" />
                    </div>
                    <div v-else class="flex items-center gap-2">
                        <span class="opacity-60 truncate max-w-md text-technical">
                            {{ getInvitationUrl(data.token) }}
                        </span>
                        <Button icon="pi pi-copy" text size="small" :aria-label="$t('common.copy')" @click="copyToClipboard(getInvitationUrl(data.token))" />
                    </div>
                </template>
            </Column>
            <Column :header="$t('organization.processRoles')">
                <template #body="{ data }">
                    <div class="flex flex-wrap gap-1">
                        <Tag
                            v-for="role in invitationRoles(data)"
                            :key="role.id"
                            :value="role.label"
                            severity="info"
                            size="small"
                        />
                    </div>
                </template>
            </Column>
            <Column field="expiresAt" :header="$t('auth.expires')">
                <template #body="{ data }">
                    {{ new Date(data.expiresAt).toLocaleDateString() }}
                </template>
            </Column>
            <Column :header="$t('common.actions.title')" class="text-right">
                <template #body="{ data }">
                    <Button icon="pi pi-trash" text severity="danger" @click="revokeInvite(data._id)" v-tooltip.top="$t('common.revoke')" />
                </template>
            </Column>
        </DataTable>
        </TableFrame>
    </div>

    <!-- Pending Members Section -->
    <div v-if="pendingUsers.length > 0" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('auth.joinRequests')" />
        <TableFrame class="ck-collection-rows">
        <DataTable :value="pendingUsers" :pt="tablePt">
            <Column field="identity.name" :header="$t('profile.name')" sortable />
            <Column field="data.email" :header="$t('profile.email')" />
            <Column :header="$t('common.actions.title')" class="text-right">
                <template #body="{ data }">
                    <div class="flex justify-end gap-2">
                        <Button icon="pi pi-check" :label="$t('common.approve')" severity="success" size="small" @click="confirmMembership(data._id, 'approve')" />
                        <Button icon="pi pi-times" :label="$t('common.reject')" severity="danger" size="small" text @click="confirmMembership(data._id, 'reject')" />
                    </div>
                </template>
            </Column>
        </DataTable>
        </TableFrame>
    </div>

    <!-- Invite Member Dialog -->
    <StandardDialog v-model:visible="showInviteDialog" :header="$t('auth.inviteMember')" size="sm">
        <div class="flex flex-col gap-4 pt-4">
            <div class="flex flex-col gap-2">
                <label>{{ $t('auth.inviteExisting') }}</label>
                <div v-if="selectedInvitee" class="flex items-center gap-3">
                    <Avatar
                        :image="selectedInvitee.data?.avatarUrl || null"
                        :label="!selectedInvitee.data?.avatarUrl ? (selectedInvitee.identity?.name || '?').charAt(0).toUpperCase() : null"
                        shape="circle"
                        class="shrink-0 [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                    />
                    <span class="min-w-0 flex-1 truncate">{{ selectedInvitee.identity?.name }}</span>
                    <Button icon="pi pi-times" text rounded severity="secondary" size="small" :aria-label="$t('common.cancel')" @click="selectedInvitee = null" />
                </div>
                <template v-else>
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="inviteSearch" type="text" class="w-full" :placeholder="$t('directory.searchPlaceholder')" data-testid="invite-user-search" />
                    </IconField>
                    <div v-if="inviteSearching" class="text-muted text-body">{{ $t('directory.searching') }}</div>
                    <div v-else-if="inviteResults.length" class="flex max-h-48 flex-col gap-1 overflow-y-auto">
                        <button
                            v-for="user in inviteResults"
                            :key="user._id"
                            type="button"
                            class="flex w-full items-center gap-3 rounded-[var(--p-border-radius-md)] border-0 bg-transparent p-2 text-left cursor-pointer hover:bg-subtle"
                            :data-invite-candidate="user._id"
                            @click="selectInvitee(user)"
                        >
                            <Avatar
                                :image="user.data?.avatarUrl || null"
                                :label="!user.data?.avatarUrl ? (user.identity?.name || '?').charAt(0).toUpperCase() : null"
                                shape="circle"
                                class="shrink-0 [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                            />
                            <span class="min-w-0 flex-1 truncate">{{ user.identity?.name }}</span>
                            <small v-if="user.directory?.sharesOrganization" class="text-muted">{{ $t('partnerships.alreadyMember') }}</small>
                        </button>
                    </div>
                    <div v-else-if="trimmedInviteSearch" class="text-muted text-body">{{ $t('directory.noResults') }}</div>
                </template>
            </div>
            <div class="flex flex-col gap-2">
                <label>{{ $t('organization.processRoles') }} *</label>
                <MultiSelect v-model="inviteForm.roleIds" :options="roleOptions" optionLabel="label" optionValue="value" display="chip" class="w-full" />
            </div>
            <div v-if="generatedUrl" class="mt-4">
                <Panel>
                    <div class="flex flex-col gap-2">
                        <small>{{ $t('auth.invitationLink') }}</small>
                        <div class="flex items-center gap-2">
                            <span class="truncate flex-1 text-technical">{{ generatedUrl }}</span>
                            <Button icon="pi pi-copy" text size="small" :aria-label="$t('common.copy')" @click="copyToClipboard(generatedUrl)" />
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
        <template #footer>
            <Button :label="$t('common.close')" text severity="secondary" @click="closeInviteDialog" />
            <Button
                v-if="selectedInvitee && !generatedUrl"
                :label="$t('auth.inviteMember')"
                icon="pi pi-user-plus"
                :loading="inviting"
                :disabled="!inviteForm.roleIds.length"
                @click="inviteExistingUser"
            />
            <Button v-else-if="!generatedUrl" :label="$t('auth.generateLink')" icon="pi pi-link" @click="generateInvite" :loading="generatingInvite" :disabled="!inviteForm.roleIds.length" />
        </template>
    </StandardDialog>

    <!-- Create User Dialog -->
    <StandardDialog v-model:visible="showCreateDialog" :header="$t('auth.createAccount')" size="sm">
      <form @submit.prevent="createUser" class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label>{{ $t('profile.name') }} *</label>
          <InputText v-model="form.name" required class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('profile.email') }} *</label>
          <InputText v-model="form.email" type="email" required class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('profile.password') }} *</label>
          <Password v-model="form.password" required toggleMask class="w-full" :inputStyle="{ width: '100%' }" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('organization.processRoles') }} *</label>
          <MultiSelect v-model="form.roleIds" :options="roleOptions" optionLabel="label" optionValue="value" display="chip" required class="w-full" />
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <Button type="button" :label="$t('common.cancel')" text severity="secondary" @click="showCreateDialog = false" />
          <Button type="submit" :label="$t('common.create')" :loading="submitting" />
        </div>
      </form>
    </StandardDialog>

    <!-- Process Roles Dialog -->
    <StandardDialog v-model:visible="showPermissionsDialog" :header="`${$t('organization.processRoles')}: ${selectedUser?.identity?.name}`" size="md">
        <div class="flex flex-col gap-4 pt-4">
            <div class="flex flex-col gap-2">
                <label>{{ $t('organization.processRoles') }}</label>
                <MultiSelect v-model="roleAssignment.roleIds" :options="roleOptions" optionLabel="label" optionValue="value" display="chip" class="w-full" />
            </div>
            <div v-if="assignmentBindingFields.length" class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div v-for="field in assignmentBindingFields" :key="field.key" class="flex flex-col gap-2">
                    <label>{{ field.label }}</label>
                    <InputNumber v-if="field.type === 'number'" v-model="roleAssignment.bindings[field.key]" class="w-full" />
                    <Checkbox v-else-if="field.type === 'boolean'" v-model="roleAssignment.bindings[field.key]" binary />
                    <InputText v-else v-model="roleAssignment.bindings[field.key]" class="w-full" />
                </div>
            </div>
            <Panel :header="$t('organization.evaluationContext')" toggleable collapsed>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <InputText v-model="assignmentContext.typeId" :placeholder="$t('organization.typeId')" />
                    <InputText v-model="assignmentContext.instanceId" :placeholder="$t('organization.instanceId')" />
                    <InputText v-model="assignmentContext.status" :placeholder="$t('organization.primaryState')" />
                </div>
            </Panel>
            <Panel :header="$t('organization.compiledAccessPreview')">
                <div class="flex flex-col gap-3">
                    <div>
                        <small class="text-muted">{{ $t('auth.permissions') }}</small>
                        <div class="mt-1 flex flex-wrap gap-1">
                            <Tag v-for="line in selectedUserAccessSummary" :key="line.key" :value="`${line.text} · ${line.contributor.label}`" severity="secondary" size="small" />
                            <Tag v-if="!selectedUserAccessSummary.length" :value="$t('organization.noProcessAccess')" severity="secondary" size="small" />
                        </div>
                    </div>
                    <div>
                        <small class="text-muted">{{ $t('organization.screens') }}</small>
                        <div class="mt-1 flex flex-col gap-1">
                            <span v-for="screen in selectedUserScreens" :key="screen.screenKey || screen.id" class="truncate text-body">
                                {{ screen.labelKey ? $t(screen.labelKey) : (screen.label || screen.route) }} · {{ screen.route }}
                            </span>
                            <span v-if="!selectedUserScreens.length" class="text-muted text-body">{{ $t('organization.noProcessScreens') }}</span>
                        </div>
                    </div>
                    <div v-for="group in assignmentPreviewGroups" :key="group.key">
                        <small class="text-muted">{{ group.label }}</small>
                        <div class="mt-1 flex flex-col gap-1">
                            <span v-for="item in group.items" :key="item.key || item.screenKey || item.id" class="text-supporting">
                                <Tag :value="item.allowed === null ? $t('organization.unresolved') : (item.allowed ? $t('organization.allowed') : $t('organization.denied'))" :severity="item.allowed === null ? 'warn' : (item.allowed ? 'success' : 'danger')" size="small" />
                                {{ item.label || item.typeId || item.feature || item.transition || item.actionId || item.route }} · {{ item.explanation }}
                            </span>
                        </div>
                    </div>
                    <Message :severity="assignmentPreview.ownerRecovery.applied ? 'success' : 'secondary'">{{ assignmentPreview.ownerRecovery.explanation }}</Message>
                    <Message v-if="selectedUserIncompleteBindings.length" severity="warn">
                        {{ $t('organization.incompleteBindings') }}:
                        {{ selectedUserIncompleteBindings.map(item => item.binding).join(', ') }}
                    </Message>
                </div>
            </Panel>
        </div>
        <template #footer>
            <Button :label="$t('common.cancel')" text severity="secondary" @click="showPermissionsDialog = false" />
            <Button :label="$t('common.save')" icon="pi pi-check" :loading="savingRoleAssignment" @click="saveProcessRoles" />
        </template>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';

// The shared table row-surface recipe: rounded content rows (paint comes
// from the preset) over a transparent table box with hairline separated
// gaps and a muted transparent header band; row stripes are gone — the
// row IS the surface.
// The row surface is the preset's content background; its corners are
// clipped here — a table row's own background is NOT clipped by its
// radius (measured: the corner pixels stayed white), while clip-path
// rounds them at the token radius.
const rowSurfaceClass = () => LAYOUT.rowSurface;
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};
import Column from 'primevue/column';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Checkbox from 'primevue/checkbox';
import Password from 'primevue/password';
import Avatar from 'primevue/avatar';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import Tag from 'primevue/tag';
import Panel from 'primevue/panel';
import Message from 'primevue/message';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { usePageBack } from '~/composables/usePageBack.js';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import { useInstancesStore } from '~/stores/instances';
import { useDirectoryUserSearch } from '~/composables/useDirectoryUserSearch.js';
import { useRegistryStore } from '~/stores/registry';
import { deriveRoleAccessSummary, flattenRoleAccessSummary } from '~/shared/role-access-summary.js';
import { authoredProcessDataFromGraphDocument, discoverAssignmentBindingRequirements } from '#packages/processes';
import { previewAssignmentAccess } from '~/shared/assignment-access-preview.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const toast = useToast();
const instances = useInstancesStore();
const registry = useRegistryStore();
const props = defineProps({
  // One-shot invite intent from the page-open seam's params channel
  // (the directory's invite action); the route query is the mobile
  // fallback of the same flow.
  inviteUserId: { type: String, default: '' }
});
// The page is mounted both as a standalone route (mobile/deep link) and
// as a home pane tab: the back control belongs to the routed surface.
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/users' });

function openProcessDesigner() {
  openWorkspacePageFromChrome({ pageId: 'organizationProcess', route: '/organization/process' });
}

const users = ref([]);
const loading = ref(false);
const submitting = ref(false);
const showCreateDialog = ref(false);
const showPermissionsDialog = ref(false);
const showInviteDialog = ref(false);
const generatingInvite = ref(false);
const savingRoleAssignment = ref(false);
const selectedUser = ref(null);
const generatedUrl = ref(null);
const invitations = ref([]);
const pendingUsers = ref([]);
const activeProcess = ref(null);
const organizationRoles = ref({});
const organizationRoleAssignments = ref({});
const roleAssignment = ref({ roleIds: [], bindings: {} });
const assignmentContext = ref({ typeId: '', instanceId: '', state: '' });
const selectedRoleDerivedAccessSummary = computed(() => deriveRoleAccessSummary({
    process: activeProcess.value,
    roleIds: roleAssignment.value.roleIds
}));
const selectedUserAccessSummary = computed(() => flattenRoleAccessSummary(selectedRoleDerivedAccessSummary.value));
const assignmentPreview = computed(() => previewAssignmentAccess({
    compiled: activeProcess.value?.data?.compiled || {},
    assignment: { userId: String(selectedUser.value?._id || ''), ...roleAssignment.value },
    domain: registry.projectedDomain,
    contexts: assignmentContext.value.typeId ? [{
        typeId: assignmentContext.value.typeId,
        instanceId: assignmentContext.value.instanceId,
        status: assignmentContext.value.status
    }] : [],
    membership: selectedUser.value?.data?.memberships?.find(item => String(item.organizationId) === String(activeOrganizationId.value)) || null
}));
const selectedUserScreens = computed(() => assignmentPreview.value.screens);
const selectedUserIncompleteBindings = computed(() => assignmentPreview.value.incompleteBindings);
const assignmentBindingFields = computed(() => requiredAssignmentBindings(roleAssignment.value.roleIds));
const assignmentPreviewGroups = computed(() => [
    { key: 'entities', label: t('organization.entities'), items: assignmentPreview.value.entities.flatMap(entity => [entity, ...entity.fields.map(field => ({ ...field, key: `field:${entity.feature}:${field.path}`, label: `${entity.typeId}.${field.path}` }))]) },
    { key: 'transitions', label: t('organization.transitions'), items: assignmentPreview.value.transitions },
    { key: 'actions', label: t('common.actions.title'), items: assignmentPreview.value.actions },
    { key: 'screens', label: t('organization.screens'), items: assignmentPreview.value.screens }
]);
const activeOrganizationId = computed(() =>
    authStore.organizationData?._id ||
    authStore.userData.organizationId ||
    authStore.memberships?.[0]?.organizationId ||
    null
);

const getInvitationUrl = (token) => {
    if (process.client) {
        return `${window.location.origin}/invitation/${token}`;
    }
    return '';
};

const revokeInvite = async (id) => {
    if (confirm(t('auth.revokeInvitationConfirm'))) {
        try {
            await $fetch(`/api/organizations/${activeOrganizationId.value}/invitations/${id}`, { method: 'DELETE' });
            await loadInvitations();
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.invitationRevoked'), life: 3000 });
        } catch (e) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: e.message, life: 3000 });
        }
    }
};

const form = ref({
  name: '',
  email: '',
  password: '',
  roleIds: []
});

const inviteForm = ref({
    roleIds: []
});

// Targeted invitation state: invitee search runs through the directory
// feature (name-only, cross-tenant) and the selected user receives a
// single-handshake invitation.
const { query: inviteSearch, results: inviteResults, searching: inviteSearching } = useDirectoryUserSearch()
const selectedInvitee = ref(null)
const inviting = ref(false)
const trimmedInviteSearch = computed(() => inviteSearch.value.trim())

function selectInvitee(user) {
    selectedInvitee.value = user;
    inviteSearch.value = '';
    inviteResults.value = [];
}

function closeInviteDialog() {
    showInviteDialog.value = false;
    generatedUrl.value = null;
    selectedInvitee.value = null;
    inviteSearch.value = '';
    inviteResults.value = [];
}

async function inviteExistingUser() {
    if (!selectedInvitee.value) return;
    inviting.value = true;
    try {
        await $fetch(`/api/organizations/${activeOrganizationId.value}/invitations`, {
            method: 'POST',
            body: {
                roleIds: normalizeSelectedRoleIds(inviteForm.value.roleIds, roleOptions.value),
                inviteeUserId: selectedInvitee.value._id
            }
        });
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.invitationSent'), life: 3000 });
        closeInviteDialog();
        await loadInvitations();
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: e?.data?.message || e.message, life: 3000 });
    } finally {
        inviting.value = false;
    }
}

const roleOptions = computed(() => {
  return Object.values(organizationRoles.value).map(role => ({
    // Single-seat roles say so in the picker (organizations README): the
    // seat moves on assignment — one holder at a time.
    label: role.exclusive ? `${role.label || role.id} · ${t('organization.singleSeat')}` : (role.label || role.id),
    value: role.id
  }));
});

watch(roleOptions, (options) => {
  const firstRole = options[0]?.value || '';
  form.value.roleIds = normalizeSelectedRoleIds(form.value.roleIds, options, firstRole);
  inviteForm.value.roleIds = normalizeSelectedRoleIds(inviteForm.value.roleIds, options, firstRole);
}, { immediate: true });

async function loadUsers() {
  loading.value = true;
  try {
    // The team surface speaks the feature route's DTO (memberships drive
    // the active/pending split); the instance store serves the §3
    // process-plane shape for party types.
    const [allUsers] = await Promise.all([
      $fetch('/api/users')
    ]);
    await loadActiveProcess();
    await loadOrganizationRoles();
    const organizationId = activeOrganizationId.value?.toString();
    users.value = allUsers.filter(u => 
        u.data?.memberships?.some(m => m.organizationId?.toString() === organizationId && m.status === 'active')
    );
    pendingUsers.value = allUsers.filter(u => 
        u.data?.memberships?.some(m => m.organizationId?.toString() === organizationId && m.status === 'pending')
    );
    await loadInvitations();
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

async function loadInvitations() {
    try {
        invitations.value = await $fetch(`/api/organizations/${activeOrganizationId.value}/invitations`);
    } catch (e) { console.error(e); }
}

async function loadActiveProcess() {
    try {
        const active = await $fetch('/api/process-definitions/active');
        if (active?.data?.format === 'perigram.graph') {
            active.data = {
                ...(authoredProcessDataFromGraphDocument(active.data) || {}),
                ...Object.fromEntries(['migrations', 'history', 'activated', 'compiled'].filter(key => active.data[key] !== undefined).map(key => [key, active.data[key]]))
            };
        }
        activeProcess.value = active;
    } catch (e) {
        activeProcess.value = null;
    }
}

async function loadOrganizationRoles() {
    if (!activeOrganizationId.value) return;
    const base = `/api/organizations/${activeOrganizationId.value}`;
    [organizationRoles.value, organizationRoleAssignments.value] = await Promise.all([
        $fetch(`${base}/roles`),
        $fetch(`${base}/role-assignments`)
    ]);
}

async function generateInvite() {
    generatingInvite.value = true;
    try {
        const res = await $fetch(`/api/organizations/${activeOrganizationId.value}/invitations`, {
            method: 'POST',
            body: { roleIds: normalizeSelectedRoleIds(inviteForm.value.roleIds, roleOptions.value) }
        });
        generatedUrl.value = getInvitationUrl(res.token);
        await loadInvitations();
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: e.message, life: 3000 });
    } finally {
        generatingInvite.value = false;
    }
}

async function confirmMembership(userId, action) {
    try {
        await $fetch(`/api/users/${userId}/membership-confirmation`, {
            method: 'POST',
            body: { action, organizationId: activeOrganizationId.value }
        });
        toast.add({ severity: 'success', summary: t('common.success'), detail: t(`auth.membership.${action}`), life: 3000 });
        await loadUsers();
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: e.message, life: 3000 });
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.add({ severity: 'success', summary: t('common.copied'), detail: t('auth.invitationCopied'), life: 2000 });
}

async function createUser() {
  submitting.value = true;
  try {
    await instances.createInstance('user', {
        ...form.value,
        roleIds: normalizeSelectedRoleIds(form.value.roleIds, roleOptions.value),
        organizationId: activeOrganizationId.value
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userCreated'), life: 3000 });
    showCreateDialog.value = false;
    form.value = { name: '', email: '', password: '', roleIds: roleOptions.value[0]?.value ? [roleOptions.value[0].value] : [] };
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
  } finally {
    submitting.value = false;
  }
}

function editProcessRoles(user) {
  selectedUser.value = user;
  const assignment = getProcessAssignment(user);
  roleAssignment.value = {
    roleIds: assignment?.roleIds?.length ? [...assignment.roleIds] : [roleOptions.value[0]?.value].filter(Boolean),
    bindings: { ...(assignment?.bindings || {}) }
  };
  showPermissionsDialog.value = true;
}

async function saveProcessRoles() {
  savingRoleAssignment.value = true;
  try {
    await $fetch(`/api/organizations/${activeOrganizationId.value}/role-assignments/${selectedUser.value._id}`, {
      method: 'PATCH',
      body: {
        roleIds: roleAssignment.value.roleIds,
        bindings: roleAssignment.value.bindings
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.permissionsUpdated'), life: 3000 });
    showPermissionsDialog.value = false;
    await loadOrganizationRoles();
    await authStore.setUser();
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
  } finally {
    savingRoleAssignment.value = false;
  }
}

function getProcessAssignment(user) {
    return organizationRoleAssignments.value[String(user?._id)] || organizationRoleAssignments.value[String(user?.id)] || null;
}

function getUserProcessRoles(user) {
    const roles = organizationRoles.value;
    const assignment = getProcessAssignment(user);
    const roleIds = assignment?.roleIds || [];
    return roleIds.map(roleId => ({
        id: roleId,
        label: roles[roleId]?.label || roleId
    }));
}

function invitationRoles(invitation = {}) {
    const roles = organizationRoles.value;
    const roleIds = invitation.roleIds || [];
    return roleIds.map(roleId => ({
        id: roleId,
        label: roles[roleId]?.label || roleId
    }));
}

function normalizeSelectedRoleIds(roleIds = [], options = roleOptions.value, fallback = '') {
    const selected = new Set(Array.isArray(roleIds) ? roleIds : [roleIds].filter(Boolean));
    const valid = options.map(option => option.value).filter(value => selected.has(value));
    if (!valid.length && fallback) return [fallback];
    return valid;
}

function requiredAssignmentBindings(roleIds = []) {
    return discoverAssignmentBindingRequirements({
        process: activeProcess.value,
        roleIds,
        bindings: roleAssignment.value.bindings
    });
}

async function confirmDelete(user) {
    if (confirm(t('auth.removeUserConfirm', { name: user.identity?.name }))) {
        try {
            await instances.removeInstance('user', user._id, { entity: user });
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userRemoved'), life: 3000 });
            await loadUsers();
        } catch (error) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
        }
    }
}

onMounted(async () => {
  await loadUsers();
  await consumeInviteTarget(props.inviteUserId || route.query.invite);
});

// A pane-resident invite intent arrives while the tab is already open.
watch(() => props.inviteUserId, target => consumeInviteTarget(target));

async function consumeInviteTarget(target) {
  if (!target) return;
  try {
    selectedInvitee.value = await $fetch(`/api/directory/user/${target}`);
    showInviteDialog.value = true;
  } catch {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('common.notAvailable'), life: 3000 });
  }
}
</script>

<style scoped>
/* Row-surface rhythm (layout-only declarations): the shared recipe —
   separated cell borders leave a hairline gap between rounded rows. */
.ck-collection-rows :deep(.p-datatable-table) {
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}
</style>
