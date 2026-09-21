// Real-pipeline hydration for the UI mapping showcase: instead of a random
// world, this module hydrates the mapping layer from ACTUAL data —
//   bundle    = the real CTS registry (CNC starter pack) through the real
//               `compileClientBundle`, plus minimal synthesized type records
//               for fixture entities the pack does not type yet (artifact);
//   contract  = the REAL process compiler (`compileProcessDefinition` +
//               `resolveRoleAssignmentAccess`) over the persisted acceptance
//               fixture, projected from the compiler's entity vocabulary to
//               the CTS vocabulary this layer consumes;
//   instances = the fixture's real v24 block DTOs (project, artifact)
//               projected into the CTS stored shape.
// The bridge is mechanical projection only — the mapping layer itself stays
// domain-blind.

import { createTypeRegistry, compileClientBundle } from '#packages/cts/src/index.js';
import { cncTypePack } from '#packages/cts/src/pack/cnc.js';
import { compileProcessDefinition, resolveRoleAssignmentAccess } from '#packages/processes/src/index.js';
import { cncDomain } from '#packages/domain-cnc/src/index.js';
import { createPersistedAcceptanceFixture } from './persisted-acceptance.js';

function projectActionKind(kind) {
  return {
    createEntity: 'createInstance',
    updateEntity: 'updateInstance',
    deleteEntity: 'deleteInstance',
    link: 'link',
    unlink: 'unlink',
    runCommand: 'runCommand',
    sendToOrganization: 'sendToOrganization'
  }[kind] || kind;
}

function projectScreen(screen, actionsBySourceId) {
  const sources = (screen.sources || []).map((source) => {
    const projected = { id: source.id, typeId: source.typeId, mode: source.mode || 'list' };
    if (source.required) projected.required = source.required;
    if (source.identifier) projected.identifier = source.identifier;
    // Compiler detail filters ({ lineageKey: '$screen.scope.entityId' })
    // become lineage-scoped lists against the single source.
    const filterEntries = Object.entries(source.filters || {});
    const singleSource = (screen.sources || []).find(item => item.mode === 'single');
    if (filterEntries.length && singleSource) {
      projected.lineage = { sourceId: singleSource.id, key: filterEntries[0][0] };
    }
    return projected;
  });
  const bySource = new Map(sources.map(source => [source.id, source]));
  const regions = (screen.regions || []).map(region => ({
    id: region.id,
    slot: region.slot,
    sourceId: region.sourceId,
    surface: region.surface,
    actions: (region.actions || []).map(id => id)
  }));
  const projected = {
    ...screen,
    template: screen.template === 'typeList' ? 'typeList'
      : screen.template === 'instanceDetail' ? 'instanceDetail' : screen.template,
    typeId: screen.typeId ?? null,
    scope: screen.scope ? { instanceId: screen.scope.entityId ?? null } : {},
    sources,
    regions,
    actions: (screen.actions || [])
  };
  delete projected.typeId;
  return projected;
}

function synthesizeArtifactType(projectRender) {
  return {
    id: 'artifact',
    class: 'file',
    version: 1,
    payload: { mime: ['application/octet-stream'], preview: 'attachment' },
    fields: {
      name: { base: 'string', label: 'Name' },
      fileName: { base: 'string', label: 'File name', nullable: true },
      kind: { base: 'string', label: 'Kind', nullable: true }
    },
    edges: { relations: {} },
    states: {},
    transitions: [],
    operators: {},
    revisions: null,
    schema: null,
    render: { label: 'Artifact', icon: 'pi pi-file', identityField: 'name' }
  };
}

function projectInstance(dto, typeId, renderPolicy) {
  const data = dto.data || {};
  return {
    id: dto._id,
    type: typeId,
    typeVersion: 1,
    fields: {
      name: dto.identity?.name ?? dto._id,
      ...Object.fromEntries(Object.entries(data).map(([key, value]) => [
        key,
        typeof value === 'object' && value !== null ? value : value
      ]))
    },
    lineage: Object.fromEntries(Object.entries(dto.lineage || {})
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, { type: key === 'projectId' ? 'project' : 'organization', id: value }])),
    relations: {},
    states: dto.status?.state?.primary ? { main: dto.status.state.primary } : {},
    payload: null
  };
}

export function createRealUiMappingWorld() {
  const fixture = createPersistedAcceptanceFixture();
  const compiled = compileProcessDefinition(fixture.processDefinition.data, cncDomain, { roles: fixture.roles });
  const access = resolveRoleAssignmentAccess({ compiled, assignment: fixture.assignment, domain: cncDomain });

  const registry = createTypeRegistry({ id: 'ui-mapping-real' });
  for (const type of cncTypePack) registry.defineType(type);
  registry.defineType(synthesizeArtifactType());

  const bundle = JSON.parse(JSON.stringify(compileClientBundle(registry)));
  // compileClientBundle attaches render policy; synthesized types already carry theirs.

  const actions = {};
  for (const action of Object.values(access.actions || {})) {
    actions[action.id] = {
      ...action,
      actionKind: projectActionKind(action.actionKind),
      typeId: action.typeId,
      trigger: action.trigger || { mode: 'manual' }
    };
  }

  const screens = {};
  for (const screen of access.screens || []) {
    const projected = projectScreen(screen);
    screens[projected.screenKey || projected.id] = projected;
  }

  const instances = {
    project: [projectInstance(fixture.hierarchy.project, 'project')],
    facade: [projectInstance(fixture.hierarchy.facade, 'facade')]
  };

  return {
    bundle,
    contract: {
      processId: fixture.processDefinition.data.id,
      dataflowVersion: 4,
      roles: fixture.roles,
      screens,
      actions,
      navigation: []
    },
    instances,
    source: 'real'
  };
}
