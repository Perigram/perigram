<template>
  <div class="flex flex-col gap-6">
    <section v-for="section in sections" :key="section.region.id" class="flex min-w-0 flex-col gap-3">
      <div class="flex min-w-0 items-center justify-between gap-3">
        <h2 class="m-0 min-w-0 truncate text-base font-semibold">
          {{ sectionLabel(section) }}
        </h2>
        <div class="flex shrink-0 items-center gap-2">
          <GeneratedActionButton
            v-for="action in collectionActions(section.region)"
            :key="action.actionId"
            :action-id="action.actionId"
            @execute="selectedAction => $emit('execute-action', selectedAction, null, actionContext(section))"
          />
          <Button
            v-if="section.region.route"
            icon="pi pi-arrow-right"
            text
            rounded
            size="small"
            :aria-label="sectionLabel(section)"
            @click="navigateTo(section.region.route)"
          />
        </div>
      </div>
      <div class="flex min-w-0 gap-3 overflow-x-auto pb-2">
        <EntityCard
          v-for="entity in section.items.slice(0, 12)"
          :key="entity._id || entity.id || entity.identity?.uid"
          class="min-w-64 max-w-72"
          :entity="entity"
          :entity-type="section.source.entityType"
          :surface="section.region.surface || 'card'"
          variant="card"
          @refresh="$emit('refresh')"
        >
          <template v-if="detailRouteFor(section, entity)" #title>
            <TraceChain :entity="entity" class="mb-2" />
            <div class="flex min-w-0 flex-col gap-3">
              <button
                type="button"
                class="min-w-0 max-w-full text-left text-primary underline-offset-4 hover:underline"
                @click.stop="openEntity(section, entity)"
              >
                <IdentityBlock :entity="entity" />
              </button>
              <EntityStatus
                v-if="entity.status"
                :entity="entity"
                :entity-type="section.source.entityType"
                variant="inline"
                @refresh="$emit('refresh')"
                @transitioned="$emit('refresh')"
              />
            </div>
          </template>
          <EntitySurfaceContent :entity="entity" :entity-type="section.source.entityType" :surface="section.region.surface || 'card'" />
          <template v-if="entityActionsFor(section, entity).length" #footer>
            <div class="flex flex-wrap justify-end gap-2">
              <GeneratedActionButton
                v-for="action in entityActionsFor(section, entity)"
                :key="action.actionId"
                :action-id="action.actionId"
                @execute="selectedAction => $emit('execute-action', selectedAction, entity)"
              />
            </div>
          </template>
        </EntityCard>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { useAuthStore } from '~/stores/auth';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { actionAppliesToEntity, parentBoundCreateAppliesToEntityType } from '~/components/generated/action-visibility.js';
import { generatedRegionLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true }
});

defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const { t, te } = useI18n();

const sections = computed(() => props.screen.regions
  .map(region => {
    const state = props.sourceState(region.sourceId);
    return {
      region,
      source: state.source || {},
      items: state.items || []
    };
  })
  .filter(section => section.source.entityType));

function collectionActions(region = {}) {
  return resolvedRegionActions(region)
    .filter(action => action?.actionKind === 'createEntity');
}

function entityActionsFor(section = {}, entity = {}) {
  return resolvedRegionActions(section.region).filter(action => (
    !parentBoundCreateAppliesToEntityType(action, section.source.entityType)
    && actionAppliesToEntity(action, entity, section.source.entityType)
  ));
}

function resolvedRegionActions(region = {}) {
  return [...new Map((region.actions || [])
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .map(action => [action.actionId || action.id, action])).values()];
}

function actionContext(section = {}) {
  return {
    region: section.region,
    source: section.source,
    entityType: section.source.entityType,
    parentEntityType: section.source.entityType,
    parentOptions: section.items.map(entity => ({
      label: entity.identity?.name || entity.identity?.uid || entity._id,
      value: entity._id || entity.identity?.uid,
      entity
    }))
  };
}

function sectionLabel(section = {}) {
  return generatedRegionLabel(section.region, section.source, { t, te });
}

function openEntity(section, entity) {
  const route = detailRouteFor(section, entity);
  if (route) navigateTo(route);
}

function detailRouteFor(section = {}, entity = {}) {
  return detailRouteForEntity({
    entity,
    entityType: section.source.entityType,
    screenKey: section.region.screenKey || props.screen.screenKey || props.screen.id,
    manifest: authStore.screenManifest
  });
}
</script>
