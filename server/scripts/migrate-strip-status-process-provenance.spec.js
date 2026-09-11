import { describe, expect, it } from 'vitest';
import { statusProvenancePlan, stripStatusProvenance } from './migrate-strip-status-process-provenance.js';

describe('strip status process provenance', () => {
  it('detects every documented provenance key', () => {
    const metadata = Object.fromEntries(
      ['processId', 'processDefinitionId', 'processRunId', 'processNodeId', 'actionId', 'nodeId', 'producerOutputId', 'workflowId']
        .map(key => [key, 'x'])
    );
    expect(statusProvenancePlan(metadata).keys.sort()).toEqual([
      'actionId', 'nodeId', 'processDefinitionId', 'processId', 'processNodeId',
      'processRunId', 'producerOutputId', 'workflowId'
    ].sort());
  });

  it('removes provenance keys and the legacy migration note but keeps display and evidence metadata', () => {
    const status = {
      state: { primary: 'CUT' },
      metadata: {
        note: 'Migrated command output status from active process 6650a',
        processId: '6650a',
        actionId: 'mark_run_cut',
        migratedBy: 'migrate-process-command-output-statuses',
        display: { label: 'Cut', severity: 'info' }
      }
    };
    const result = stripStatusProvenance(status);
    expect(result.changed).toBe(true);
    expect(result.status.metadata).toEqual({
      migratedBy: 'migrate-process-command-output-statuses',
      display: { label: 'Cut', severity: 'info' }
    });
    expect(result.status.state).toEqual({ primary: 'CUT' });
  });

  it('drops the metadata object entirely when nothing legitimate remains', () => {
    const result = stripStatusProvenance({ state: { primary: 'NEW' }, metadata: { processId: 'p1' } });
    expect(result.changed).toBe(true);
    expect(result.status).toEqual({ state: { primary: 'NEW' } });
  });

  it('leaves statuses without process provenance untouched', () => {
    const status = { state: { primary: 'NEW' }, metadata: { note: 'Operator note', lifecycle: { reason: 'rework' } } };
    expect(stripStatusProvenance(status)).toEqual({ status, changed: false });
    expect(stripStatusProvenance({ state: { primary: 'NEW' } })).toEqual({ status: { state: { primary: 'NEW' } }, changed: false });
  });

  it('keeps unrelated notes that merely mention a process', () => {
    const status = { state: { primary: 'NEW' }, metadata: { note: 'Discussed in process review' } };
    expect(stripStatusProvenance(status).changed).toBe(false);
  });
});
