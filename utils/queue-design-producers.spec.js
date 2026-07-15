import { describe, expect, it } from 'vitest';
import { resolveQueueDesignProducers } from './queue-design-producers.js';

const domain = {
  entities: [
    { type: 'cassette_design', collection: 'cassette_designs' },
    { type: 'cassette', collection: 'cassettes' },
    { type: 'artifact', collection: 'artifacts' }
  ],
  producers: [
    {
      id: 'selectExistingCassetteDesign',
      kind: 'entitySource',
      source: { entityType: 'cassette_design' },
      output: { entityType: 'cassette_design' }
    },
    {
      id: 'bakeCassetteDesignFromTemplate',
      kind: 'construction',
      constructionMode: 'bakeCassetteDesignFromTemplate',
      source: { entityType: 'cassette' },
      output: { entityType: 'cassette_design' }
    },
    {
      id: 'importCassetteDesignFromArtifact',
      kind: 'construction',
      constructionMode: 'importCassetteDesignFromArtifact',
      source: { entityType: 'artifact' },
      output: { entityType: 'cassette_design' }
    }
  ]
};

describe('queue design producer resolver', () => {
  it('renders domain producer categories in direct queue-edit mode according to feature access', () => {
    const producers = resolveQueueDesignProducers({
      domain,
      canEditQueue: true,
      hasFeatureAccess: (feature, level) => ({
        cassette_designs: ['read', 'write'],
        cassettes: ['read'],
        artifacts: ['write']
      }[feature]?.includes(level))
    });

    expect(producers.map(producer => producer.id)).toEqual([
      'selectExistingCassetteDesign',
      'bakeCassetteDesignFromTemplate',
      'importCassetteDesignFromArtifact'
    ]);
  });

  it('binds process construction actions to the matching domain producer categories', () => {
    const producers = resolveQueueDesignProducers({
      domain,
      processMode: true,
      processActions: [
        {
          actionId: 'action-bake',
          construction: { mode: 'bakeCassetteDesignFromTemplate' },
          contracts: { outputs: [{ entityType: 'cassette_design' }] }
        },
        {
          actionId: 'action-import',
          construction: { mode: 'importCassetteDesignFromArtifact' },
          contracts: { outputs: [{ entityType: 'cassette_design' }] }
        }
      ],
      hasFeatureAccess: (feature, level) => feature === 'cassette_designs' && level === 'read'
    });

    expect(producers.map(producer => [producer.id, producer.actionId || null])).toEqual([
      ['selectExistingCassetteDesign', null],
      ['bakeCassetteDesignFromTemplate', 'action-bake'],
      ['importCassetteDesignFromArtifact', 'action-import']
    ]);
  });

  it('keeps non-domain process producers as separate menu items', () => {
    const producers = resolveQueueDesignProducers({
      domain,
      processMode: true,
      processActions: [
        {
          actionId: 'action-facade',
          label: 'Create from facade',
          construction: { mode: 'createFromFacade' },
          contracts: { outputs: [{ entityType: 'cassette_design' }] }
        }
      ]
    });

    expect(producers).toEqual([
      expect.objectContaining({
        id: 'action-facade',
        actionId: 'action-facade',
        label: 'Create from facade',
        kind: 'processAction'
      })
    ]);
  });
});
