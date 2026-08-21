import { describe, it, expect } from 'vitest';
import { deriveRoleAccessSummary, flattenRoleAccessSummary } from './role-access-summary.js';

const processData = {
  data: {
    entityProfiles: {
      sheetProfile: {
        entityType: 'sheets',
        label: 'Sheet',
        allowedRoles: { read: ['viewer', 'cutter'], write: ['cutter'], admin: [] }
      }
    },
    screens: {
      sheetList: {
        id: 'sheetList',
        label: 'Sheets',
        roleIds: ['cutter'],
        required: { feature: 'sheets', level: 'read' }
      },
      queueBoard: {
        id: 'queueBoard',
        label: 'Queue board',
        roleIds: ['viewer', 'cutter']
      }
    },
    actions: {
      millSheet: {
        id: 'millSheet',
        actionKind: 'updateEntity',
        entityType: 'sheets',
        access: { roleIds: ['cutter'], level: 'write', statusFrom: 'CREATED', statusTo: 'MILLED' }
      },
      archiveSheet: {
        id: 'archiveSheet',
        actionKind: 'updateEntity',
        entityType: 'sheets',
        access: { roleIds: ['cutter'] }
      },
      orphanUpdate: {
        id: 'orphanUpdate',
        actionKind: 'updateEntity',
        access: { roleIds: ['cutter'], level: 'write' }
      }
    },
    compiled: {
      workflows: {
        sheets: {
          regions: {
            main: {
              transitions: [
                { from: 'CREATED', to: 'MILLED', processRoleIds: ['cutter'] },
                { from: 'MILLED', to: 'ARCHIVED', access: { processRoleIds: ['viewer'] } }
              ]
            }
          }
        }
      }
    }
  }
};

describe('deriveRoleAccessSummary', () => {
  it('annotates profile lines with the authored entity profile record', () => {
    const summary = deriveRoleAccessSummary({ process: processData, roleIds: ['cutter'] });
    expect(summary.profiles.map(line => line.text)).toEqual(['sheets:read', 'sheets:write']);
    for (const line of summary.profiles) {
      expect(line.contributor.kind).toBe('authored-grant');
      expect(line.contributor.ref).toContain('entityProfiles.sheetProfile');
    }
  });

  it('labels screen requirements as consumers of separately authored access', () => {
    const summary = deriveRoleAccessSummary({ process: processData, roleIds: ['cutter'] });
    const byKey = Object.fromEntries(summary.screens.map(line => [line.key, line]));
    expect(byKey['screen:sheetList'].text).toBe('sheets:read');
    expect(byKey['screen:sheetList'].contributor.kind).toBe('screen-requirement');
    expect(byKey['screen:sheetList'].contributor.label).toContain('Sheets');
    expect(byKey['screen:queueBoard'].text).toBe('queueBoard:screen');
    expect(byKey['screen:queueBoard'].contributor.kind).toBe('level-fallback');
  });

  it('annotates action lines with rule windows and level fallbacks', () => {
    const summary = deriveRoleAccessSummary({ process: processData, roleIds: ['cutter'] });
    const byKey = Object.fromEntries(summary.actions.map(line => [line.key, line]));
    expect(byKey['action:millSheet'].text).toBe('sheets:write when MILLED');
    expect(byKey['action:millSheet'].contributor.kind).toBe('rule');
    expect(byKey['action:millSheet'].contributor.ref).toBe('actions.millSheet.access');
    expect(byKey['action:archiveSheet'].text).toBe('sheets:write');
    expect(byKey['action:archiveSheet'].contributor.kind).toBe('level-fallback');
    expect(byKey['action:orphanUpdate']).toBeUndefined();
  });

  it('covers workflow transitions from the compiled contract', () => {
    const summary = deriveRoleAccessSummary({ process: processData, roleIds: ['cutter'] });
    expect(summary.transitions.map(line => line.text)).toEqual(['sheets:CREATED->MILLED']);
    expect(summary.transitions[0].contributor.kind).toBe('authored-grant');
    expect(summary.transitions[0].contributor.label).toContain('sheets CREATED->MILLED');
  });

  it('reads transitions from designer custom lifecycle workflows', () => {
    const process = {
      data: {
        entityProfiles: {
          queueProfile: {
            entityType: 'queues',
            lifecycle: {
              mode: 'custom',
              workflow: {
                regions: {
                  main: {
                    transitions: [{ from: 'OPEN', to: 'CLOSED', access: { processRoleIds: ['viewer'] } }]
                  }
                }
              }
            }
          }
        }
      }
    };
    const summary = deriveRoleAccessSummary({ process, roleIds: ['viewer'] });
    expect(summary.transitions.map(line => line.text)).toEqual(['queues:OPEN->CLOSED']);
    expect(summary.transitions[0].contributor.ref).toContain('entityProfiles.queueProfile');
  });

  it('unions contributions across additive roles and dedupes lines', () => {
    const summary = deriveRoleAccessSummary({ process: processData, roleIds: ['viewer', 'cutter'] });
    expect(summary.profiles.map(line => line.text)).toEqual(['sheets:read', 'sheets:write']);
    expect(summary.transitions.map(line => line.text)).toEqual(['sheets:CREATED->MILLED', 'sheets:MILLED->ARCHIVED']);
    const flat = flattenRoleAccessSummary(summary);
    expect(new Set(flat.map(line => line.key)).size).toBe(flat.length);
  });

  it('returns an empty structure without matching roles', () => {
    const summary = deriveRoleAccessSummary({ process: processData, roleIds: ['stranger'] });
    expect(flattenRoleAccessSummary(summary)).toEqual([]);
  });
});
