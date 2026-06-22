<template>
  <StandardPage :title="$t('organization.teamManagement')">
    <template #actions>
        <Button :label="$t('processDesigner.title')" icon="pi pi-sitemap" severity="secondary" outlined @click="navigateTo('/organization/process')" />
        <Button :label="$t('auth.inviteMember')" icon="pi pi-link" severity="secondary" @click="showInviteDialog = true" />
        <Button :label="$t('common.create')" icon="pi pi-user-plus" @click="showCreateDialog = true" />
    </template>

    <TableFrame>
    <DataTable :value="users" :loading="loading" stripedRows>
      <Column field="identity.name" :header="$t('profile.name')" sortable />
      <Column field="data.email" :header="$t('profile.email')" sortable />
      <Column field="data.role" :header="$t('organization.processRoles')">
        <template #body="{ data }">
          <div class="flex flex-wrap gap-1">
            <Tag v-for="role in getUserProcessRoles(data)" :key="role.id" :value="role.label" severity="info" />
          </div>
        </template>
      </Column>
      <Column :header="$t('common.actions.title')" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-shield" text @click="editProcessRoles(data)" v-tooltip.top="$t('organization.processRoles')" />
            <Button icon="pi pi-trash" text severity="danger" @click="confirmDelete(data)" v-tooltip.top="$t('common.delete')" />
          </div>
        </template>
      </Column>
    </DataTable>
    </TableFrame>

    <div v-if="invitations.length > 0" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('auth.activeInvitations')" />
        <TableFrame>
        <DataTable :value="invitations">
            <Column :header="$t('auth.invitationLink')">
                <template #body="{ data }">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-mono opacity-60 truncate max-w-md">
                            {{ getInvitationUrl(data.token) }}
                        </span>
                        <Button icon="pi pi-copy" text size="small" :aria-label="$t('common.copy')" @click="copyToClipboard(getInvitationUrl(data.token))" />
                    </div>
                </template>
            </Column>
            <Column field="role" :header="$t('organization.processRoles')" />
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
        <TableFrame>
        <DataTable :value="pendingUsers">
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
            <p>{{ $t('auth.inviteMemberNote') }}</p>
            <div class="flex flex-col gap-2">
                <label>{{ $t('organization.processRoles') }} *</label>
                <Select v-model="inviteForm.role" :options="roleOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div v-if="generatedUrl" class="mt-4">
                <Panel>
                    <div class="flex flex-col gap-2">
                        <small>{{ $t('auth.invitationLink') }}</small>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono truncate flex-1">{{ generatedUrl }}</span>
                            <Button icon="pi pi-copy" text size="small" :aria-label="$t('common.copy')" @click="copyToClipboard(generatedUrl)" />
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
        <template #footer>
            <Button :label="$t('common.close')" text severity="secondary" @click="showInviteDialog = false; generatedUrl = null" />
            <Button :label="$t('auth.generateLink')" icon="pi pi-link" @click="generateInvite" :loading="generatingInvite" v-if="!generatedUrl" />
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
          <Select v-model="form.role" :options="roleOptions" optionLabel="label" optionValue="value" required class="w-full" />
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
                    <InputText v-model="roleAssignment.bindings[field.key]" class="w-full" />
                </div>
            </div>
            <Panel :header="$t('organization.compiledAccessPreview')">
                <div class="flex flex-col gap-3">
                    <div>
                        <small class="text-muted-color">{{ $t('auth.permissions') }}</small>
                        <div class="mt-1 flex flex-wrap gap-1">
                            <Tag v-for="item in selectedUserAccessSummary" :key="item" :value="item" severity="secondary" size="small" />
                            <Tag v-if="!selectedUserAccessSummary.length" :value="$t('organization.noProcessAccess')" severity="secondary" size="small" />
                        </div>
                    </div>
                    <div>
                        <small class="text-muted-color">{{ $t('organization.screens') }}</small>
                        <div class="mt-1 flex flex-col gap-1">
                            <span v-for="screen in selectedUserScreens" :key="screen.screenKey || screen.id" class="truncate text-sm">
                                {{ screen.labelKey ? $t(screen.labelKey) : (screen.label || screen.route) }} · {{ screen.route }}
                            </span>
                            <span v-if="!selectedUserScreens.length" class="text-sm text-muted-color">{{ $t('organization.noProcessScreens') }}</span>
                        </div>
                    </div>
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
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Tag from 'primevue/tag';
import Panel from 'primevue/panel';
import Message from 'primevue/message';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const authStore = useAuthStore();
const toast = useToast();
const usersEntity = useEntity('user');

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
const roleAssignment = ref({ roleIds: [], bindings: {} });
const selectedUserAccess = computed(() => {
    const userId = String(selectedUser.value?._id || selectedUser.value?.id || '');
    return activeProcess.value?.data?.compiled?.userAccess?.[userId] || null;
});
const selectedRoleDerivedAccessSummary = computed(() => derivedRoleAccessSummary(roleAssignment.value.roleIds));
const selectedUserAccessSummary = computed(() => selectedRoleDerivedAccessSummary.value);
const selectedUserScreens = computed(() => previewScreensForRoles(roleAssignment.value.roleIds, roleAssignment.value.bindings));
const selectedUserIncompleteBindings = computed(() => selectedUserAccess.value?.incompleteBindings || []);
const assignmentBindingFields = computed(() => requiredAssignmentBindings(roleAssignment.value.roleIds));
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
  role: 'role_viewer'
});

const inviteForm = ref({
    role: 'role_viewer'
});

const roleOptions = computed(() => {
  const roles = activeProcess.value?.data?.roles || {};
  return Object.values(roles).map(role => ({
    label: role.label || role.id,
    value: role.id
  }));
});

