<template>
  <StandardPage :title="$t('typesPane.title')">
    <template #actions>
      <Button :label="$t('processDesigner.title')" icon="pi pi-sitemap" severity="secondary" outlined @click="navigateTo('/organization/process')" />
      <Button :label="$t('common.create')" icon="pi pi-plus" @click="openCreateDialog" />
    </template>

    <Message v-if="compileErrors.length" severity="error" :closable="false">
      {{ compileErrors.join('; ') }}
    </Message>

    <TableFrame>
      <DataTable :value="types" :loading="loading" stripedRows>
        <Column field="id" :header="$t('typesPane.typeId')" sortable />
        <Column field="class" :header="$t('typesPane.class')" sortable>
          <template #body="{ data }">
            <Tag :value="data.class" :severity="data.scope === 'org' ? 'info' : 'secondary'" />
          </template>
        </Column>
        <Column field="version" :header="$t('typesPane.version')" sortable />
        <Column :header="$t('typesPane.fields')">
          <template #body="{ data }">
            <span class="text-supporting">{{ Object.keys(data.fields || {}).length }}</span>
          </template>
        </Column>
        <Column :header="$t('typesPane.states')">
          <template #body="{ data }">
            <span class="text-supporting">{{ data.states?.main?.values?.join(', ') || '—' }}</span>
          </template>
        </Column>
        <Column :header="$t('common.actions.title')" class="text-right">
          <template #body="{ data }">
            <Button
              :icon="data.scope === 'org' ? 'pi pi-pencil' : 'pi pi-eye'"
              text
              @click="openEditor(data)"
              v-tooltip.top="data.scope === 'org' ? $t('common.edit') : $t('typesPane.systemReadonly')"
            />
            <Button
              v-if="data.scope === 'org'"
              icon="pi pi-trash"
              text
              severity="danger"
              @click="confirmDelete(data)"
              v-tooltip.top="$t('common.delete')"
            />
          </template>
        </Column>
      </DataTable>
    </TableFrame>

    <StandardDialog v-model:visible="createDialog" :header="$t('typesPane.newType')" size="sm" :cancel-label="$t('common.cancel')">
      <div class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.typeId') }}</label>
          <InputText v-model="createDraft.id" placeholder="panel-batch" />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.class') }}</label>
          <Select v-model="createDraft.class" :options="authoredClasses" option-label="label" option-value="value" />
        </div>
        <Message severity="info" :closable="false">{{ $t('typesPane.tenancyHint') }}</Message>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text @click="createDialog = false" />
        <Button :label="$t('common.create')" :disabled="!createDraft.id || !createDraft.class" @click="createType" />
      </template>
    </StandardDialog>

    <Drawer v-model:visible="editorOpen" :header="editor?.id || ''" position="right" class="w-full max-w-2xl">
      <div v-if="editor" class="flex flex-col gap-5">
        <div class="flex items-center gap-2">
          <Tag :value="editor.class" />
          <Tag :value="editor.scope === 'org' ? 'org' : 'system'" severity="secondary" />
          <Tag :value="`v${editor.version}`" severity="secondary" />
        </div>

        <Message v-if="editor.scope !== 'org'" severity="secondary" :closable="false">
          {{ $t('typesPane.systemReadonlyHint') }}
        </Message>

        <template v-if="editable">
          <Panel :header="$t('typesPane.fields')" toggleable>
            <div class="flex flex-col gap-2">
              <div v-for="(field, name) in editor.fields" :key="name" class="flex items-center gap-1">
                <strong class="w-32 shrink-0 truncate text-supporting">{{ name }}</strong>
                <Select
                  :model-value="field.base"
                  :options="fieldBases"
                  size="small"
                  class="w-36"
                  :disabled="!editable"
                  @update:model-value="base => updateField(name, base)"
                />
                <Select
                  v-if="field.base === 'quantity'"
                  :model-value="field.unit"
                  :options="units"
                  size="small"
                  class="w-24"
                  @update:model-value="unit => updateFieldQualifier(name, { unit })"
                />
                <Select
                  v-else-if="field.base === 'ref'"
                  :model-value="field.accepts"
                  :options="typeIdOptions"
                  multiple
                  size="small"
                  class="min-w-0 flex-1"
                  @update:model-value="accepts => updateFieldQualifier(name, { accepts })"
                />
                <Checkbox
                  :model-value="field.nullable"
                  binary
                  @update:model-value="nullable => updateFieldQualifier(name, { nullable })"
                />
                <label class="text-supporting text-muted">{{ $t('typesPane.nullable') }}</label>
                <Button icon="pi pi-times" size="small" text severity="danger" @click="removeField(name)" />
              </div>
              <div class="flex items-center gap-1">
                <InputText v-model="newField.name" size="small" :placeholder="$t('typesPane.fieldName')" class="w-32" />
                <Select v-model="newField.base" :options="fieldBases" size="small" class="w-36" />
                <Button icon="pi pi-plus" size="small" text :disabled="!newField.name" @click="addField" />
              </div>
            </div>
          </Panel>

          <Panel :header="$t('typesPane.lifecycle')" toggleable>
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-supporting">{{ $t('typesPane.states') }}</span>
                <Button :label="$t('common.add')" size="small" text icon="pi pi-plus" @click="addState" />
              </div>
              <div v-for="(state, index) in states" :key="index" class="flex items-center gap-1">
                <InputText v-model="state.name" size="small" class="w-36" />
                <Button
                  :icon="state.initial ? 'pi pi-flag-fill' : 'pi-flag'"
                  size="small" text :severity="state.initial ? 'info' : 'secondary'"
                  v-tooltip.top="$t('typesPane.initial')"
                  @click="states.forEach(s => (s.initial = false)); state.initial = true"
                />
                <Button
                  :icon="state.terminal ? 'pi pi-circle-fill' : 'pi-circle'"
                  size="small" text :severity="state.terminal ? 'danger' : 'secondary'"
                  v-tooltip.top="$t('typesPane.terminal')"
                  @click="state.terminal = !state.terminal"
                />
                <Button icon="pi pi-times" size="small" text severity="danger" @click="states.splice(index, 1)" />
              </div>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-supporting">{{ $t('typesPane.transitions') }}</span>
                <Button :label="$t('common.add')" size="small" text icon="pi pi-plus" :disabled="!states.length" @click="addTransition" />
              </div>
              <div v-for="(transition, index) in transitions" :key="'t' + index" class="flex items-center gap-1">
                <Select v-model="transition.from" :options="stateNames" size="small" class="w-28" />
                <i class="pi pi-arrow-right text-muted" />
                <Select v-model="transition.to" :options="stateNames" size="small" class="w-28" />
                <InputText v-model="transition.intent" size="small" class="w-28" :placeholder="$t('typesPane.intent')" />
                <Button icon="pi pi-times" size="small" text severity="danger" @click="transitions.splice(index, 1)" />
              </div>
            </div>
          </Panel>

          <Panel :header="$t('typesPane.edges')" toggleable collapsed>
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <span class="text-supporting">{{ $t('typesPane.children') }}</span>
                <div v-for="(child, index) in childrenEdges" :key="'c' + index" class="flex items-center gap-1">
                  <InputText v-model="child.key" size="small" class="w-28" :placeholder="$t('typesPane.edgeKey')" />
                  <Select v-model="child.types" :options="typeIdOptions" multiple size="small" class="min-w-0 flex-1" />
                  <Select v-model="child.onRemove" :options="onRemoveOptions" size="small" class="w-28" />
                  <Button icon="pi pi-times" size="small" text severity="danger" @click="childrenEdges.splice(index, 1)" />
                </div>
                <Button :label="$t('common.add')" size="small" text icon="pi pi-plus" @click="childrenEdges.push({ key: '', types: [], onRemove: 'restrict' })" />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-supporting">{{ $t('typesPane.relations') }}</span>
                <div v-for="(relation, index) in relationEdges" :key="'r' + index" class="flex items-center gap-1">
                  <InputText v-model="relation.key" size="small" class="w-28" :placeholder="$t('typesPane.edgeKey')" />
                  <Select v-model="relation.types" :options="typeIdOptions" multiple size="small" class="min-w-0 flex-1" />
                  <Select v-model="relation.onRemove" :options="onRemoveOptions" size="small" class="w-28" />
                  <Button icon="pi pi-times" size="small" text severity="danger" @click="relationEdges.splice(index, 1)" />
                </div>
                <Button :label="$t('common.add')" size="small" text icon="pi pi-plus" @click="relationEdges.push({ key: '', types: [], onRemove: 'restrict' })" />
              </div>
            </div>
          </Panel>

          <Message v-if="saveError" severity="error" :closable="false">{{ saveError }}</Message>
          <div class="flex justify-end gap-2">
            <Button :label="$t('common.save')" icon="pi pi-check" :loading="saving" @click="saveType" />
          </div>
        </template>

        <template v-else>
          <Panel :header="$t('typesPane.schema')" toggleable collapsed>
            <pre class="overflow-auto text-supporting text-technical">{{ JSON.stringify(editor.schema, null, 2) }}</pre>
          </Panel>
        </template>
      </div>
    </Drawer>
  </StandardPage>
