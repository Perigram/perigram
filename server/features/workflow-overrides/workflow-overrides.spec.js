import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository.js', () => ({
  findActiveByEntity: vi.fn()
}));

vi.mock('~/server/features/process-definitions/runtime.js', () => ({
  resolveProcessWorkflow: vi.fn(async () => null),
  getActiveCompiledProcess: vi.fn(async () => null)
}));

import * as repository from './repository.js';
import * as service from './service.js';
import { resolveProcessWorkflow, getActiveCompiledProcess } from '~/server/features/process-definitions/runtime.js';

const auth = {
  userId: 'user-1',
  memberships: [{
    organizationId: '665000000000000000000001',
    permissions: { projects: 'admin' }
  }]
};

describe('workflow overrides service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves active override before default workflow', async () => {
    repository.findActiveByEntity.mockResolvedValue({
      workflow: {
        initial: 'CUSTOM',
        states: { CUSTOM: {}, DONE: {} },
        transitions: [{ from: 'CUSTOM', to: 'DONE' }]
      }
    });

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(workflow.initial).toBe('CUSTOM');
  });

  it('resolves no machine when no process output or override exists', async () => {
    repository.findActiveByEntity.mockResolvedValue(null);
    getActiveCompiledProcess.mockResolvedValue({ producerOutputs: {} });

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    // Machines are graph-derived (SPEC §7): with no compiled producer
    // output and no organization override there is deliberately no
    // machine — creation through the status runtime must fail loudly.
    expect(workflow).toBeNull();
    expect(resolveProcessWorkflow).not.toHaveBeenCalled();
  });

  it('resolves a process workflow only with explicit producer output context', async () => {
    resolveProcessWorkflow.mockResolvedValueOnce({
      initial: 'PROCESS',
      states: { PROCESS: {} },
      transitions: []
    });

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId,
      producerOutputId: 'create_project:result'
    });

    expect(resolveProcessWorkflow).toHaveBeenCalledWith({
      organizationId: auth.memberships[0].organizationId,
      producerOutputId: 'create_project:result',
      typeId: 'project',
      fallbackWorkflow: null
    });
    expect(workflow.initial).toBe('PROCESS');
  });

  it('serves the compiled process workflow verbatim', async () => {
    resolveProcessWorkflow.mockResolvedValueOnce({
      initial: 'NEW',
      states: { NEW: {} },
      transitions: []
    });
    repository.findActiveByEntity.mockResolvedValue(null);
    const workflow = await service.resolveActiveWorkflow({
      typeId: 'drawing',
      organizationId: auth.memberships[0].organizationId,
      producerOutputId: 'generate_drawing:result'
    });

    // The compiled process contract is the machine source (SPEC §7): no
    // system-transition merging, no declaration fallbacks.
    expect(workflow.initial).toBe('NEW');
    expect(workflow.transitions).toEqual([]);
  });

  it('resolves the compiled machine by type when the caller names no producer', async () => {
    // The plain transition channel carries no producer context: the
    // active process's first producer of the type serves its machine, or
    // org-authored stateful types resolve no machine at all.
    getActiveCompiledProcess.mockResolvedValue({
      producerOutputs: {
        'make:entity': { producerOutputId: 'make:entity', typeId: 'project', workflow: null },
        'other:entity': { producerOutputId: 'other:entity', typeId: 'gadget', workflow: { initial: 'OTHER' } },
        'seed:entity': {
          producerOutputId: 'seed:entity',
          typeId: 'project',
          workflow: {
            initial: 'SEEDED',
            states: { SEEDED: {}, DONE: {} },
            transitions: [{ from: 'SEEDED', to: 'DONE' }]
          }
        }
      }
    });
    repository.findActiveByEntity.mockResolvedValue(null);

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(getActiveCompiledProcess).toHaveBeenCalledWith(auth.memberships[0].organizationId);
    expect(workflow.initial).toBe('SEEDED');
    expect(workflow.schemaVersion).toBe(2);
    // An organization override never wins over the active process: the
    // process is the authored lifecycle, the override is the escape hatch
    // for types the process does not govern.
    repository.findActiveByEntity.mockResolvedValue({ workflow: { initial: 'CUSTOM', states: { CUSTOM: {} }, transitions: [] } });
    const overridden = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });
    expect(overridden.initial).toBe('SEEDED');
  });

  it('falls through an empty compiled process to the organization override', async () => {
    getActiveCompiledProcess.mockResolvedValueOnce({ producerOutputs: {} });
    repository.findActiveByEntity.mockResolvedValue({
      workflow: { initial: 'OVERRIDE', states: { OVERRIDE: {} }, transitions: [] }
    });

    const workflow = await service.resolveActiveWorkflow({
      typeId: 'project',
      organizationId: auth.memberships[0].organizationId
    });

    expect(workflow.initial).toBe('OVERRIDE');
  });
});
