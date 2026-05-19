import { describe, expect, it } from 'vitest';
import { cncEntities, cncFrontendEntities, cncSummaries, cncWorkflows } from '../packages/domain-cnc/src/index.js';
import {
  buildWorkflowGraph,
  createDomainDraft,
  generateDomainCncSource,
  validateDomainDraft
} from './domain-builder.js';

describe('domain builder utilities', () => {
  it('validates the current CNC domain definitions', () => {
    const draft = createDomainDraft({
      entities: cncEntities,
      frontendEntities: cncFrontendEntities,
      workflows: cncWorkflows,
      summaries: cncSummaries
    });

    expect(validateDomainDraft(draft).ok).toBe(true);
  });

  it('rejects duplicate entities and invalid workflow states', () => {
    const draft = createDomainDraft({
      entities: [
        { type: 'queue', collection: 'queues', blocks: ['identity', 'status'] },
        { type: 'queue', collection: 'queues_copy', blocks: ['identity', 'status'] }
      ],
      frontendEntities: [],
      workflows: {
        queue: {
          initial: 'MISSING',
          states: { DRAFT: {} },
          transitions: [{ from: 'DRAFT', to: 'READY', roles: ['ADMIN'] }]
        }
      },
      summaries: []
    });

    const messages = validateDomainDraft(draft).issues.map(issue => issue.message);
    expect(messages).toContain('Duplicate entity type: queue');
    expect(messages).toContain('queue initial state does not exist: MISSING');
    expect(messages).toContain('queue transition #1 has unknown to state: READY');
  });

  it('generates deterministic domain-cnc source exports', () => {
    const source = generateDomainCncSource({
      entities: [{ type: 'queue', collection: 'queues', blocks: ['identity', 'status'] }],
      frontendEntities: [{ type: 'queue', collection: 'queues', routes: { single: '/api/queue/:id', list: '/api/queues' } }],
      workflows: { queue: { initial: 'DRAFT', states: { DRAFT: {} }, transitions: [] } },
      summaries: []
    });

    expect(source).toContain('export const cncEntities = [');
    expect(source).toContain('export const cncWorkflows = {');
    expect(source).toContain('export const cncSummaries = [];');
    expect(source).toContain('export const cncFrontendEntities = [');
    expect(source).toContain("type: 'queue'");
  });

  it('builds graph nodes and edges from workflow transitions', () => {
    const graph = buildWorkflowGraph({
      initial: 'DRAFT',
      states: { DRAFT: {}, READY: { isTerminal: true } },
      transitions: [
        { from: 'DRAFT', to: 'READY', roles: ['ADMIN'] },
        { from: 'READY', to: 'DRAFT', roles: ['ADMIN'] }
      ]
    });

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: 'DRAFT', initial: true }));
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: 'READY', terminal: true }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ index: 0, from: 'DRAFT', to: 'READY', reciprocal: true }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ index: 1, from: 'READY', to: 'DRAFT', reciprocal: true, reverse: true }));
  });
});