async function loadUsers() {
  loading.value = true;
  try {
    const allUsers = await usersEntity.list();
    await loadActiveProcess();
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
        activeProcess.value = await $fetch('/api/process-definitions/active');
    } catch (e) {
        activeProcess.value = null;
    }
}

async function generateInvite() {
    generatingInvite.value = true;
    try {
        const res = await $fetch(`/api/organizations/${activeOrganizationId.value}/invitations`, {
            method: 'POST',
            body: { ...inviteForm.value, roleIds: [inviteForm.value.role] }
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
    await usersEntity.create({
        ...form.value,
        roleIds: [form.value.role],
        organizationId: activeOrganizationId.value
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userCreated'), life: 3000 });
    showCreateDialog.value = false;
    form.value = { name: '', email: '', password: '', role: 'role_viewer' };
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
    await $fetch('/api/process-definitions/active/assignments', {
      method: 'PATCH',
      body: {
        userId: selectedUser.value._id,
        roleIds: roleAssignment.value.roleIds,
        bindings: roleAssignment.value.bindings,
        status: 'active'
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.permissionsUpdated'), life: 3000 });
    showPermissionsDialog.value = false;
    await loadActiveProcess();
    await authStore.setUser();
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
  } finally {
    savingRoleAssignment.value = false;
  }
}

function getProcessAssignment(user) {
    const assignments = activeProcess.value?.data?.assignments || {};
    return assignments[String(user?._id)] || assignments[String(user?.id)] || null;
}

function getUserProcessRoles(user) {
    const roles = activeProcess.value?.data?.roles || {};
    const assignment = getProcessAssignment(user);
    const roleIds = assignment?.roleIds || [];
    return roleIds.map(roleId => ({
        id: roleId,
        label: roles[roleId]?.label || roleId
    }));
}

function requiredAssignmentBindings(roleIds = []) {
    const keys = new Set();
    for (const screen of Object.values(activeProcess.value?.data?.screens || {})) {
        if (!screenAppliesToRoles(screen, roleIds)) continue;
        collectAssignmentKeys(screen.route, keys);
        collectAssignmentKeys(screen.bindings, keys);
        collectAssignmentKeys(screen.required, keys);
    }
    return [...keys].sort().map(key => ({
        key,
        label: key.replace(/([A-Z])/g, ' $1').replace(/[._-]+/g, ' ').trim() || key
    }));
}

function collectAssignmentKeys(value, keys) {
    if (Array.isArray(value)) {
        for (const item of value) collectAssignmentKeys(item, keys);
        return;
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectAssignmentKeys(item, keys);
        return;
    }
    if (typeof value !== 'string') return;
    for (const match of value.matchAll(/\$assignment\.([A-Za-z0-9_.-]+)/g)) keys.add(match[1]);
}

function screenAppliesToRoles(screen = {}, roleIds = []) {
    return !screen.roleIds?.length || roleIds.some(roleId => screen.roleIds.includes(roleId));
}

function derivedRoleAccessSummary(roleIds = []) {
    const items = [];
    const roleSet = new Set(roleIds);
    for (const profile of Object.values(activeProcess.value?.data?.entityProfiles || {})) {
        for (const level of ['read', 'write', 'admin']) {
            if ((profile.allowedRoles?.[level] || []).some(roleId => roleSet.has(roleId))) items.push(`${profile.entityType}:${level}`);
        }
    }
    for (const screen of Object.values(activeProcess.value?.data?.screens || {})) {
        if (screenAppliesToRoles(screen, roleIds)) items.push(`${screen.required?.feature || screen.id}:${screen.required?.level || 'screen'}`);
    }
    for (const action of Object.values(activeProcess.value?.data?.actions || {})) {
        if ((action.access?.roleIds || []).some(roleId => roleSet.has(roleId))) {
            items.push(actionAccessSummary(action));
        }
    }
    return [...new Set(items)];
}

function actionAccessSummary(action = {}) {
    return [
        [actionEntityType(action), actionTargetStatus(action)].filter(Boolean).join('@') || action.label || action.id || action.actionKind,
        normalizeAccessLevel(action.access?.level)
    ].filter(Boolean).join(':');
}

function actionEntityType(action = {}) {
    return action.entityType
        || action.outputs?.find(output => output.entityType)?.entityType
        || action.inputs?.find(input => input.entityType)?.entityType
        || '';
}

function actionTargetStatus(action = {}) {
    return action.access?.statusTo
        || action.status?.to
        || action.outputs?.find(output => typeof output.status === 'string')?.status
        || '';
}

function normalizeAccessLevel(level) {
    return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

function previewScreensForRoles(roleIds = [], bindings = {}) {
    return Object.values(activeProcess.value?.data?.screens || {})
        .filter(screen => screenAppliesToRoles(screen, roleIds))
        .map(screen => ({
            ...screen,
            screenKey: screen.id,
            route: replaceAssignmentValues(screen.route, bindings)
        }));
}

function replaceAssignmentValues(value = '', bindings = {}) {
    return String(value || '').replace(/\$assignment\.([A-Za-z0-9_.-]+)/g, (match, key) => {
        const resolved = getByPath(bindings, key);
        return resolved === undefined || resolved === null || resolved === '' ? match : String(resolved);
    });
}

function getByPath(source = {}, path = '') {
    return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

async function confirmDelete(user) {
    if (confirm(t('auth.removeUserConfirm', { name: user.identity?.name }))) {
        try {
            const { remove } = useEntity('user', user._id);
            await remove();
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userRemoved'), life: 3000 });
            await loadUsers();
        } catch (error) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
        }
    }
}

onMounted(() => {
  loadUsers();
});
</script>
