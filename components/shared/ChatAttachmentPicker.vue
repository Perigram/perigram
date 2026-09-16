<template>
  <Popover ref="popover">
    <PanelMenu
      v-model:expandedKeys="expandedKeys"
      :model="menuItems"
      multiple
      class="w-72 [&_.p-panelmenu-panel]:border-0"
      :aria-label="$t('support.attach')"
      @update:expandedKeys="handleExpand"
    />
  </Popover>
</template>

<script setup>
import { computed, ref } from 'vue'
import PanelMenu from 'primevue/panelmenu'
import Popover from 'primevue/popover'
import { useI18n } from 'vue-i18n'
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue'
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js'
import { generatedDetailScreenForEntityType } from '~/components/generated/detail-screen-actions.js'
import { generatedActionLabel, generatedRegionLabel } from '~/utils/generated-labels.js'
import { useAuthStore } from '~/stores/auth'
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js'
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'

/**
 * PanelMenu attachment picker: home-screen sections as accordion roots whose
 * children list generated create entries right beside entity entries — at
 * every level (section collections and each entity's detail-screen child
 * creates). Entities expand through pure lineage nesting; tapping an entity
 * selects it and closes; tapping a create entry runs the generated flow.
 */
const props = defineProps({
  recipientUserId: { type: String, default: '' }
})

const emit = defineEmits(['select', 'create-action'])

const { t, te } = useI18n()
const popover = ref(null)
const expandedKeys = ref({})
const childrenByParentKey = ref(new Map())
const loadedKeys = ref(new Set())
const loadingKeys = ref(new Set())
const authStore = useAuthStore()
const domainUi = useCutkitDomainUi()
const effectiveContainment = useEffectiveContainment()

const iconFor = (type) => domainUi.getIcon(type) || 'pi pi-box'

const entityId = (entity = null) => {
  const value = entity?._id || entity?.identity?.uid || ''
  return value ? String(value) : ''
}

const entityLabel = (entity = null, type = '') => (
  entity?.identity?.name || entity?.identity?.serial || entity?.identity?.uid
  || entityId(entity) || type
)

// Home-screen sections, filtered like the sidebar: list sources whose type
// is not a lineage-bound child. Source lineageBindings are org-wide, so only
// bindings declaring this source's type as the child count.
const sections = computed(() => {
  const home = authStore.screenManifest.find(screen => screen.template === 'home')
  if (!home) return []
  return (home.regions || [])
    .map(region => {
      const source = (home.sources || []).find(candidate => candidate.id === region.sourceId) || {}
      if (!source.entityType || source.mode === 'single') return null
      const parentBound = (source.lineageBindings || [])
        .some(binding => binding.childEntityType === source.entityType
          && binding.ancestorEntityType !== 'organization')
      if (parentBound) return null
      return { region, source, label: generatedRegionLabel(region, source, { t, te }) }
    })
    .filter(Boolean)
})

function createActionsFor(actionIds = []) {
  return [...new Set(actionIds)]
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(action => action.actionKind === 'createEntity' && isGeneratedSurfaceAction(action))
}

// Child-type create entries for an entity: the createEntity actions of the
// list regions on its type's compiled detail screen (the sidebar's
// child-create derivation).
function childCreateActions(entityType = '') {
  const detailScreen = generatedDetailScreenForEntityType({
    screens: authStore.screenManifest,
    entityType
  })
  if (!detailScreen) return []
  const actions = []
  for (const region of detailScreen.regions || []) {
    const source = (detailScreen.sources || []).find(candidate => candidate.id === region.sourceId)
    if (!source || source.mode !== 'list' || source.entityType === entityType) continue
    actions.push(...createActionsFor(region.actions))
  }
  return actions.filter((action, index, list) => (
    list.findIndex(candidate => candidate.actionId === action.actionId) === index
  ))
}

const createEntry = (parentKey, action) => ({
  key: `${parentKey}:create:${action.actionId}`,
  label: generatedActionLabel(action, action.actionId, { t, te }),
  icon: 'pi pi-plus',
  command: () => {
    hide()
    emit('create-action', action)
  }
})

const sectionChildren = (section) => {
  const sectionKey = `type:${section.source.entityType}`
  const entries = createActionsFor(section.region.actions).map(action => createEntry(sectionKey, action))
  if (loadingKeys.value.has(sectionKey) && !loadedKeys.value.has(sectionKey)) {
    return [...entries, { key: `${sectionKey}:loading`, label: t('common.loading'), icon: 'pi pi-spinner pi-spin' }]
  }
  if (!loadedKeys.value.has(sectionKey)) return entries.length ? entries : undefined
  return [...entries, ...loadedChildren(sectionKey).map(item => entityEntry(item))]
}