</template>

<script setup>
// Types pane: the declaration-authoring surface of the CTS source flip.
// Types are declared here (fields, lifecycle, edges) — the process canvas
// composes instances of them. System types compile from the domain content
// and are read-only; org types are stored by the cts-types feature and
// validated/versioned through the real registry (refuse-on-breaking diff).
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Drawer from 'primevue/drawer';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const toast = useToast();
const { t } = useI18n();

const types = ref([]);
const loading = ref(false);
const compileErrors = ref([]);
const editorOpen = ref(false);
const editor = ref(null);
const saving = ref(false);
const saveError = ref('');
const createDialog = ref(false);
const createDraft = ref({ id: '', class: 'item' });
const states = ref([]);
const transitions = ref([]);
const childrenEdges = ref([]);
const relationEdges = ref([]);
const newField = ref({ name: '', base: 'string' });

const authoredClasses = [
  { label: 'file', value: 'file' },
  { label: 'item', value: 'item' },
  { label: 'group', value: 'group' },
  { label: 'process', value: 'process' }
];
const fieldBases = ['string', 'number', 'boolean', 'instant', 'json', 'quantity', 'ref', 'list'];
const units = ['mm', 'm', 'm2', 'min', 'deg', 'percent', 'currency', 'count'];
const onRemoveOptions = ['restrict', 'cascade', 'detach'];

