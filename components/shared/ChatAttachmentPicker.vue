<template>
  <Popover ref="popover">
    <div class="flex w-80 flex-col gap-1">
      <!-- File entries: the same attach surface owns files and entity refs
           (SPEC.md §Chat files). Hidden inputs ride the popover — device
           upload and camera capture (photo/video) — and the host stages
           what they emit. -->
      <input
        ref="fileInput"
        class="hidden"
        type="file"
        multiple
        :accept="filesAccept || undefined"
        data-testid="chat-file-input"
        @change="onFilesPicked"
      >
      <input
        ref="cameraInput"
        class="hidden"
        type="file"
        accept="image/*,video/*"
        capture="environment"
        data-testid="chat-camera-input"
        @change="onFilesPicked"
      >
      <Button
        v-if="filesEnabled"
        class="justify-start"
        icon="pi pi-camera"
        :label="$t('support.captureMedia')"
        severity="secondary"
        outlined
        size="small"
        data-testid="chat-camera-trigger"
        @click="cameraInput?.click()"
      />
      <Button
        v-if="filesEnabled"
        class="justify-start"
        icon="pi pi-upload"
        :label="$t('support.attachFiles')"
        severity="secondary"
        outlined
        size="small"
        data-testid="chat-file-trigger"
        @click="fileInput?.click()"
      />
      <Tree
        v-model:expanded-keys="expandedKeys"
        :value="nodes"
        selection-mode="single"
        filter
        filter-mode="lenient"
        :filter-placeholder="$t('common.search')"
        :aria-label="$t('support.attach')"
        class="max-h-96 overflow-y-auto p-0"
        @node-select="onNodeSelect"
        @node-expand="onNodeExpand"
      >
        <template #default="{ node }">
          <span
            v-if="node.data?.kind === 'section'"
            class="flex min-w-0 flex-1 items-center gap-2"
          >
            <i :class="iconFor(node.data.section.source.typeId)" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-label">{{ node.label }}</span>
          </span>
          <span
            v-else-if="node.data?.kind === 'create'"
            class="flex min-w-0 flex-1 items-center gap-1"
          >
            <i class="pi pi-plus shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-muted">{{ node.label }}</span>
          </span>
          <span
            v-else-if="node.data?.kind === 'loading'"
            class="flex min-w-0 flex-1 items-center gap-1 text-muted"
          >
            <ProgressSpinner class="h-3.5 w-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
          </span>
          <InstanceInlineRef
            v-else-if="node.data?.item"
            :type="node.data.item.type"
            :entity="node.data.item.entity"
            :fetch="false"
            :fields="[]"
            :interactive="false"
            variant="inline"
          />
        </template>
      </Tree>
    </div>
  </Popover>
</template>

<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import ProgressSpinner from 'primevue/progressspinner'
import Tree from 'primevue/tree'
import { useI18n } from 'vue-i18n'
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue'
import { isGeneratedSurfaceAction } from '~/utils/action-visibility.js'
import { generatedDetailScreenForTypeId } from '~/components/generated/detail-screen-actions.js'
import { generatedActionLabel, generatedRegionLabel } from '~/utils/generated-labels.js'
import { useAuthStore } from '~/stores/auth'
import { useInstancesStore } from '~/stores/instances'
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'
import { resolveSourceFilters } from '~/utils/generated-screen-source.js'

/**
 * Attachment picker: the one attach surface for entity refs AND files
 * (SPEC.md §Chat files). A leading upload entry (hidden input; the host
 * owns staging and sends `files`) rides above the home sidebar's explorer
 * tree, densely padded, in a Popover. Sections load through the SAME
 * compiled home-screen list sources the sidebar renders (instances store
 * + resolved source filters — the full user-available window, not a
 * capped options endpoint), search is the Tree's built-in lenient filter,
 * and each section's generated create entries list right beside the
 * entity entries — every entity repeats the pattern through its type's
 * detail-screen child creates. Entities expand through pure lineage
 * nesting (expansion is node-driven, so lazy loads never key-parse); one
 * tap on an entity selects it and closes, a create entry runs the
 * generated flow in the host.
 */
const emit = defineEmits(['select', 'create-action', 'files'])

const props = defineProps({
  // Whether this chat accepts file uploads at all (the host's early
  // check: common and party-target chats always do; instance chats only
  // with an accepting file child).
  filesEnabled: { type: Boolean, default: false },
  // The union accept string constraining the file input in instance chats.
  filesAccept: { type: String, default: '' }
})

