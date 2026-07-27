import { describe, expect, it } from 'vitest';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';
import { repairRequiredCommandProfiles } from './migrate-process-command-profiles.js';

describe('process command profile migration', () => {
  it('adds visible profiles for every entity required by nesting', () => {
    const data = {
      graph: {
        nodes: [{ id: 'solve', type: 'action', position: { x: 100, y: 200 }, data: { refId: 'solve' } }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      },
      roles: { operator: { id: 'operator', label: 'Operator' } },
      entityProfiles: {},
      actions: {
        solve: {
          id: 'solve',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          access: { grants: [{ roleId: 'operator', level: 'write' }] },
          inputs: [],
          outputs: []
        }
      }
    };

    const repaired = repairRequiredCommandProfiles(data, cncDomain);

    expect(Object.values(repaired.entityProfiles).map(profile => profile.entityType)).toEqual([
      'nesting_run',
      'sheet_design',
      'sheet'
    ]);
    expect(repaired.graph.nodes.filter(node => node.type === 'entity')).toHaveLength(3);
    expect(repaired.entityProfiles.entity_sheet.allowedRoles.write).toEqual(['operator']);
    expect(repaired.compiled).toBeNull();
  });

  it('does not rewrite processes whose required profiles already exist', () => {
    const data = {
      actions: {},
      services: {},
      entityProfiles: {}
    };

    expect(repairRequiredCommandProfiles(data, cncDomain)).toBe(data);
  });
});
