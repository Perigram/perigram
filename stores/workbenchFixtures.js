import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  contextEntityOptions,
  contextToScenario,
  createWorkbenchContext,
  findContextEntity,
  normalizeWorkbenchContext,
  upsertContextEntities
} from '~/test-data/workbench-context.js';

export const useWorkbenchFixturesStore = defineStore('workbenchFixtures', () => {
  const context = ref(createWorkbenchContext());
  const loading = ref(false);
  const error = ref('');
  const compiledWorkflows = computed(() => context.value.workflows || null);
  const seeded = computed(() => Boolean(context.value.persisted));

  const scenario = computed(() => contextToScenario(context.value));
  const entityOptions = computed(() => contextEntityOptions(context.value));
  const refs = computed(() => context.value.refs || {});
  const access = computed(() => context.value.access || {});
  const commandDefaults = computed(() => context.value.commandBindings || {});

  function rebuild({ workflows, entities, commands } = {}) {
    context.value = createWorkbenchContext({
      workflows,
      entities,
      commands
    });
    error.value = context.value.workflows?.ok ? '' : context.value.workflows?.issues?.map(issue => issue.message).join('\n');
    return context.value.workflows;
  }

  async function seed({ workflows, entities, commands } = {}) {
    const compiled = rebuild({ workflows, entities, commands });
    if (!compiled.ok) return { ok: false, issues: compiled.issues };

    loading.value = true;
    error.value = '';
    try {
      const result = await $fetch('/api/workbench/fixtures/seed', {
        method: 'POST',
        body: {
          scenario: scenario.value,
          workflows: compiled.machines,
          context: context.value
        }
      });
      context.value = normalizeWorkbenchContext(result.context || result.scenario);
      return result;
    } catch (seedError) {
      error.value = seedError?.data?.message || seedError?.message || 'Failed to seed workbench fixture scenario';
      throw seedError;
    } finally {
      loading.value = false;
    }
  }

  function defaultsForAction(actionId) {
    return commandDefaults.value[actionId] || { entities: {}, parameters: {} };
  }

  function upsertEntities(entities = []) {
    context.value = upsertContextEntities(context.value, entities);
  }

  function entity(type, id) {
    return findContextEntity(context.value, type, id);
  }

  return {
    context,
    scenario,
    seeded,
    loading,
    error,
    compiledWorkflows,
    entityOptions,
    refs,
    access,
    commandDefaults,
    rebuild,
    seed,
    defaultsForAction,
    upsertEntities,
    entity
  };
});