const { t, te } = useI18n()

const popover = ref(null)
const fileInput = ref(null)
const cameraInput = ref(null)
const expandedKeys = ref({})
const childrenByParentKey = ref(new Map())
const loadedKeys = ref(new Set())
const loadingKeys = ref(new Set())
const authStore = useAuthStore()
const instances = useInstancesStore()
const effectiveContainment = useEffectiveContainment()

const iconFor = (type) => instances.iconFor(type)

const instanceId = (entity = null) => {
  const value = entity?._id || entity?._id || ''
  return value ? String(value) : ''
}

const entityLabel = (entity = null, type = '') => (
  entity?.name || entity?.serial || entity?._id
  || instanceId(entity) || type
)

// Home-screen sections, filtered like the sidebar: list sources whose type
// is not a lineage-bound child. Source lineageBindings are org-wide, so only
// bindings declaring this source's type as the child count.
const homeScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'home') || null)
const sections = computed(() => {
  const home = homeScreen.value
  if (!home) return []
  return (home.regions || [])
    .map(region => {
      const source = (home.sources || []).find(candidate => candidate.id === region.sourceId) || {}
      if (!source.typeId || source.mode === 'single') return null
      const parentBound = (source.lineageBindings || [])
        .some(binding => binding.childTypeId === source.typeId
          && binding.parentTypeId !== 'organization')
      if (parentBound) return null
      return { region, source, label: generatedRegionLabel(region, source, { t, te }) }
    })
    .filter(Boolean)
})

function createActionsFor(actionIds = []) {
  return [...new Set(actionIds)]
    .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(action => action.actionKind === 'createInstance' && isGeneratedSurfaceAction(action))
}

// Child-type create entries for an entity: the createEntity actions of the
// list regions on its type's compiled detail screen (the sidebar's
// child-create derivation).
function childCreateActions(typeId = '') {
  const detailScreen = generatedDetailScreenForTypeId({
    screens: authStore.screenManifest,
    typeId
  })
  if (!detailScreen) return []
  const actions = []
  for (const region of detailScreen.regions || []) {
    const source = (detailScreen.sources || []).find(candidate => candidate.id === region.sourceId)
    if (!source || source.mode !== 'list' || source.typeId === typeId) continue
    actions.push(...createActionsFor(region.actions))
  }
  return actions.filter((action, index, list) => (
    list.findIndex(candidate => candidate.id === action.id) === index
  ))
}

const sectionKey = (section) => `section:${section.region.id}`

const createNode = (parentKey, action) => ({
  key: `${parentKey}:create:${action.id}`,
  label: generatedActionLabel(action, action.id, { t, te }),
  selectable: true,
  data: { kind: 'create', action }
})

const loadingNode = (parentKey) => ({
  key: `${parentKey}:loading`,
  label: t('common.loading'),
  selectable: false,
  data: { kind: 'loading' }
})

const entityNode = (item) => {
  const creates = childCreateActions(item.type).map(action => createNode(item.key, action))
  const expandable = isExpandable(item)
  let children
  if (expandable) {
    const loaded = (childrenByParentKey.value.get(item.key) || [])
      .map(child => entityNode(child))
    children = loadingKeys.value.has(item.key) && !childrenByParentKey.value.has(item.key)
      ? [...creates, loadingNode(item.key)]
      : [...creates, ...loaded]
  }
  return {
    key: item.key,
    label: item.name || entityLabel(item.entity, item.type),
    selectable: true,
    leaf: !expandable,
    children,
    data: { kind: 'instance', item }
  }
}

const sectionChildren = (section) => {
  const key = sectionKey(section)
  const creates = createActionsFor(section.region.actions).map(action => createNode(key, action))
  if (loadingKeys.value.has(key) && !loadedKeys.value.has(key)) {
    return [...creates, loadingNode(key)]
  }
  if (!loadedKeys.value.has(key)) {
    return creates.length ? [...creates, loadingNode(key)] : [loadingNode(key)]
  }
  return [...creates, ...(childrenByParentKey.value.get(key) || []).map(item => entityNode(item))]
}

const nodes = computed(() => sections.value.map(section => ({
  key: sectionKey(section),
  label: section.label,
  selectable: false,
  leaf: false,
  data: { kind: 'section', section },
  children: sectionChildren(section)
})))

