import { describe, expect, it } from 'vitest';
import { cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import { compileWorkflowDraft } from '~/utils/workflow-compiler.js';
import { createCncFixtureScenario, validateCncFixtureScenario } from './scenarios.js';
import { contextToScenario, createWorkbenchContext, findContextEntity, upsertContextEntities } from './workbench-context.js';

describe('CNC fixture scenarios', () => {
  it('creates an interlinked scenario with workflow-backed statuses', () => {
    const compiled = compileWorkflowDraft({ workflows: cncWorkflows });
    const scenario = createCncFixtureScenario({ workflows: compiled.machines });

    expect(compiled.ok).toBe(true);
    expect(scenario.refs.queue).toBeTruthy();
    expect(scenario.refs.sheetDesign).toBeTruthy();
    expect(scenario.entities.queue[0].data.job.items[0].id).toBe(scenario.refs.cassetteTemplate);
    expect(scenario.entities.sheet_design[0].data.placements[0].cassetteDesignId).toBe(scenario.refs.cassetteDesign);
    expect(scenario.entities.layer_standard[0].data.defaultPenId).toBe(scenario.refs.penTemplate);

    for (const [type, entities] of Object.entries(scenario.entities)) {
      if (!compiled.machines[type]) continue;
      for (const entity of entities) {
        expect(compiled.machines[type].states[entity.status.state], `${type}:${entity._id}`).toBeTruthy();
      }
    }

    expect(validateCncFixtureScenario(scenario, compiled.machines).ok).toBe(true);
  });

  it('derives action defaults and access from the same scenario context', () => {
    const scenario = createCncFixtureScenario();
    expect(scenario.manifests.commandDefaults.solveNesting.entities.queue).toBe(scenario.refs.queue);
    expect(scenario.manifests.commandDefaults.generateAttachment.entities.sheetDesign).toBe(scenario.refs.sheetDesign);
    expect(scenario.access.permissions.queues).toBe('admin');
    expect(scenario.access.permissions.artifacts).toBe('admin');
    expect(scenario.access.permissions.cassettes).toBe('admin');
  });

  it('keeps workbench data in one entity context and projects scenarios only for persistence', () => {
    const context = createWorkbenchContext();
    const queue = findContextEntity(context, 'queue', context.refs.queue);
    const scenario = contextToScenario(context);

    expect(queue?._id).toBe(context.refs.queue);
    expect(scenario.entities.queue[0]._id).toBe(context.refs.queue);
    expect(scenario.manifests.commandDefaults.solveNesting.entities.queue).toBe(context.refs.queue);
  });

  it('adds command outputs to the same context instead of a separate runtime source', () => {
    const context = createWorkbenchContext();
    const next = upsertContextEntities(context, [{
      type: 'sheet_design',
      entity: {
        ...findContextEntity(context, 'sheet_design', context.refs.sheetDesign),
        _id: 'sheet-design-generated-001',
        identity: { uid: 'sheet-design-generated-001', name: 'Generated sheet design' }
      }
    }]);

    expect(findContextEntity(next, 'sheet_design', 'sheet-design-generated-001')?.identity.name).toBe('Generated sheet design');
    expect(contextToScenario(next).entities.sheet_design.some(entity => entity._id === 'sheet-design-generated-001')).toBe(true);
  });
});
