<template>
  <div class="flex flex-col gap-6">
    <section
      v-for="section in sections"
      :key="section.region.id"
      class="flex min-w-0 flex-col gap-3"
      :data-home-type-id="section.source.typeId"
    >
      <div class="flex min-w-0 items-center justify-between gap-3">
        <h2 class="m-0 min-w-0 truncate text-section-heading">
          {{ sectionLabel(section) }}
        </h2>
        <div class="flex shrink-0 items-center gap-2">
          <GeneratedActionButton
            v-for="action in collectionActions(section.region)"
            :key="action.id"
            :action-id="action.id"
            @execute="selectedAction => $emit('execute-action', selectedAction, null, actionContext(section))"
          />
          <Button
            v-if="sectionRoute(section)"
            icon="pi pi-arrow-right"
            text
            rounded
            size="small"
            :aria-label="sectionLabel(section)"
            @click="navigateTo(sectionRoute(section))"
          />
        </div>
      </div>
      <div class="flex w-full max-w-full min-w-0 flex-nowrap gap-3 overflow-x-auto pb-2">
        <div
          v-for="entity in section.items.slice(0, 12)"
          :key="entity._id || entity.id || entity.identity?.uid"
          class="w-[18rem] min-w-[18rem] flex-none"
          :data-entity-id="entity._id || entity.id || entity.identity?.uid"
        >
          <InstanceCard
            :entity="entity"
            :type-id="section.source.typeId"
            :surface="section.region.surface || 'card'"
            variant="card"
            :show-trace="false"
            @refresh="$emit('refresh')"
          >
            <template v-if="detailRouteFor(section, entity)" #title>
              <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <Button
                  link
                  class="min-w-0 max-w-full flex-1 !justify-start"
                  :aria-label="entity.identity?.name || $t('common.open')"
                  @click.stop="openEntity(section, entity)"
                >
                  <IdentityBlock :entity="entity" />
                </Button>
                <InstanceStatus
                  v-if="entity.status"
                  :entity="entity"
                  :type-id="section.source.typeId"
                  variant="inline"
                  @refresh="$emit('refresh')"
                  @transitioned="$emit('refresh')"
                />
              </div>
            </template>
            <InstanceSurfaceContent
              :entity="entity"
              :type-id="section.source.typeId"
              :surface="section.region.surface || 'card'"
              suppress-child-summaries
              relation-variant="compact"
            />
            <template v-if="hasEditorAction(section.source.typeId) || entityActionsFor(section, entity).length || detailRouteFor(section, entity)" #footer>
              <div class="flex flex-wrap justify-end gap-2">
                <Button
                  v-if="detailRouteFor(section, entity)"
                  icon="pi pi-external-link"
                  text
                  rounded
                  size="small"
                  :aria-label="$t('common.open')"
                  @click.stop="openEntity(section, entity)"
                />
                <component
                  :is="editorActionFor(section.source.typeId)"
                  v-if="editorActionFor(section.source.typeId)"
                  :entity="entity"
                  @refresh="$emit('refresh')"
                />
                <GeneratedActionButton
                  v-for="action in entityActionsFor(section, entity)"
                  :key="action.id"
                  :action-id="action.id"
                  @execute="selectedAction => $emit('execute-action', selectedAction, entity)"
                />
              </div>
            </template>
          </InstanceCard>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, provide } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import InstanceStatus from '~/components/shared/status/InstanceStatus.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { instanceEditorActionFor, instanceHasEditorAction } from '~/components/generated/instance-editor-action.js';
import { useAuthStore } from '~/stores/auth';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { actionAppliesToEntity, isCreateAction, isGeneratedSurfaceAction, parentBoundCreateAppliesToTypeId } from '~/components/generated/action-visibility.js';
import { generatedRegionLabel } from '~/utils/generated-labels.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true }
});

const emit = defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const hasEditorAction = instanceHasEditorAction;
const editorActionFor = instanceEditorActionFor;
const { t, te } = useI18n();
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});

const sections = computed(() => props.screen.regions
  .map(region => {
    const state = props.sourceState(region.sourceId);
    return {
      region,
      source: state.source || {},
      items: state.items || [],
      rawItems: state.rawItems || state.items || []
    };
  })
  .filter(section => section.source.typeId && shouldRenderHomeSection(section)));

function collectionActions(region = {}) {
  return resolvedRegionActions(region)
    .filter(isCreateAction);
}

function entityActionsFor(section = {}, entity = {}) {
  return resolvedRegionActions(section.region).filter(action => (
    isGeneratedSurfaceAction(action) &&
    !parentBoundCreateAppliesToTypeId(action, section.source.typeId)
    && actionAppliesToEntity(action, entity, section.source.typeId)
  ));
}

function resolvedRegionActions(region = {}) {
  return [...new Map((region.actions || [])
    .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .map(action => [action.id, action])).values()];
}

function actionContext(section = {}) {
  return {
    region: section.region,
    source: section.source,
    typeId: section.source.typeId,
    parentTypeId: section.source.typeId,
    parentOptions: section.items.map(entity => ({
      label: entity.identity?.name || entity.identity?.uid || entity._id,
      value: entity._id || entity.identity?.uid,
      entity
    }))
  };
}

function sectionRoute(section = {}) {
  if (section.region.route) return section.region.route;
  const typeId = section.source.typeId;
  const screen = authStore.screenManifest.find(item => (
    item.template === 'typeList'
    && item.typeId === typeId
    && (item.screenKey || item.id) === section.region.screenKey
  )) || authStore.screenManifest.find(item => (
    item.template === 'typeList'
    && item.typeId === typeId
    && item.placement === 'hub'
  ));
  return screen?.route || '';
}

function sectionLabel(section = {}) {
  return generatedRegionLabel(section.region, section.source, { t, te });
}

function openEntity(section, entity) {
  const route = detailRouteFor(section, entity);
  if (route) navigateTo(route);
}

function detailRouteFor(section = {}, entity = {}) {
  return detailRouteForInstance({
    entity,
    typeId: section.source.typeId,
    screenKey: section.region.screenKey || props.screen.screenKey || props.screen.id,
    manifest: authStore.screenManifest
  });
}
</script>