const loadedChildren = (parentKey) => (childrenByParentKey.value.get(parentKey) || [])
  .map(child => ({
    key: child.key,
    type: child.type,
    name: child.name,
    entity: child.entity
  }))

const entityEntry = (item) => {
  const key = item.key
  const option = item.option || null
  const entries = childCreateActions(item.type).map(action => createEntry(key, action))
  const expandable = isExpandable(item)
  const items = loadingKeys.value.has(key) && !childrenByParentKey.value.has(key)
    ? [...entries, { key: `${key}:loading`, label: t('common.loading'), icon: 'pi pi-spinner pi-spin' }]
    : expandable
      ? [...entries, ...loadedChildren(key).map(child => entityEntry(child))]
      : undefined
  // Submenu rows toggle only; leaves select. A row that both expands and
  // commands closes the popup on expand (Pressing chevron = select + close).
  if (items) {
    return {
      key,
      label: item.name || entityLabel(item.entity, item.type),
      icon: iconFor(item.type),
      items
    }
  }
  return {
    key,
    label: item.name || entityLabel(item.entity, item.type),
    icon: iconFor(item.type),
    command: () => {
      hide()
      emit('select', option
        ? { ...option, type: item.type }
        : {
            type: item.type,
            value: entityId(item.entity) || key.split(':').slice(1).join(':'),
            label: item.name || entityLabel(item.entity, item.type),
            entity: item.entity || null
          })
    }
  }
}

const menuItems = computed(() => sections.value.map(section => ({
  key: `type:${section.source.entityType}`,
  label: section.label,
  icon: iconFor(section.source.entityType),
  items: sectionChildren(section)
})))

const isExpandable = (item) => {
  if ((childrenByParentKey.value.get(item.key) || []).length) return true
  if (loadedKeys.value.has(item.key)) return false
  return effectiveContainment().some(relation => relation.parentType === item.type)
    || childCreateActions(item.type).length > 0
}

function handleExpand(keys) {
  // v-model updates expandedKeys before this handler runs, so diffing
  // against it never sees new keys; the loaders are idempotent and fire for
  // every open key.
  expandedKeys.value = keys
  for (const [key, open] of Object.entries(keys)) {
    if (open) loadChildrenForKey(key)
  }
}

async function loadChildrenForKey(key) {
  if (!key || key.includes(':create:') || key.endsWith(':loading')) return
  if (loadedKeys.value.has(key) || loadingKeys.value.has(key)) return
  if (key.startsWith('type:')) {
    await loadSectionOptions(key.slice('type:'.length), key)
    return
  }
  const [type, ...rest] = key.split(':')
  await loadChildren({ key, type, entity: { _id: rest.join(':') } })
}

async function loadSectionOptions(entityType, sectionKey) {
  loadingKeys.value = new Set([...loadingKeys.value, sectionKey])
  try {
    const loaded = await $fetch('/api/support/entity-options', {
      query: {
        type: entityType,
        ...(props.recipientUserId ? { recipientUserId: props.recipientUserId } : {})
      }
    })
    const items = (loaded || [])
      .filter(option => option?.value)
      .map(option => ({
        key: `type:${entityType}:${option.value}`,
        type: entityType,
        name: option.label,
        entity: option.entity || null,
        option
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
    // the compiled detail sources. Relation-linked entities are skipped so
    // the menu stays a hierarchy.
    const sources = linkedExplorerChildSources({
      linkedItems: [parent],
      screens: authStore.screenManifest,
      containment: effectiveContainment()
    })
    const loaded = await Promise.all(sources.map(async source => {
      try {
        const entities = await $fetch(domainUi.getListEndpoint(source.entityType, source.filters))
        return (Array.isArray(entities) ? entities : []).map(entity => ({
          key: `${source.entityType}:${entityId(entity)}`,
          type: source.entityType,
          name: entityLabel(entity, source.entityType),
          entity
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

// Each open resets: option lists are recipient-scoped per conversation, so
// cached branches from another conversation must not leak.
function toggle(event) {
  expandedKeys.value = {}
  childrenByParentKey.value = new Map()
  loadedKeys.value = new Set()
  loadingKeys.value = new Set()
  popover.value?.toggle(event)
}

const hide = () => popover.value?.hide?.()

defineExpose({ toggle, hide })
</script>
