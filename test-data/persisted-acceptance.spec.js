import { describe, expect, it } from 'vitest';
import { cncDomain } from '#packages/domain-cnc/src/index.js';
import {
  canvasToDefinition,
  compileProcessDefinition,
  definitionToCanvas,
  normalizeProcessDefinition,
  resolveRoleAssignmentAccess,
  validateRoundTrip
} from '#packages/processes/src/index.js';
import { filterRootSourceItems } from '#utils/generated-screen-source.js';
import { resolveGeneratedEntityActions } from '../components/generated/action-visibility.js';
import { entitySelectOptions, selectOptionForValue } from '#utils/entity-select.js';
import { resolveArtifactViewer } from '#utils/artifact-viewer.js';
import { STATUS_MAPPINGS } from '#utils/status-engine.js';
import { createPersistedAcceptanceFixture } from './persisted-acceptance.js';

describe('persisted architecture acceptance fixture', () => {
  it('round-trips the current organization, process graph, hierarchy, and DTO blocks', () => {
    const fixture = createPersistedAcceptanceFixture();
    const normalized = normalizeProcessDefinition(fixture.processDefinition.data, cncDomain);

    expect(normalized.dataflowVersion).toBe(4);
    expect(normalized.graph.edges).toHaveLength(2);
    expect(fixture.organization.data.roles).toEqual(fixture.roles);
    expect(fixture.hierarchy.artifact.lineage.projectId).toBe(fixture.hierarchy.project._id);
    for (const entity of [fixture.hierarchy.project, fixture.hierarchy.artifact]) {
      expect(entity).toEqual(expect.objectContaining({ identity: expect.any(Object), origin: expect.any(Object), status: expect.any(Object), lineage: expect.any(Object), data: expect.any(Object) }));
    }
  });

  it('makes Project -> Compose Lineage(projectId) -> Artifact the only hierarchy source', () => {
    const fixture = createPersistedAcceptanceFixture();
    const compiled = compileProcessDefinition(fixture.processDefinition.data, cncDomain, { roles: fixture.roles });
    const access = resolveRoleAssignmentAccess({ compiled, assignment: fixture.assignment, domain: cncDomain });
    const binding = compiled.lineageBindings.find(item => item.childEntityType === 'artifact');
    const home = access.screens.find(screen => screen.template === 'home');
    const artifactSource = home.sources.find(source => source.entityType === 'artifact');

    expect(binding).toMatchObject({
      ancestorEntityType: 'project',
      childEntityType: 'artifact',
      lineageKey: 'projectId',
      sourceNode: 'project_source',
      sourceSocket: 'data:result',
      consumingNode: 'artifact_lineage',
      consumingSocket: 'entry:project'
    });
    expect(artifactSource.lineageBindings).toContainEqual(binding);
    expect(filterRootSourceItems(
      [fixture.hierarchy.artifact],
      artifactSource,
      {
        projects: { source: { entityType: 'project', mode: 'list' }, items: [fixture.hierarchy.project] },
        artifacts: { source: artifactSource, items: [fixture.hierarchy.artifact] }
      }
    )).toEqual([]);

    const projectDetail = access.screens.find(screen => screen.template === 'entityDetail' && screen.entityType === 'project');
    expect(projectDetail.sources).toContainEqual(expect.objectContaining({
      entityType: 'artifact',
      filters: { projectId: '$screen.scope.entityId' }
    }));
  });

  it('persists and reloads the authored graph, connections, and viewport without requiring semantic compilation', () => {
    const fixture = createPersistedAcceptanceFixture();
    const canvas = definitionToCanvas(fixture.processDefinition.data);
    const saved = canvasToDefinition(canvas, fixture.processDefinition.data);

    expect(saved.graph.edges.map(edge => edge.id)).toEqual([
      'project-to-artifact-lineage',
      'artifact-lineage-to-create'
    ]);
    expect(saved.graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(validateRoundTrip(saved)).toEqual(expect.objectContaining({ ok: true }));
  });

  it('compiles role-owned generated actions into the project child region and not the artifact header', () => {
    const fixture = createPersistedAcceptanceFixture();
    const compiled = compileProcessDefinition(fixture.processDefinition.data, cncDomain, { roles: fixture.roles });
    const access = resolveRoleAssignmentAccess({ compiled, assignment: fixture.assignment, domain: cncDomain });
    const projectDetail = access.screens.find(screen => screen.template === 'entityDetail' && screen.entityType === 'project');
    const artifactRegion = projectDetail.regions.find(region => region.sourceId === 'artifact_children');
    const artifactDetail = access.screens.find(screen => screen.template === 'entityDetail' && screen.entityType === 'artifact');

    expect(compiled.actions.create_artifact).toEqual(expect.objectContaining({
      actionKind: 'createEntity',
      entityType: 'artifact',
      parentEntityType: 'project',
      access: expect.objectContaining({ roleIds: [fixture.assignment.roleIds[0]] })
    }));
    expect(artifactRegion.actions).toContain('create_artifact');
    expect(artifactDetail.actions).not.toContain('create_artifact');
    expect(resolveGeneratedEntityActions({
      actionIds: artifactRegion.actions,
      actionManifest: access.actions,
      entity: fixture.hierarchy.project,
      entityType: 'project'
    }).map(action => action.actionId || action.id)).toContain('create_artifact');
  });

  it('drives selectors, status, and artifact viewing from the persisted DTO and canonical projections', () => {
    const fixture = createPersistedAcceptanceFixture();
    const options = [
      { label: fixture.hierarchy.project.identity.name, value: fixture.hierarchy.project._id, entity: fixture.hierarchy.project, entityType: 'project' }
    ];
    const selected = selectOptionForValue(options, fixture.hierarchy.project._id, 'value');
    const domainUi = {
      getAttachmentPreview: kind => cncDomain.attachmentKinds[kind]?.preview || { mode: 'attachment' },
      getDownloadEndpoint: (_type, id) => `/api/artifacts/${id}`
    };
    const viewer = resolveArtifactViewer({ artifact: fixture.hierarchy.artifact, domainUi });

    expect(selected.entity._id).toBe(fixture.hierarchy.project._id);
    expect(entitySelectOptions(options, 'project')).toHaveLength(1);
    expect(STATUS_MAPPINGS.DRAFT).toEqual(expect.objectContaining({ severity: expect.any(String) }));
    expect(viewer).toEqual(expect.objectContaining({ hasFile: true, mode: 'dxf', fileUrl: `/api/artifacts/${fixture.hierarchy.artifact._id}` }));
  });
});