const isExpandable = (item) => {
  if ((childrenByParentKey.value.get(item.key) || []).length) return true
  if (loadedKeys.value.has(item.key)) return false
  return effectiveContainment().some(relation => relation.parentType === item.type)
    || childCreateActions(item.type).length > 0
}

function onNodeSelect(node) {
  if (node.data?.kind === 'create') {
    hide()
    emit('create-action', node.data.action)
    return
  }
  const item = node.data?.item
  if (item?.type) {
    hide()
    emit('select', {
      type: item.type,
      value: instanceId(item.entity) || item.key,
      label: item.name || entityLabel(item.entity, item.type),
      entity: item.entity || null
    })
  }
}

// Picked files hand to the host (it owns staging, the per-file child-type
// choice, and the send); the popover closes like an entity pick.
function onFilesPicked(event) {
  const files = [...(event.target?.files || [])]
  if (event.target) event.target.value = ''
  if (!files.length) return
  hide()
  emit('files', files)
}

// Expansion is node-driven: section nodes load their item list, entity
// nodes load lineage children. No key parsing, so nested loads cannot be
// misrouted the way the old prefix-based keys were.
function onNodeExpand(node) {
  if (node.data?.kind === 'section') {
    loadSectionOptions(node.data.section, node.key)
    return
  }
  if (node.data?.item) loadChildren(node.data.item)
}

// Sections load exactly like the home sections of the sidebar: the resolved
// filters of the compiled source through the instances store, so the picker
// browses the same full user-available window the PanelMenu renders
// (shared observation cache, no option-list cap).
async function loadSectionOptions(section, sectionKey) {
  if (loadedKeys.value.has(sectionKey) || loadingKeys.value.has(sectionKey)) return
  loadingKeys.value = new Set([...loadingKeys.value, sectionKey])
  try {
    const typeId = section.source.typeId
    const sectionInstances = await instances.listInstances(
      instances.canonicalTypeKey(typeId),
      resolveSourceFilters(section.source, homeScreen.value || {})
    )
    const items = (Array.isArray(sectionInstances) ? sectionInstances : [])
      .filter(instance => instanceId(instance))
      .map(instance => ({
        key: `${typeId}:${instanceId(instance)}`,
        type: typeId,
        entity: instance,
        name: entityLabel(instance, typeId)
      }))
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [sectionKey, items]])
  } catch (error) {
    console.error('Failed to load chat attachment options:', error)
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [sectionKey, []]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(k => k !== sectionKey))
    loadedKeys.value = new Set([...loadedKeys.value, sectionKey])
  }
}

async function loadChildren(parent) {
  if (!parent?.key || loadedKeys.value.has(parent.key) || loadingKeys.value.has(parent.key)) return
  loadingKeys.value = new Set([...loadingKeys.value, parent.key])
  try {
    // Lineage only, mirroring the sidebar nesting: containment children from
    // the compiled detail sources. Relation-linked instances are skipped so
    // the tree stays a hierarchy.
    const sources = linkedExplorerChildSources({
      linkedItems: [parent],
      screens: authStore.screenManifest,
      containment: effectiveContainment()
    })
    const loaded = await Promise.all(sources.map(async source => {
      try {
        const childInstances = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters)
        return (Array.isArray(childInstances) ? childInstances : []).map(instance => ({
          key: `${source.typeId}:${instanceId(instance)}`,
          type: source.typeId,
          name: entityLabel(instance, source.typeId),
          entity: instance
        }))
      } catch {
        return []
      }
    }))
    const seen = new Set([parent.key])
    const merged = loaded.flat().filter(item => {
      if (!item.key || seen.has(item.key)) return false
      seen.add(item.key)
      return true
    })
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [parent.key, merged]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(k => k !== parent.key))
    loadedKeys.value = new Set([...loadedKeys.value, parent.key])
  }
}

// Each open resets: expanded state and loaded branches reload so the tree
// reflects the current workspace pool. Sections start expanded with their
// lists loading, like the sidebar.
function toggle(event) {
  expandedKeys.value = {}
  childrenByParentKey.value = new Map()
  loadedKeys.value = new Set()
  loadingKeys.value = new Set()
  for (const section of sections.value) {
    expandedKeys.value = { ...expandedKeys.value, [sectionKey(section)]: true }
    loadSectionOptions(section, sectionKey(section))
  }
  popover.value?.toggle(event)
}

const hide = () => popover.value?.hide?.()

defineExpose({ toggle, hide })
</script>
