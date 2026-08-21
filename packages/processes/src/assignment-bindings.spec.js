import { describe, expect, it } from 'vitest';
import { discoverAssignmentBindingRequirements } from './assignment-bindings.js';

describe('discoverAssignmentBindingRequirements', () => {
  it('discovers typed assignment keys from every canonical grant and screen location', () => {
    const requirements = discoverAssignmentBindingRequirements({
      roleIds: ['operator'],
      bindings: { limit: 4, enabled: true },
      process: {
        roleGrants: {
          operator: [{
            feature: 'queues', level: 'read',
            scope: { projectId: '$assignment.projectId' },
            rule: { all: [{ fact: 'status.primary', equals: '$assignment.status' }, { fact: 'context.limit', equals: '$assignment.limit' }] }
          }]
        },
        actions: {
          run: { access: { grants: [{ roleId: 'operator', level: 'write', rule: { fact: 'context.enabled', equals: '$assignment.enabled' } }] } }
        },
        processNodes: {
          effect: { access: { grants: [{ roleId: 'operator', level: 'write', scope: { queueId: '$assignment.effectQueueId' } }] } }
        },
        screens: {
          queue: {
            roleIds: ['operator'], route: '/project/$assignment.projectSlug',
            scope: { queueId: '$assignment.queueId' }, bindings: { tab: '$assignment.tab' },
            required: { feature: 'queues', level: 'read', rule: { fact: 'lineage.projectId', equals: '$assignment.requiredProjectId' } },
            sources: [
              { identifier: '$assignment.entityId', required: { scope: { projectId: '$assignment.sourceProjectId' } } },
              { filters: { ownerId: '$assignment.ownerId' } }
            ]
          }
        }
      }
    });
    const byKey = Object.fromEntries(requirements.map(item => [item.key, item]));
    expect(Object.keys(byKey)).toEqual(expect.arrayContaining([
      'projectId', 'status', 'limit', 'enabled', 'projectSlug', 'queueId', 'tab',
      'requiredProjectId', 'entityId', 'sourceProjectId', 'ownerId', 'effectQueueId'
    ]));
    expect(byKey.limit.type).toBe('number');
    expect(byKey.enabled.type).toBe('boolean');
    expect(byKey.entityId.locations[0]).toContain('identifier');
    expect(byKey.ownerId.locations[0]).toContain('filters');
  });
});
