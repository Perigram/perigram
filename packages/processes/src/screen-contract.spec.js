import { describe, expect, it } from 'vitest';
import {
  compileProcessDefinition,
  validateProcessDefinition
} from './index.js';
import {
  normalizeScreenContract,
  SCREEN_REGION_SURFACES,
  validateScreenContract
} from './screen-contract.js';

const ENTITIES = new Set(['project']);
const ACTIONS = { create_project: { id: 'create_project' } };

function validate(screen, options = {}) {
  const errors = [];
  validateScreenContract(screen, {
    screenId: screen?.id || 'screen',
    entities: ENTITIES,
    actions: ACTIONS,
    errors,
    ...options
  });
  return errors;
}

function validListScreen() {
  return {
    id: 'projects',
    template: 'entityList',
    entityType: 'project',
    bindings: { projectId: '$assignment.projectId' },
    sources: [{
      id: 'projects',
      entityType: 'project',
      mode: 'list',
      filters: { projectId: '$assignment.projectId', status: 'active', open: true, limit: 10 }
    }],
    regions: [{ id: 'main', slot: 'main', sourceId: 'projects', surface: 'table', actions: ['create_project'] }],
    actions: ['create_project']
  };
}

describe('screen contract normalization', () => {
  it('does not dereference nullable compiled screen entries', () => {
    expect(normalizeScreenContract(null)).toEqual({
      template: 'formAction',
      sources: [],
      regions: [],
      actions: []
    });
  });

  it('reports a malformed screen instead of throwing', () => {
    const errors = [];

    validateScreenContract(null, { screenId: 'broken', errors });

    expect(errors).toContain('Screen broken must be an object');
    expect(() => validateScreenContract(null)).not.toThrow();
  });
});

describe('validateScreenContract', () => {
  it('accepts a complete valid list screen', () => {
    expect(validate(validListScreen())).toEqual([]);
  });

  it('exports the canonical region surface registry', () => {
    expect(SCREEN_REGION_SURFACES).toEqual(['card', 'compact', 'detail', 'table', 'workspace']);
  });

  it('rejects duplicate source ids', () => {
    const screen = validListScreen();
    screen.sources.push({ id: 'projects', entityType: 'project', mode: 'list' });

    expect(validate(screen)).toContain('Screen projects has duplicate source id projects');
  });

  it('rejects duplicate region ids', () => {
    const screen = validListScreen();
    screen.regions.push({ id: 'main', slot: 'supporting', sourceId: 'projects', surface: 'card' });

    expect(validate(screen)).toContain('Screen projects has duplicate region id main');
  });

  it('requires an identifier for single-mode sources', () => {
    const errors = validate({
      id: 'detail',
      template: 'entityDetail',
      entityType: 'project',
      sources: [{ id: 'project', entityType: 'project', mode: 'single' }]
    });

    expect(errors).toContain('Screen detail source project is single-mode and must define an identifier');
  });

  it('accepts single-mode identifiers derived from screen scope or bindings', () => {
    expect(validate({
      id: 'detail',
      template: 'entityDetail',
      entityType: 'project',
      bindings: { projectId: '$assignment.projectId' },
      sources: [{ id: 'project', entityType: 'project', mode: 'single' }]
    })).toEqual([]);
  });

  it('rejects non-scalar single-mode identifiers', () => {
    const errors = validate({
      id: 'detail',
      template: 'entityDetail',
      entityType: 'project',
      sources: [{ id: 'project', entityType: 'project', mode: 'single', identifier: { id: 'x' } }]
    });

    expect(errors).toContain('Screen detail source project identifier must be a scalar or $screen/$assignment placeholder');
  });

  it('resolves $screen.bindings identifiers against declared bindings', () => {
    const screen = {
      id: 'detail',
      template: 'entityDetail',
      entityType: 'project',
      bindings: { projectId: '$assignment.projectId' },
      sources: [{ id: 'project', entityType: 'project', mode: 'single', identifier: '$screen.bindings.projectId' }]
    };
    expect(validate(screen)).toEqual([]);

    screen.sources[0].identifier = '$screen.bindings.missingId';
    expect(validate(screen)).toContain('Screen detail source project identifier references undeclared binding missingId');
  });

  it('rejects non-object filter maps', () => {
    const screen = validListScreen();
    screen.sources[0].filters = 'status:active';

    expect(validate(screen)).toContain('Screen projects source projects filters must be an object');
  });

  it('rejects non-scalar filter values', () => {
    const screen = validListScreen();
    screen.sources[0].filters = { status: { nested: true }, flags: ['a'] };

    const errors = validate(screen);
    expect(errors).toContain('Screen projects source projects filter status must be a scalar or $screen/$assignment placeholder');
    expect(errors).toContain('Screen projects source projects filter flags must be a scalar or $screen/$assignment placeholder');
  });

  it('rejects empty placeholder references in filters', () => {
    const screen = validListScreen();
    screen.sources[0].filters = { projectId: '$assignment.', status: '$screen.' };

    const errors = validate(screen);
    expect(errors).toContain('Screen projects source projects filter projectId uses an empty $assignment reference');
    expect(errors).toContain('Screen projects source projects filter status uses an empty $screen reference');
  });

  it('rejects filter placeholders that reference undeclared bindings', () => {
    const screen = validListScreen();
    screen.sources[0].filters = { projectId: '$screen.bindings.missingId' };

    expect(validate(screen)).toContain('Screen projects source projects filter projectId references undeclared binding missingId');
  });

  it('rejects region surfaces outside the registry', () => {
    const screen = validListScreen();
    screen.regions[0].surface = 'grid';

    expect(validate(screen)).toContain('Screen projects region main uses unknown surface grid');
  });

  it('accepts every registered region surface', () => {
    for (const surface of SCREEN_REGION_SURFACES) {
      const screen = validListScreen();
      screen.regions[0].surface = surface;
      expect(validate(screen)).toEqual([]);
    }
  });

  it('rejects region action ids that do not exist', () => {
    const screen = validListScreen();
    screen.regions[0].actions = ['missing_action'];

    expect(validate(screen)).toContain('Screen projects region main references missing action missing_action');
  });

  it('rejects workspaceLanes regions in slots the template does not render', () => {
    const errors = validate({
      id: 'lanes',
      template: 'workspaceLanes',
      entityType: 'project',
      sources: [{ id: 'projects', entityType: 'project', mode: 'list' }],
      regions: [{ id: 'side', slot: 'supporting', sourceId: 'projects', surface: 'card' }]
    });

    expect(errors).toContain('Screen lanes region side uses slot supporting that template workspaceLanes does not render');
  });

  it('rejects duplicate slots in workspaceLanes regions', () => {
    const errors = validate({
      id: 'lanes',
      template: 'workspaceLanes',
      entityType: 'project',
      sources: [{ id: 'projects', entityType: 'project', mode: 'list' }],
      regions: [
        { id: 'first', slot: 'left', sourceId: 'projects', surface: 'card' },
        { id: 'second', slot: 'left', sourceId: 'projects', surface: 'compact' }
      ]
    });

    expect(errors).toContain('Screen lanes template workspaceLanes allows only one region per slot (left)');
  });

  it('accepts distinct workspaceLanes slots', () => {
    expect(validate({
      id: 'lanes',
      template: 'workspaceLanes',
      entityType: 'project',
      sources: [{ id: 'projects', entityType: 'project', mode: 'list' }],
      regions: [
        { id: 'first', slot: 'left', sourceId: 'projects', surface: 'card' },
        { id: 'second', slot: 'right', sourceId: 'projects', surface: 'table' }
      ]
    })).toEqual([]);
  });

  it('rejects non-object screen bindings', () => {
    const screen = validListScreen();
    screen.bindings = ['projectId'];

    expect(validate(screen)).toContain('Screen projects bindings must be an object');
  });

  it('rejects statically unresolvable screen bindings', () => {
    const screen = validListScreen();
    screen.bindings = {
      empty: '',
      nested: { id: 'x' },
      missing: null,
      literal: 'project-1',
      assigned: '$assignment.projectId'
    };

    const errors = validate(screen);
    expect(errors).toContain('Screen projects binding empty must be a literal value or $assignment reference');
    expect(errors).toContain('Screen projects binding nested must be a literal value or $assignment reference');
    expect(errors).toContain('Screen projects binding missing must be a literal value or $assignment reference');
    expect(errors.some(error => error.includes('binding literal'))).toBe(false);
    expect(errors.some(error => error.includes('binding assigned'))).toBe(false);
  });
});