const editable = computed(() => editor.value?.scope === 'org');
const typeIdOptions = computed(() => types.value.map(type => type.id));
const stateNames = computed(() => states.value.map(state => state.name).filter(Boolean));

async function load() {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/cts/types');
    types.value = response.types || [];
    compileErrors.value = response.errors || [];
  } catch (error) {
    toast.add({ severity: 'error', summary: t('typesPane.loadFailed'), detail: error?.data?.message || error?.message, life: 8000 });
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openCreateDialog() {
  createDraft.value = { id: '', class: 'item' };
  createDialog.value = true;
}

async function createType() {
  const seedFields = createDraft.value.class === 'item'
    ? { serial: { base: 'string' } }
    : { name: { base: 'string' } };
  const seedStates = ['item', 'process'].includes(createDraft.value.class)
    ? { main: { initial: 'active', values: ['active', 'closed'], terminal: ['closed'] } }
    : null;
  const declaration = {
    id: createDraft.value.id.trim(),
    class: createDraft.value.class,
    fields: seedFields,
    ...(seedStates ? { states: seedStates, transitions: [{ from: 'active', to: 'closed' }] } : {})
  };
  try {
    await $fetch('/api/admin/cts/types', { method: 'POST', body: declaration });
    createDialog.value = false;
    await load();
    const created = types.value.find(type => type.id === declaration.id);
    if (created) openEditor(created);
  } catch (error) {
    saveError.value = error?.data?.message || error?.message;
    toast.add({ severity: 'error', summary: t('typesPane.createFailed'), detail: saveError.value, life: 9000 });
  }
}

function openEditor(type) {
  editor.value = type;
  saveError.value = '';
  states.value = (type.states?.main?.values || []).map(name => ({
    name,
    initial: name === type.states?.main?.initial,
    terminal: (type.states?.main?.terminal || []).includes(name)
  }));
  transitions.value = (type.transitions || []).map(transition => ({ ...transition }));
  childrenEdges.value = Object.entries(type.edges?.children || {}).map(([key, declaration]) => ({
    key, types: [...declaration.types], onRemove: declaration.onRemove || 'restrict', lineageKey: declaration.lineageKey
  }));
  relationEdges.value = Object.entries(type.edges?.relations || {}).map(([key, declaration]) => ({
    key, types: [...declaration.types], onRemove: declaration.onRemove || 'restrict'
  }));
  editorOpen.value = true;
}

function addField() {
  const name = String(newField.value.name || '').trim();
  if (!name) return;
  const descriptor = { base: newField.value.base };
  if (newField.value.base === 'quantity') descriptor.unit = 'mm';
  if (newField.value.base === 'ref') descriptor.accepts = typeIdOptions.value.length ? [typeIdOptions.value[0]] : [];
  editor.value.fields[name] = descriptor;
  newField.value = { name: '', base: 'string' };
}

function updateField(name, base) {
  const field = editor.value.fields[name];
  const updated = { base };
  if (base === 'quantity') updated.unit = field.unit || 'mm';
  if (base === 'ref') updated.accepts = field.accepts || [];
  if (field.nullable) updated.nullable = true;
  if (field.slot) updated.slot = field.slot;
  editor.value.fields[name] = updated;
}

function updateFieldQualifier(name, qualifier) {
  editor.value.fields[name] = { ...editor.value.fields[name], ...qualifier };
}

function removeField(name) {
  delete editor.value.fields[name];
}

function addState() {
  states.value.push({ name: `state${states.value.length + 1}`, initial: !states.value.some(s => s.initial), terminal: false });
}

function addTransition() {
  if (!states.value.length) return;
  transitions.value.push({
    from: states.value[0].name,
    to: states.value[states.value.length - 1].name,
    intent: ''
  });
}

async function saveType() {
  if (!editable.value) return;
  const base = editor.value;
  const values = states.value.map(state => String(state.name || '').trim()).filter(Boolean);
  const declaration = {
    id: base.id,
    class: base.class,
    fields: base.fields || {},
    ...(base.payload ? { payload: base.payload } : {}),
    ...(Object.keys(base.render || {}).length ? { render: base.render } : {})
  };
  const children = {};
  for (const child of childrenEdges.value) {
    if (child.key && child.types.length) children[child.key] = { types: [...child.types], onRemove: child.onRemove, ...(child.lineageKey ? { lineageKey: child.lineageKey } : {}) };
  }
  const relations = {};
  for (const relation of relationEdges.value) {
    if (relation.key && relation.types.length) relations[relation.key] = { types: [...relation.types], onRemove: relation.onRemove };
  }
  if (Object.keys(children).length || Object.keys(relations).length) {
    declaration.edges = { ...(Object.keys(children).length ? { children } : {}), ...(Object.keys(relations).length ? { relations } : {}) };
  }
  if (values.length) {
    declaration.states = {
      main: {
        initial: states.value.find(state => state.initial)?.name || values[0],
        values,
        terminal: states.value.filter(state => state.terminal).map(state => state.name)
      }
    };
    declaration.transitions = transitions.value
      .filter(transition => values.includes(transition.from) && values.includes(transition.to))
      .map(transition => transition.intent ? { from: transition.from, to: transition.to, intent: transition.intent } : { from: transition.from, to: transition.to });
  }
  saving.value = true;
  saveError.value = '';
  try {
    const response = await $fetch('/api/admin/cts/types', { method: 'POST', body: declaration });
    await load();
    const saved = types.value.find(type => type.id === base.id);
    if (saved) editor.value = saved;
    toast.add({ severity: 'success', summary: `${base.id} v${response.type?.version || '?'}`, life: 2000 });
  } catch (error) {
    saveError.value = error?.data?.message || error?.message;
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(type) {
  if (!window.confirm(t('typesPane.deleteConfirm', { id: type.id }))) return;
  try {
    await $fetch(`/api/admin/cts/types/${encodeURIComponent(type.id)}`, { method: 'DELETE' });
    if (editor.value?.id === type.id) editorOpen.value = false;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.delete'), detail: error?.data?.message || error?.message, life: 8000 });
  }
}
</script>