describe('activation enforcement', () => {
  const domain = { entities: [{ type: 'project' }] };

  it('validateProcessDefinition rejects malformed screen shapes before activation', () => {
    const validation = validateProcessDefinition({
      screens: {
        broken: {
          id: 'broken',
          route: '/broken',
          template: 'workspaceLanes',
          entityType: 'project',
          bindings: { nested: { nope: true } },
          sources: [
            { id: 'projects', entityType: 'project', mode: 'list', filters: { status: { nested: true } } },
            { id: 'projects', entityType: 'project', mode: 'list' },
            { id: 'project', entityType: 'project', mode: 'single' }
          ],
          regions: [
            { id: 'lane', slot: 'supporting', sourceId: 'projects', surface: 'grid', actions: ['missing_action'] },
            { id: 'lane', slot: 'left', sourceId: 'projects', surface: 'card' },
            { id: 'other', slot: 'left', sourceId: 'projects', surface: 'card' }
          ]
        }
      }
    }, domain);

    const report = validation.errors.join('\n');
    expect(validation.ok).toBe(false);
    expect(report).toContain('duplicate source id projects');
    expect(report).toContain('duplicate region id lane');
    expect(report).toContain('source project is single-mode and must define an identifier');
    expect(report).toContain('filter status must be a scalar');
    expect(report).toContain('uses unknown surface grid');
    expect(report).toContain('region lane references missing action missing_action');
    expect(report).toContain('uses slot supporting that template workspaceLanes does not render');
    expect(report).toContain('allows only one region per slot (left)');
    expect(report).toContain('binding nested must be a literal value or $assignment reference');
  });

  it('compileProcessDefinition throws on malformed screens', () => {
    expect(() => compileProcessDefinition({
      screens: {
        broken: {
          id: 'broken',
          route: '/broken',
          template: 'entityDetail',
          entityType: 'project',
          sources: [{ id: 'project', entityType: 'project', mode: 'single' }]
        }
      }
    }, domain)).toThrow(/must define an identifier/);
  });
});
